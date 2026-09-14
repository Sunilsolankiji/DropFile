const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { setImmediate: turn } = require('node:timers/promises');
const { sha256 } = require('@noble/hashes/sha2.js');
const { bytesToHex } = require('@noble/hashes/utils.js');
const { loadTypeScript } = require('./helpers/load-typescript.cjs');

const { TransferManager } = loadTypeScript(path.join(__dirname, '..', 'src', 'lib', 'transfer-manager.ts'));
const { MemoryTransferStorage } = loadTypeScript(path.join(__dirname, '..', 'src', 'lib', 'transfer-storage.ts'));
const digest = bytes => bytesToHex(sha256(bytes));
const bytesOf = async blob => new Uint8Array(await blob.arrayBuffer());
const sorted = values => [...values].sort((a, b) => a - b);
const uploadFinished = state => state?.state === 'ready'
  && state.uploadedChunkCount === state.totalChunks && state.inFlightChunks.length === 0;

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

async function flush() {
  for (let i = 0; i < 8; i++) await turn();
}

async function until(predicate, message = 'expected transfer progress', advance) {
  for (let i = 0; i < 150; i++) {
    if (predicate()) return;
    await turn();
    if (advance) advance();
  }
  assert.ok(predicate(), message);
}

function source(size = 23, name = 'synthetic.bin', offset = 0) {
  const bytes = Uint8Array.from({ length: size }, (_, i) => (i * 29 + offset) % 256);
  return new File([bytes], name, { type: 'application/octet-stream', lastModified: 123456 });
}

function abortable(signal) {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(signal.reason);
    signal.addEventListener('abort', () => reject(signal.reason), { once: true });
  });
}

class Relay {
  constructor(chunkSize = 4) {
    this.chunkSize = chunkSize;
    this.transfers = new Map();
    this.requests = [];
    this.acks = [];
    this.cancellations = [];
    this.snapshots = [];
  }

  create(file) {
    const transferId = `transfer-${this.transfers.size + 1}`;
    const metadata = {
      id: `file-${this.transfers.size + 1}`, transferId,
      name: file.name, size: file.size, type: file.type,
      peerId: 'sender', peerName: 'Synthetic sender', roomCode: 'TEST-ROOM',
      expiresAt: Date.now() + 3600000, chunkSize: this.chunkSize,
      totalChunks: Math.ceil(file.size / this.chunkSize),
    };
    const transfer = {
      file: metadata, state: 'ready', uploaded: new Set(), acknowledged: new Set(), chunks: new Map(),
    };
    this.transfers.set(transferId, transfer);
    return transfer;
  }

  snapshot(transferId) {
    const transfer = this.transfers.get(transferId);
    this.snapshots.push(transferId);
    return {
      success: true, transferId, fileId: transfer.file.id, roomCode: 'TEST-ROOM',
      state: transfer.state, chunkSize: transfer.file.chunkSize,
      summary: {
        totalChunks: transfer.file.totalChunks,
        uploadedChunks: [...transfer.uploaded].reverse(),
        acknowledgedChunks: [...transfer.acknowledged].reverse(),
      },
    };
  }

  client(peerId) {
    return {
      getPeerId: () => peerId,
      getPeerName: () => `Synthetic ${peerId}`,
      getRoomCode: () => 'TEST-ROOM',
      isConnected: () => true,
      createFileShare: async file => {
        const { file: metadata } = this.create(file);
        return {
          success: true, fileId: metadata.id, transferId: metadata.transferId,
          expiresAt: metadata.expiresAt, chunkSize: metadata.chunkSize,
          totalChunks: metadata.totalChunks, uploadUrlTemplate: 'memory:upload',
        };
      },
      startTransfer: async fileId => {
        const transfer = [...this.transfers.values()].find(item => item.file.id === fileId);
        return {
          success: true, fileId, transferId: transfer.file.transferId,
          chunkSize: transfer.file.chunkSize, totalChunks: transfer.file.totalChunks,
          state: transfer.state, downloadUrlTemplate: 'memory:download',
          uploadedChunks: [...transfer.uploaded].reverse(),
          acknowledgedChunks: [...transfer.acknowledged].reverse(),
        };
      },
      getTransferState: async transferId => this.snapshot(transferId),
      acknowledgeChunk: async (transferId, index) => {
        if (this.beforeAck) await this.beforeAck(transferId, index);
        const transfer = this.transfers.get(transferId);
        this.acks.push({ transferId, index });
        transfer.acknowledged.add(index);
        // ACK means the relay may permanently evict the only remote copy.
        transfer.uploaded.delete(index);
        transfer.chunks.delete(index);
        if (transfer.acknowledged.size === transfer.file.totalChunks) transfer.state = 'completed';
      },
      cancelTransfer: async (transferId, reason) => {
        this.cancellations.push({ transferId, reason });
        this.transfers.get(transferId).state = 'cancelled';
      },
      getChunkUrl: (_template, transferId, index) => `memory://${transferId}/${index}`,
    };
  }

  fetch = async (url, options) => {
    const parsed = new URL(url);
    const request = { transferId: parsed.hostname, index: Number(parsed.pathname.slice(1)), ...options };
    this.requests.push(request);
    return this.intercept ? this.intercept(request, () => this.respond(request)) : this.respond(request);
  };

  async respond(request) {
    const transfer = this.transfers.get(request.transferId);
    assert.equal(request.headers['x-peer-id'], request.method === 'POST' ? 'sender' : 'receiver');
    assert.equal(request.credentials, 'omit');
    assert.equal(request.redirect, 'error');
    if (request.method === 'POST') {
      assert.ok(request.body instanceof Blob, 'chunks must be raw Blob bodies, not JSON or multipart');
      assert.equal(new Headers(request.headers).get('Content-Type'), 'application/octet-stream');
      const expected = digest(await bytesOf(request.body));
      assert.equal(request.headers['x-chunk-hash'], expected);
      transfer.chunks.set(request.index, request.body);
      transfer.uploaded.add(request.index);
      return new Response(null, { status: 201 });
    }
    assert.equal(request.method, 'GET');
    assert.equal(request.body, undefined);
    const blob = transfer.chunks.get(request.index);
    if (!blob) return new Response('not uploaded yet', { status: 404 });
    return new Response(blob, { headers: { 'X-Chunk-Hash': digest(await bytesOf(blob)) } });
  }

  async seed(file, indexes) {
    const transfer = this.create(file);
    for (const index of indexes ?? Array.from({ length: transfer.file.totalChunks }, (_, i) => i)) {
      transfer.uploaded.add(index);
      transfer.chunks.set(index, file.slice(index * this.chunkSize, (index + 1) * this.chunkSize));
    }
    return transfer;
  }
}

function harness(t, relay, role = 'sender', storage = new MemoryTransferStorage(), client = relay.client(role)) {
  const states = new Map();
  const errors = [];
  const downloads = [];
  let shares = [];
  const manager = new TransferManager(client, storage, {
    onChange: (transfers, localShares) => {
      transfers.forEach(state => states.set(state.transferId, state));
      shares = localShares;
    },
    onError: message => errors.push(message),
    fetch: relay.fetch,
    saveDownload: (file, blob) => downloads.push({ file, blob }),
  });
  // node:test runs teardown even when an assertion or awaited operation fails.
  t.after(() => manager.dispose());
  return { manager, states, errors, downloads, storage, client, get shares() { return shares; } };
}

function record(transfer, role, overrides = {}) {
  return {
    transferId: transfer.file.transferId, fileId: transfer.file.id, roomCode: 'TEST-ROOM',
    peerId: role, role, file: transfer.file, state: 'ready', paused: false,
    uploadedChunks: [], acknowledgedChunks: [],
    uploadUrlTemplate: 'memory:upload', downloadUrlTemplate: 'memory:download',
    ...overrides,
  };
}

function mockTime(t) {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'], now: 1800000000000 });
  return ms => t.mock.timers.tick(ms);
}

for (const size of [1024 ** 3 - 1, 1024 ** 3, 1024 ** 3 + 1]) {
  test(`file size gate handles ${size} bytes before sending metadata`, async t => {
    const relay = new Relay(1024 * 1024);
    const h = harness(t, relay);
    const file = source(1);
    // Exercise the metadata boundary without allocating a gigabyte of test data.
    Object.defineProperty(file, 'size', { value: size });
    file.slice = () => assert.fail('Size validation must not read file bytes');
    h.manager.setConnected(true);
    const accepted = await h.manager.upload(file);
    if (accepted) h.manager.pause('transfer-1');
    assert.equal(accepted, size <= 1024 ** 3);
    assert.equal(relay.transfers.size, accepted ? 1 : 0);
    if (accepted) {
      assert.equal(relay.transfers.get('transfer-1').file.size, size);
      assert.equal(relay.transfers.get('transfer-1').file.totalChunks, 1024);
    } else {
      assert.match(h.errors.at(-1), /1 GB or smaller/);
    }
    await flush();
    assert.equal(relay.requests.length, 0);
  });
}

test('unknown MIME type is normalized in registration and durable sender metadata', async t => {
  const relay = new Relay(4);
  const h = harness(t, relay);
  h.manager.setConnected(true);
  const file = new File(['binary'], 'installer.msi');
  assert.equal(file.type, '');
  assert.equal(await h.manager.upload(file), true);
  await until(() => uploadFinished(h.states.get('transfer-1')));
  assert.equal(relay.transfers.get('transfer-1').file.type, 'application/octet-stream');
  assert.equal(h.shares[0].type, 'application/octet-stream');
  const [stored] = await h.storage.list('TEST-ROOM', 'sender');
  assert.equal(stored.file.type, 'application/octet-stream');
});

test('default browser fetch is invoked with its global receiver, never the TransferManager instance', async t => {
  const relay = new Relay(4);
  const receivers = [];
  t.mock.method(globalThis, 'fetch', function browserFetch(url, options) {
    receivers.push(this);
    if (this !== globalThis) throw new TypeError('Illegal invocation');
    return relay.fetch(url, options);
  });
  let state;
  const errors = [];
  const manager = new TransferManager(relay.client('sender'), new MemoryTransferStorage(), {
    onChange: transfers => { state = transfers[0]; },
    onError: message => errors.push(message),
    saveDownload: () => assert.fail('sender must not offer a download'),
  });
  t.after(() => manager.dispose());
  manager.setConnected(true);
  assert.equal(await manager.upload(source(3)), true);
  await until(() => receivers.length > 0);
  assert.ok(receivers[0] === globalThis, 'WebIDL fetch requires the browser global receiver');
  await until(() => uploadFinished(state));
  assert.equal(relay.requests.length, 1);
  assert.deepEqual(errors, []);
});

test('raw Blob uploads share a hard four-request limit across files and use negotiated exact slices', async t => {
  const relay = new Relay(4);
  const h = harness(t, relay);
  const releases = [];
  let active = 0;
  let peak = 0;
  relay.intercept = async (request, respond) => {
    active++;
    peak = Math.max(peak, active);
    const gate = deferred();
    releases.push(gate);
    try {
      await gate.promise;
      return await respond();
    } finally {
      active--;
    }
  };
  h.manager.setConnected(true);
  const files = [source(23, 'first.bin'), source(19, 'second.bin', 5)];
  assert.deepEqual(await Promise.all(files.map(file => h.manager.upload(file))), [true, true]);
  await until(() => active === 4);
  await flush();
  assert.equal(relay.requests.length, 4);
  assert.equal(active, 4);
  await until(() => h.states.size === 2 && [...h.states.values()].every(uploadFinished), 'both uploads finish', () => {
    releases.splice(0).forEach(gate => gate.resolve());
  });
  assert.equal(peak, 4);
  assert.equal(relay.requests.length, 11);
  for (const [position, transfer] of [...relay.transfers.values()].entries()) {
    const requests = relay.requests.filter(request => request.transferId === transfer.file.transferId);
    assert.deepEqual(sorted(requests.map(request => request.index)), Array.from({ length: transfer.file.totalChunks }, (_, i) => i));
    for (const request of requests) {
      assert.deepEqual(await bytesOf(request.body), await bytesOf(files[position].slice(request.index * 4, request.index * 4 + 4)));
    }
    assert.equal(requests.find(request => request.index === transfer.file.totalChunks - 1).body.size, 3);
  }
  assert.deepEqual(h.errors, []);
});

test('sender uses sparse, out-of-order snapshot indexes and ACK eviction, never a count-derived prefix', async t => {
  const relay = new Relay(4);
  const file = source(20);
  const transfer = await relay.seed(file, [4, 1]);
  transfer.acknowledged.add(3);
  const client = relay.client('sender');
  client.createFileShare = async () => ({
    success: true, fileId: transfer.file.id, transferId: transfer.file.transferId,
    expiresAt: transfer.file.expiresAt, chunkSize: 4, totalChunks: 5, uploadUrlTemplate: 'memory:upload',
  });
  const h = harness(t, relay, 'sender', undefined, client);
  h.manager.setConnected(true);
  assert.equal(await h.manager.upload(file), true);
  h.manager.handleUpdate({
    fileId: transfer.file.id, transferId: transfer.file.transferId,
    status: { state: 'transferring', uploadedChunks: 4, acknowledgedChunks: 1 },
  });
  await until(() => relay.requests.length === 2 && uploadFinished(h.states.get(transfer.file.transferId)));
  assert.deepEqual(sorted(relay.requests.map(request => request.index)), [0, 2]);
  assert.equal(h.states.get(transfer.file.transferId).uploadedChunkCount, 5);
  assert.deepEqual(h.errors, []);
});

test('sender and receiver roundtrip verifies real SHA-256, durable-before-ACK, eviction, and exact file assembly', async t => {
  const relay = new Relay(4);
  const sender = harness(t, relay);
  const receiver = harness(t, relay, 'receiver');
  const file = source(23);
  sender.manager.setConnected(true);
  assert.equal(await sender.manager.upload(file), true);
  await until(() => uploadFinished(sender.states.get('transfer-1')));
  const transfer = relay.transfers.get('transfer-1');
  transfer.file.hash = digest(await bytesOf(file));
  relay.beforeAck = async (id, index) => {
    const persisted = await receiver.storage.getChunk(id, index);
    assert.ok(persisted, `chunk ${index} must commit before acknowledgment`);
    assert.deepEqual(await bytesOf(persisted), await bytesOf(file.slice(index * 4, index * 4 + 4)));
  };
  receiver.manager.setConnected(true);
  assert.equal(await receiver.manager.startDownload(transfer.file), true);
  await until(() => receiver.states.get('transfer-1')?.state === 'completed');
  assert.equal(receiver.downloads.length, 1);
  assert.deepEqual(await bytesOf(receiver.downloads[0].blob), await bytesOf(file));
  assert.equal(receiver.downloads[0].blob.type, file.type);
  assert.equal(transfer.chunks.size, 0);
  assert.deepEqual(sorted(relay.acks.map(ack => ack.index)), [0, 1, 2, 3, 4, 5]);
  assert.equal(relay.requests.filter(request => request.method === 'GET').length, 6);
  assert.deepEqual(await receiver.storage.chunkIndexes('transfer-1'), []);
  sender.manager.handleUpdate({
    transferId: 'transfer-1', fileId: transfer.file.id,
    status: { state: 'completed', uploadedChunks: 0, acknowledgedChunks: 6 },
  }, true);
  await until(() => sender.states.get('transfer-1')?.state === 'completed');
  assert.deepEqual(sender.errors, []);
  assert.deepEqual(receiver.errors, []);
});

test('receiver cannot ACK or offer a download while chunk persistence is uncommitted', async t => {
  const relay = new Relay(4);
  const transfer = await relay.seed(source(3));
  const storage = new MemoryTransferStorage();
  const commit = deferred();
  const put = storage.putChunk.bind(storage);
  let writing = false;
  storage.putChunk = async (...args) => {
    writing = true;
    await commit.promise;
    await put(...args);
  };
  const h = harness(t, relay, 'receiver', storage);
  h.manager.setConnected(true);
  await h.manager.startDownload(transfer.file);
  await until(() => writing);
  await flush();
  assert.equal(relay.acks.length, 0);
  assert.equal(h.downloads.length, 0);
  commit.resolve();
  await until(() => h.downloads.length === 1);
  assert.equal(relay.acks.length, 1);
});

test('receiver shares four HTTP slots across files and repeated resume calls do not duplicate downloads', async t => {
  const relay = new Relay(4);
  const files = [source(19, 'download-a.bin'), source(23, 'download-b.bin', 3)];
  const transfers = await Promise.all(files.map(file => relay.seed(file)));
  const h = harness(t, relay, 'receiver');
  const gates = [];
  let active = 0;
  let peak = 0;
  relay.intercept = async (_request, respond) => {
    active++;
    peak = Math.max(active, peak);
    const gate = deferred();
    gates.push(gate);
    try {
      await gate.promise;
      return await respond();
    } finally {
      active--;
    }
  };
  h.manager.setConnected(true);
  await Promise.all(transfers.map(transfer => h.manager.startDownload(transfer.file)));
  await until(() => active === 4);
  await Promise.all(transfers.flatMap(transfer => [
    h.manager.resume(transfer.file.transferId),
    h.manager.resume(transfer.file.transferId),
  ]));
  await flush();
  assert.equal(relay.requests.length, 4);
  await until(() => h.downloads.length === 2, 'both receivers assemble', () => {
    gates.splice(0).forEach(gate => gate.resolve());
  });
  assert.equal(peak, 4);
  assert.equal(relay.requests.length, 11);
  assert.equal(new Set(relay.requests.map(request => `${request.transferId}:${request.index}`)).size, 11);
  for (const download of h.downloads) {
    const original = files.find(file => file.name === download.file.name);
    assert.deepEqual(await bytesOf(download.blob), await bytesOf(original));
  }
  assert.deepEqual(h.errors, []);
});

test('cancelling during durable chunk write waits for commit then purges without ACK or stale resurrection', async t => {
  const relay = new Relay(4);
  const transfer = await relay.seed(source(3));
  const storage = new MemoryTransferStorage();
  const gate = deferred();
  const put = storage.putChunk.bind(storage);
  let writing = false;
  storage.putChunk = async (...args) => {
    writing = true;
    await gate.promise;
    await put(...args);
  };
  const h = harness(t, relay, 'receiver', storage);
  h.manager.setConnected(true);
  await h.manager.startDownload(transfer.file);
  await until(() => writing);
  const cancelled = h.manager.cancel('transfer-1');
  await flush();
  assert.equal(relay.acks.length, 0);
  gate.resolve();
  assert.equal(await cancelled, true);
  await flush();
  assert.deepEqual(await storage.chunkIndexes('transfer-1'), []);
  assert.deepEqual(await storage.list('TEST-ROOM', 'receiver'), []);
  assert.equal(relay.acks.length, 0);
  assert.equal(h.downloads.length, 0);
  assert.equal(h.states.get('transfer-1').state, 'cancelled');
});

test('late batch failure cannot resurrect a removed share after a pending chunk write commits', async t => {
  const relay = new Relay(4);
  const transfer = await relay.seed(source(7));
  const storage = new MemoryTransferStorage();
  const commit = deferred();
  const failure = deferred();
  const put = storage.putChunk.bind(storage);
  let writing = false;
  storage.putChunk = async (...args) => {
    writing = true;
    await commit.promise;
    await put(...args);
  };
  relay.intercept = async (request, respond) => {
    if (request.index !== 1) return respond();
    await failure.promise;
    return new Response('synthetic forbidden', { status: 403 });
  };
  const h = harness(t, relay, 'receiver', storage);
  h.manager.setConnected(true);
  await h.manager.startDownload(transfer.file);
  await until(() => writing);
  failure.resolve();
  await flush();
  h.manager.removeMissingFiles([]);
  assert.equal(h.states.get('transfer-1').state, 'removed');
  commit.resolve();
  await flush();
  assert.equal(h.states.get('transfer-1').state, 'removed');
  assert.deepEqual(h.shares, []);
  assert.deepEqual(await storage.list('TEST-ROOM', 'receiver'), []);
  assert.deepEqual(await storage.chunkIndexes('transfer-1'), []);
  assert.deepEqual(h.errors, []);
  assert.equal(relay.acks.length, 0);
  assert.equal(h.downloads.length, 0);
});

for (const scenario of [
  { name: 'POST 409 backpressure', role: 'sender', statuses: [409] },
  { name: 'GET 404 not-yet-uploaded', role: 'receiver', statuses: [404] },
  { name: 'transient network, 408, 425, 429 and 503', role: 'sender', statuses: ['network', 408, 425, 429, 503] },
]) {
  test(`retries ${scenario.name} without duplicating successful chunks`, async t => {
    const tick = mockTime(t);
    const relay = new Relay(4);
    const h = harness(t, relay, scenario.role);
    const remaining = [...scenario.statuses];
    relay.intercept = async (_request, respond) => {
      if (!remaining.length) return respond();
      const status = remaining.shift();
      if (status === 'network') throw new TypeError('synthetic disconnected fetch');
      return new Response('synthetic retry', { status, headers: { 'Retry-After': '0' } });
    };
    h.manager.setConnected(true);
    if (scenario.role === 'sender') await h.manager.upload(source(3));
    else await h.manager.startDownload((await relay.seed(source(3))).file);
    await until(
      () => scenario.role === 'sender'
        ? uploadFinished(h.states.get('transfer-1'))
        : h.states.get('transfer-1')?.state === 'completed',
      `successful ${scenario.name} retry`,
      () => tick(1000),
    );
    assert.equal(relay.requests.length, scenario.statuses.length + 1);
    assert.deepEqual(h.errors, []);
  });
}

test('transient failures stop at six attempts with a resumable failed chunk', async t => {
  const tick = mockTime(t);
  const relay = new Relay(4);
  relay.intercept = async () => new Response('synthetic unavailable', { status: 503 });
  const h = harness(t, relay);
  h.manager.setConnected(true);
  await h.manager.upload(source(3));
  await until(() => h.states.get('transfer-1')?.state === 'failed', 'retry cap reached', () => tick(1000));
  assert.equal(relay.requests.length, 6);
  assert.deepEqual(h.states.get('transfer-1').failedChunks, [0]);
  assert.match(h.errors[0], /could not be uploaded.*Resume/i);
  tick(60000);
  await flush();
  assert.equal(relay.requests.length, 6);
  relay.intercept = undefined;
  assert.equal(await h.manager.resume('transfer-1'), true);
  await until(() => uploadFinished(h.states.get('transfer-1')));
  assert.equal(relay.requests.length, 7);
  assert.deepEqual(h.states.get('transfer-1').failedChunks, []);
});

for (const status of [400, 401, 403, 410]) {
  test(`HTTP ${status} fails immediately without retrying`, async t => {
    const relay = new Relay(4);
    relay.intercept = async () => new Response('synthetic permission failure', { status });
    const h = harness(t, relay);
    h.manager.setConnected(true);
    await h.manager.upload(source(3));
    await until(() => h.errors.length > 0);
    assert.equal(relay.requests.length, 1);
    assert.equal(h.states.get('transfer-1').state, status === 410 ? 'expired' : 'failed');
    assert.match(h.errors[0], new RegExp(`HTTP ${status}`));
  });
}

test('Retry-After is honored but capped at thirty seconds', async t => {
  const tick = mockTime(t);
  const relay = new Relay(4);
  let first = true;
  relay.intercept = async (_request, respond) => {
    if (!first) return respond();
    first = false;
    return new Response('synthetic full buffer', { status: 409, headers: { 'Retry-After': '999999' } });
  };
  const h = harness(t, relay);
  h.manager.setConnected(true);
  await h.manager.upload(source(3));
  await until(() => relay.requests.length === 1);
  await flush();
  tick(29999);
  await flush();
  assert.equal(relay.requests.length, 1);
  tick(1);
  await until(() => uploadFinished(h.states.get('transfer-1')));
  assert.equal(relay.requests.length, 2);
});

for (const mode of ['pause/resume', 'immediate disconnect/reconnect']) {
  test(`${mode} aborts current requests and restarts once without duplicate workers`, async t => {
    const relay = new Relay(4);
    let hold = true;
    let active = 0;
    let peak = 0;
    relay.intercept = async (request, respond) => {
      active++;
      peak = Math.max(peak, active);
      try {
        if (hold) return await abortable(request.signal);
        return await respond();
      } finally {
        active--;
      }
    };
    const h = harness(t, relay);
    h.manager.setConnected(true);
    await h.manager.upload(source(19));
    await until(() => relay.requests.length === 4);
    const original = [...relay.requests];
    if (mode === 'pause/resume') {
      h.manager.pause('transfer-1');
      await flush();
      assert.equal(relay.requests.length, 4);
      assert.equal(h.states.get('transfer-1').paused, true);
      hold = false;
      await Promise.all([h.manager.resume('transfer-1'), h.manager.resume('transfer-1')]);
    } else {
      h.manager.setConnected(false);
      hold = false;
      h.manager.setConnected(true);
      h.manager.setConnected(true);
    }
    assert.ok(original.every(request => request.signal.aborted));
    await until(() => uploadFinished(h.states.get('transfer-1')));
    assert.equal(peak, 4);
    assert.equal(relay.requests.length, 9);
    assert.deepEqual(sorted(relay.requests.slice(4).map(request => request.index)), [0, 1, 2, 3, 4]);
    assert.deepEqual(h.errors, []);
  });
}

test('request timeout covers a stalled successful response body and retries its aborted read', async t => {
  const tick = mockTime(t);
  const relay = new Relay(4);
  const transfer = await relay.seed(source(3));
  let bodyStarted = false;
  relay.intercept = async (request, respond) => {
    if (relay.requests.length !== 1) return respond();
    return {
      ok: true, status: 200, headers: new Headers(), body: { cancel: async () => {} },
      blob: () => { bodyStarted = true; return abortable(request.signal); },
      text: async () => '',
    };
  };
  const h = harness(t, relay, 'receiver');
  h.manager.setConnected(true);
  await h.manager.startDownload(transfer.file);
  await until(() => bodyStarted);
  tick(29999);
  await flush();
  assert.equal(relay.requests[0].signal.aborted, false);
  tick(1);
  await flush();
  assert.equal(relay.requests[0].signal.aborted, true);
  await until(() => h.downloads.length === 1, 'body timeout must retry rather than fail as HTTP 200', () => tick(1000));
  assert.equal(relay.requests.length, 2);
  assert.deepEqual(h.errors, []);
});

test('hard HTTP failure does not hang on an endless error body and releases its request', async t => {
  const relay = new Relay(4);
  relay.intercept = async request => ({
    ok: false, status: 403, headers: new Headers(),
    body: { cancel: async () => {} },
    text: () => abortable(request.signal),
  });
  const h = harness(t, relay);
  h.manager.setConnected(true);
  await h.manager.upload(source(3));
  await until(() => h.errors.length === 1, '403 must fail without waiting indefinitely for error text');
  assert.match(h.errors[0], /HTTP 403/);
  assert.equal(relay.requests[0].signal.aborted, true);
  assert.deepEqual(h.states.get('transfer-1').inFlightChunks, []);
  relay.intercept = undefined;
  await h.manager.resume('transfer-1');
  await until(() => uploadFinished(h.states.get('transfer-1')));
  assert.equal(relay.requests.length, 2);
});

test('receiver-offline push stops sender workers and immediate receiver reconnect restarts exactly once', async t => {
  const relay = new Relay(4);
  let hold = true;
  relay.intercept = async (request, respond) => hold ? abortable(request.signal) : respond();
  const h = harness(t, relay);
  h.manager.setConnected(true);
  await h.manager.upload(source(19));
  await until(() => relay.requests.length === 4);
  const update = {
    transferId: 'transfer-1', fileId: relay.transfers.get('transfer-1').file.id,
    status: {
      state: 'receiver-offline', uploadedChunks: 0, acknowledgedChunks: 0,
      senderConnected: true, receiverConnected: false, receiverPeerId: 'receiver',
    },
  };
  h.manager.handleUpdate(update);
  assert.equal(h.states.get('transfer-1').state, 'receiver-offline');
  assert.ok(relay.requests.every(request => request.signal.aborted));
  hold = false;
  update.status = { ...update.status, state: 'ready', receiverConnected: true };
  h.manager.handleUpdate(update);
  h.manager.handleUpdate(update);
  await until(() => uploadFinished(h.states.get('transfer-1')));
  assert.equal(relay.requests.length, 9);
  assert.deepEqual(sorted(relay.requests.slice(4).map(request => request.index)), [0, 1, 2, 3, 4]);
  assert.deepEqual(h.errors, []);
});

for (const mode of ['cancel', 'expiry', 'removal']) {
  test(`${mode} aborts all active workers and cannot restart on reconnect or late updates`, async t => {
    const tick = mockTime(t);
    const relay = new Relay(4);
    relay.intercept = request => abortable(request.signal);
    const h = harness(t, relay);
    h.manager.setConnected(true);
    await h.manager.upload(source(23));
    await until(() => relay.requests.length === 4);
    const transfer = relay.transfers.get('transfer-1');
    const expected = { cancel: 'cancelled', expiry: 'expired', removal: 'removed' }[mode];
    if (mode === 'cancel') assert.equal(await h.manager.cancel('transfer-1'), true);
    if (mode === 'expiry') {
      h.manager.syncFiles([{ ...transfer.file, expiresAt: Date.now() + 1000 }]);
      tick(1000);
    }
    if (mode === 'removal') h.manager.removeMissingFiles([]);
    await until(() => h.states.get('transfer-1')?.state === expected);
    assert.ok(relay.requests.every(request => request.signal.aborted));
    h.manager.setConnected(false);
    h.manager.setConnected(true);
    h.manager.handleUpdate({
      transferId: 'transfer-1', fileId: transfer.file.id,
      status: { state: 'ready', uploadedChunks: 6, acknowledgedChunks: 0, senderConnected: true },
    });
    tick(60000);
    await flush();
    assert.equal(relay.requests.length, 4);
    assert.equal(h.states.get('transfer-1').state, expected);
    assert.deepEqual(await h.storage.list('TEST-ROOM', 'sender'), []);
    assert.equal(relay.cancellations.length, mode === 'cancel' ? 1 : 0);
  });
}

test('offline cancellation is persisted and confirmed after immediate reconnect without restarting HTTP', async t => {
  const relay = new Relay(4);
  relay.intercept = request => abortable(request.signal);
  const h = harness(t, relay);
  h.manager.setConnected(true);
  await h.manager.upload(source(7));
  await until(() => relay.requests.length === 2);
  h.manager.setConnected(false);
  assert.equal(await h.manager.cancel('transfer-1'), true);
  assert.equal(relay.cancellations.length, 0);
  assert.equal((await h.storage.list('TEST-ROOM', 'sender'))[0].cancelPending, true);
  h.manager.setConnected(true);
  await until(() => relay.cancellations.length === 1);
  await flush();
  assert.equal(relay.requests.length, 2);
  assert.deepEqual(await h.storage.list('TEST-ROOM', 'sender'), []);
});

for (const role of ['sender', 'receiver']) {
  for (const state of ['cancelled', 'expired', 'removed', 'sender-timeout']) {
    test(`${role} purges durable records and chunks when a snapshot alone reports ${state}`, async t => {
      const relay = new Relay(4);
      const transfer = await relay.seed(source(7));
      transfer.state = state;
      const storage = new MemoryTransferStorage();
      const deleted = [];
      const remove = storage.delete.bind(storage);
      storage.delete = async id => { deleted.push(id); await remove(id); };
      await storage.save(record(transfer, role));
      await storage.putChunk('transfer-1', 0, source(7).slice(0, 4));
      const h = harness(t, relay, role, storage);
      await h.manager.restore();
      h.manager.setConnected(true);
      await until(() => h.states.get('transfer-1')?.state === state);
      await flush();
      assert.deepEqual(deleted, ['transfer-1'], 'snapshot terminal state must explicitly purge storage');
      assert.deepEqual(await storage.chunkIndexes('transfer-1'), []);
      assert.deepEqual(await storage.list('TEST-ROOM', role), []);
      assert.equal(relay.requests.length, 0);
      assert.equal(h.downloads.length, 0);
      h.manager.setConnected(false);
      h.manager.setConnected(true);
      await flush();
      assert.equal(relay.requests.length, 0);
      assert.equal(h.states.get('transfer-1').state, state);
    });
  }
}

test('fully uploaded restored sender waits ready without source or HTTP using the uploaded/ACK union', async t => {
  const relay = new Relay(4);
  const transfer = await relay.seed(source(16), [3, 1]);
  transfer.acknowledged = new Set([2, 0]);
  const storage = new MemoryTransferStorage();
  await storage.save(record(transfer, 'sender', {
    error: 'Choose the original file to resume uploading after a refresh.',
  }));
  const h = harness(t, relay, 'sender', storage);
  await h.manager.restore();
  h.manager.setConnected(true);
  await until(() => uploadFinished(h.states.get('transfer-1')) && !h.states.get('transfer-1').needsSource);
  await flush();
  assert.equal(relay.requests.length, 0);
  assert.equal(h.states.get('transfer-1').acknowledgedChunkCount, 2);
  assert.equal(h.states.get('transfer-1').error, undefined);
  const persisted = (await storage.list('TEST-ROOM', 'sender'))[0];
  assert.equal(persisted.state, 'ready');
  assert.deepEqual(sorted(persisted.uploadedChunks), [1, 3]);
  assert.deepEqual(sorted(persisted.acknowledgedChunks), [0, 2]);
  assert.deepEqual(h.errors, []);
});

for (const role of ['sender', 'receiver']) {
  test(`file removal while ${role === 'sender' ? 'createFileShare' : 'startTransfer'} is pending cannot resurrect the share`, async t => {
    const relay = new Relay(4);
    const file = source(7);
    if (role === 'receiver') await relay.seed(file);
    const client = relay.client(role);
    const control = role === 'sender' ? 'createFileShare' : 'startTransfer';
    const original = client[control];
    const responseReady = deferred();
    const releaseResponse = deferred();
    client[control] = async (...args) => {
      const response = await original(...args);
      responseReady.resolve(response);
      await releaseResponse.promise;
      return response;
    };
    const h = harness(t, relay, role, undefined, client);
    h.manager.setConnected(true);
    const operation = role === 'sender'
      ? h.manager.upload(file)
      : h.manager.startDownload(relay.transfers.get('transfer-1').file);
    const pending = await responseReady.promise;
    h.manager.removeFile(pending.fileId);
    releaseResponse.resolve();
    assert.equal(await operation, false);
    await flush();
    assert.equal(h.states.size, 0);
    assert.deepEqual(h.shares, []);
    assert.equal(relay.requests.length, 0);
    assert.deepEqual(await h.storage.list('TEST-ROOM', role), []);
    assert.deepEqual(await h.storage.chunkIndexes('transfer-1'), []);
    assert.equal(h.downloads.length, 0);
    assert.match(h.errors[0], /removed before/);
    h.manager.setConnected(false);
    h.manager.setConnected(true);
    await flush();
    assert.equal(h.states.size, 0);
    assert.equal(relay.requests.length, 0);
  });
}

test('sender restore requires original source, preserves per-chunk fingerprints, and resumes sparse missing chunks', async t => {
  const relay = new Relay(4);
  const storage = new MemoryTransferStorage();
  const first = harness(t, relay, 'sender', storage);
  const file = source(11);
  first.manager.setConnected(true);
  await first.manager.upload(file);
  await until(() => uploadFinished(first.states.get('transfer-1')));
  const persisted = (await storage.list('TEST-ROOM', 'sender'))[0];
  assert.equal(persisted.sourceLastModified, file.lastModified);
  assert.deepEqual(persisted.sourceHashes, await Promise.all([0, 1, 2].map(async index => digest(await bytesOf(file.slice(index * 4, index * 4 + 4))))));
  assert.equal(Object.values(persisted).some(value => value instanceof Blob), false);
  first.manager.dispose();
  const transfer = relay.transfers.get('transfer-1');
  transfer.uploaded.delete(0);
  transfer.chunks.delete(0);
  transfer.uploaded.delete(2);
  transfer.chunks.delete(2);
  transfer.acknowledged.add(2);
  const second = harness(t, relay, 'sender', storage);
  await second.manager.restore();
  assert.equal(second.states.get('transfer-1').needsSource, true);
  second.manager.setConnected(true);
  await until(() => /original file/.test(second.states.get('transfer-1')?.error ?? ''));
  const previousRequests = relay.requests.length;
  assert.equal(await second.manager.attachSource('transfer-1', source(11, 'wrong-name.bin')), false);
  assert.match(second.errors.at(-1), /same name, size, and modification time/);
  assert.equal(await second.manager.attachSource('transfer-1', source(11, 'synthetic.bin', 1)), true);
  await until(() => /differs from the original/.test(second.states.get('transfer-1')?.error ?? ''));
  assert.equal(relay.requests.length, previousRequests);
  assert.equal(await second.manager.attachSource('transfer-1', file), true);
  await until(() => uploadFinished(second.states.get('transfer-1')) && relay.requests.length > previousRequests);
  assert.deepEqual(relay.requests.slice(previousRequests).map(request => request.index), [0]);
  assert.equal(second.states.get('transfer-1').needsSource, false);
});

test('receiver restores sparse local chunks, re-ACKs unacknowledged data and downloads only authoritative missing indexes', async t => {
  const relay = new Relay(4);
  const file = source(19);
  const transfer = await relay.seed(file, [4, 1, 0]);
  transfer.acknowledged.add(3);
  const storage = new MemoryTransferStorage();
  await storage.save(record(transfer, 'receiver', { uploadedChunks: [0, 1, 2, 3, 4], acknowledgedChunks: [0, 1] }));
  await storage.putChunk('transfer-1', 3, file.slice(12, 16));
  await storage.putChunk('transfer-1', 2, file.slice(8, 12));
  const h = harness(t, relay, 'receiver', storage);
  relay.beforeAck = async (id, index) => assert.ok(await storage.getChunk(id, index));
  await h.manager.restore();
  assert.equal(h.states.get('transfer-1').receivedChunkCount, 2);
  h.manager.setConnected(true);
  await until(() => h.downloads.length === 1);
  assert.deepEqual(sorted(relay.requests.map(request => request.index)), [0, 1, 4]);
  assert.deepEqual(sorted(relay.acks.map(ack => ack.index)), [0, 1, 2, 4]);
  assert.deepEqual(await bytesOf(h.downloads[0].blob), await bytesOf(file));
  assert.deepEqual(h.errors, []);
});

test('receiver assembles durable chunks even when a completed push precedes snapshot reconciliation', async t => {
  const relay = new Relay(4);
  const file = source(7);
  const transfer = await relay.seed(file, []);
  transfer.state = 'completed';
  transfer.acknowledged = new Set([1, 0]);
  const storage = new MemoryTransferStorage();
  await storage.save(record(transfer, 'receiver', { acknowledgedChunks: [0, 1] }));
  await storage.putChunk('transfer-1', 1, file.slice(4));
  await storage.putChunk('transfer-1', 0, file.slice(0, 4));
  const h = harness(t, relay, 'receiver', storage);
  await h.manager.restore();
  h.manager.setConnected(true);
  h.manager.handleUpdate({
    transferId: 'transfer-1', fileId: transfer.file.id,
    status: { state: 'completed', uploadedChunks: 0, acknowledgedChunks: 2 },
  }, true);
  await until(() => h.downloads.length === 1);
  await flush();
  assert.deepEqual(await bytesOf(h.downloads[0].blob), await bytesOf(file));
  assert.equal(h.states.get('transfer-1').state, 'completed');
  assert.equal(relay.requests.length, 0);
  assert.equal(h.downloads.length, 1);
});

test('authoritative ACK without a durable local chunk fails instead of fabricating a complete file', async t => {
  const relay = new Relay(4);
  const transfer = await relay.seed(source(7), []);
  transfer.state = 'completed';
  transfer.acknowledged = new Set([1, 0]);
  const storage = new MemoryTransferStorage();
  await storage.save(record(transfer, 'receiver'));
  await storage.putChunk('transfer-1', 1, source(7).slice(4));
  const h = harness(t, relay, 'receiver', storage);
  await h.manager.restore();
  h.manager.setConnected(true);
  await until(() => h.errors.length > 0);
  assert.match(h.errors[0], /acknowledged chunks are missing/);
  assert.equal(h.states.get('transfer-1').state, 'failed');
  assert.equal(h.downloads.length, 0);
  assert.equal(relay.requests.length, 0);
});

test('starting an already-completed transfer still assembles its existing durable chunks', async t => {
  const relay = new Relay(4);
  const file = source(7);
  const transfer = await relay.seed(file, []);
  transfer.state = 'completed';
  transfer.acknowledged = new Set([1, 0]);
  const storage = new MemoryTransferStorage();
  await storage.putChunk('transfer-1', 0, file.slice(0, 4));
  await storage.putChunk('transfer-1', 1, file.slice(4));
  const h = harness(t, relay, 'receiver', storage);
  h.manager.setConnected(true);
  assert.equal(await h.manager.startDownload(transfer.file), true);
  await until(() => h.downloads.length === 1);
  assert.deepEqual(await bytesOf(h.downloads[0].blob), await bytesOf(file));
  assert.equal(relay.requests.length, 0);
  assert.deepEqual(h.errors, []);
});

for (const invalid of [2, [0, 3], [-1], [1.5]]) {
  test(`rejects malformed snapshot indexes ${JSON.stringify(invalid)} without requesting a guessed prefix`, async t => {
    const relay = new Relay(4);
    const h = harness(t, relay);
    const snapshot = h.client.getTransferState;
    h.client.getTransferState = async id => {
      const state = await snapshot(id);
      state.summary.uploadedChunks = invalid;
      return state;
    };
    h.manager.setConnected(true);
    await h.manager.upload(source(11));
    await until(() => h.errors.length > 0);
    assert.match(h.errors[0], /invalid chunk indexes/);
    assert.equal(relay.requests.length, 0);
    assert.equal(h.states.get('transfer-1').state, 'failed');
  });
}

for (const corruption of ['chunk hash', 'whole-file hash', 'wrong chunk size', 'storage write failure']) {
  test(`receiver rejects ${corruption} without offering a corrupt file`, async t => {
    const relay = new Relay(4);
    const transfer = await relay.seed(source(3));
    const storage = new MemoryTransferStorage();
    if (corruption === 'whole-file hash') transfer.file.hash = '0'.repeat(64);
    if (corruption === 'storage write failure') storage.putChunk = async () => { throw new Error('synthetic disk full'); };
    if (corruption === 'chunk hash') {
      relay.intercept = async (_request, respond) => {
        const response = await respond();
        response.headers.set('X-Chunk-Hash', '0'.repeat(64));
        return response;
      };
    }
    if (corruption === 'wrong chunk size') relay.intercept = async () => new Response(new Blob(['xx']));
    const h = harness(t, relay, 'receiver', storage);
    h.manager.setConnected(true);
    await h.manager.startDownload(transfer.file);
    await until(() => h.errors.length > 0);
    assert.equal(h.states.get('transfer-1').state, 'failed');
    assert.equal(h.downloads.length, 0);
    if (corruption !== 'whole-file hash') assert.equal(relay.acks.length, 0);
  });
}
