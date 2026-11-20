const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { loadTypeScript } = require('./helpers/load-typescript.cjs');

const { P2PSession, TransferCancelledError, FRAME_DATA_BYTES } = loadTypeScript(path.join(__dirname, '..', 'src', 'lib', 'rtc', 'p2p-session.ts'));

class FakeChannel {
  constructor() {
    this.bufferedAmount = 0;
    this.bufferedAmountLowThreshold = 0;
    this.listeners = new Set();
    this.sent = [];
    this.peer = null;
  }

  send(data) {
    this.sent.push(data);
    // Deliver asynchronously and as a copy, like a real data channel.
    const copy = typeof data === 'string' ? data : data.slice(0);
    setImmediate(() => this.peer?.handleMessage(copy));
  }

  addEventListener(type, listener) { if (type === 'bufferedamountlow') this.listeners.add(listener); }
  removeEventListener(type, listener) { this.listeners.delete(listener); }
  drain() { this.bufferedAmount = 0; for (const listener of [...this.listeners]) listener(); }
}

function pair(handlersA = {}, handlersB = {}) {
  const channelA = new FakeChannel();
  const channelB = new FakeChannel();
  const a = new P2PSession(channelA, handlersA);
  const b = new P2PSession(channelB, handlersB);
  channelA.peer = b;
  channelB.peer = a;
  return { a, b, channelA, channelB };
}

function bytes(size, seed = 7) {
  return Uint8Array.from({ length: size }, (_, i) => (i * 31 + seed) % 256);
}

async function bytesOf(blob) {
  return new Uint8Array(await blob.arrayBuffer());
}

test('room request streams a multi-frame file in order with progress and serve completion', async () => {
  const source = new File([bytes(3 * FRAME_DATA_BYTES + 123)], 'video.mp4', { type: 'video/mp4' });
  const served = [];
  const { a, b, channelB } = pair({}, {
    resolveRequest: fileId => fileId === 'file-1' ? source : null,
    onServeProgress: (fileId, sent, size, done) => served.push({ fileId, sent, size, done }),
  });
  const progress = [];
  const blob = await a.requestFile('file-1', (received, size) => progress.push([received, size]));
  assert.equal(blob.type, 'video/mp4');
  assert.deepEqual(await bytesOf(blob), await bytesOf(source));
  assert.deepEqual(progress.at(-1), [source.size, source.size]);
  const frames = channelB.sent.filter(item => typeof item !== 'string');
  assert.equal(frames.length, 4);
  assert.ok(frames.every(frame => frame.byteLength <= 64 * 1024));
  for (let i = 0; i < 5 && !served.some(item => item.done); i++) await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(served.at(-1), { fileId: 'file-1', sent: source.size, size: source.size, done: true });
});

test('room request for a file the sender cannot serve rejects so the caller can fall back to the relay', async () => {
  const { a } = pair({}, { resolveRequest: () => null });
  await assert.rejects(a.requestFile('missing'), /cannot share this file directly/);
});

test('zero-byte files transfer', async () => {
  const { a } = pair({}, { resolveRequest: () => new File([], 'empty.txt', { type: 'text/plain' }) });
  const blob = await a.requestFile('empty');
  assert.equal(blob.size, 0);
});

test('nearby offer waits for acceptance and delivers exact bytes', async () => {
  const source = new File([bytes(200000, 3)], 'photo.jpg', { type: 'image/jpeg' });
  let completed;
  const offers = [];
  const { a } = pair({}, {
    onOffer: async offer => { offers.push(offer); return true; },
    onIncomingComplete: (offer, blob) => { completed = { offer, blob }; },
  });
  const sent = [];
  await a.offerFile(source, value => sent.push(value));
  assert.equal(offers[0].name, 'photo.jpg');
  assert.equal(offers[0].size, source.size);
  assert.deepEqual(await bytesOf(completed.blob), await bytesOf(source));
  assert.equal(sent.at(-1), source.size);
});

test('declined offers reject without sending file data', async () => {
  const { a, channelA } = pair({}, { onOffer: async () => false });
  await assert.rejects(a.offerFile(new File([bytes(10)], 'x.bin')), error => error instanceof TransferCancelledError && /declined/.test(error.message));
  assert.ok(channelA.sent.every(item => typeof item === 'string'));
});

test('receiver cancellation stops the sender', async () => {
  const source = new File([bytes(40 * FRAME_DATA_BYTES)], 'big.bin');
  let session;
  const failures = [];
  const { a, b } = pair({}, {
    onOffer: async () => true,
    onIncomingProgress: offer => { if (session) session.cancel(offer.id, 'Cancelled by the receiver'); },
    onIncomingFailed: (_offer, reason) => failures.push(reason),
  });
  session = b;
  await assert.rejects(a.offerFile(source), error => error instanceof TransferCancelledError);
  assert.deepEqual(failures, ['Cancelled by the receiver']);
});

test('sender pauses while the channel buffer is full and resumes on bufferedamountlow', async () => {
  const source = new File([bytes(2 * FRAME_DATA_BYTES)], 'slow.bin');
  const { a, channelA } = pair({}, { onOffer: async () => true });
  channelA.bufferedAmount = 64 * 1024 * 1024;
  const sending = a.offerFile(source);
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(channelA.sent.filter(item => typeof item !== 'string').length, 0);
  channelA.drain();
  await sending;
  assert.equal(channelA.sent.filter(item => typeof item !== 'string').length, 2);
});

test('closing the connection rejects pending transfers', async () => {
  const { a } = pair({}, { resolveRequest: () => null });
  const request = a.requestFile('never');
  a.close('Direct connection failed');
  await assert.rejects(request, /Direct connection failed/);
  await assert.rejects(a.requestFile('after'), /closed/);
});

test('frames with unknown tags or excess data are rejected', async () => {
  const source = new File([bytes(100)], 'small.bin');
  const failures = [];
  const { a, b } = pair({}, { onOffer: async () => true, onIncomingFailed: (_offer, reason) => failures.push(reason) });
  b.handleMessage(new Uint8Array([0, 0, 0, 99, 1, 2, 3]).buffer);
  await a.offerFile(source);
  assert.deepEqual(failures, []);
});
