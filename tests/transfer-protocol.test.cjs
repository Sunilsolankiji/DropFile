const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const path = require('node:path');
const { loadTypeScript } = require('./helpers/load-typescript.cjs');
const { NetworkPeerService } = loadTypeScript(path.join(__dirname, '..', 'src', 'lib', 'network-peer-service.ts'));

class FakeSocket extends EventEmitter {
  connected = true;
  io = new EventEmitter();
  sent = [];
  handlers = new Map();

  emit(event, payload, ...args) {
    this.sent.push({ event, payload, args });
    this.handlers.get(event)?.(payload, ...args);
    return this;
  }

  push(event, payload) {
    return super.emit(event, payload);
  }

  respond(event, response) {
    this.handlers.set(event, (_payload, callback) => callback(response));
  }

  disconnect() {
    this.connected = false;
  }
}

function fixture(t) {
  const events = {};
  const callbacks = Object.fromEntries([
    'onPeersChanged', 'onFilesChanged', 'onTextsChanged', 'onPeerJoined', 'onPeerLeft',
    'onFileAdded', 'onFileRemoved', 'onTextAdded', 'onConnectionChanged',
    'onTransferUpdated', 'onTransferCompleted', 'onTransferError'
  ].map(name => {
    events[name] = [];
    return [name, (...args) => events[name].push(args)];
  }));
  const service = new NetworkPeerService('https://backend.example/base', 'room', 'Alice', callbacks, 'peer1');
  const socket = new FakeSocket();
  service.socket = socket;
  service.joined = true;
  service.setupEventListeners();
  t.after(() => service.disconnect());
  return { service, socket, events };
}

function metadata(overrides = {}) {
  return { name: 'file.txt', size: 10, type: 'text/plain', chunkSize: 5, totalChunks: 2, ...overrides };
}

function created(overrides = {}) {
  return {
    success: true, fileId: 'file1', transferId: 'transfer1', expiresAt: Date.now() + 60000,
    chunkSize: 4, totalChunks: 3, uploadUrlTemplate: '/api/transfers/:transferId/chunks/:chunkIndex',
    ...overrides
  };
}

function share(overrides = {}) {
  return {
    ...metadata(), id: 'file1', transferId: 'transfer1', peerId: 'peer1', peerName: 'Alice',
    roomCode: 'room', expiresAt: Date.now() + 60000, chunkSize: 4, totalChunks: 3, ...overrides
  };
}

function started(overrides = {}) {
  return {
    success: true, fileId: 'file1', transferId: 'transfer1', chunkSize: 4, totalChunks: 3,
    state: 'transferring', uploadedChunks: [0, 2], acknowledgedChunks: [0],
    downloadUrlTemplate: '/api/transfers/{transferId}/chunks/{chunkIndex}', ...overrides
  };
}

function snapshot(overrides = {}) {
  return {
    success: true, fileId: 'file1', transferId: 'transfer1', roomCode: 'room',
    chunkSize: 4, state: 'transferring',
    summary: { totalChunks: 3, uploadedChunks: [0, 2], acknowledgedChunks: [0] }, ...overrides
  };
}

test('add-file emits only metadata and stores negotiated dimensions without reading file bytes', async t => {
  const { service, socket, events } = fixture(t);
  const response = created();
  socket.respond('add-file', response);
  const input = metadata({ id: 'file1', hash: 'optional-hash', data: 'not allowed', arrayBuffer() { throw Error('read'); } });
  assert.equal(await service.createFileShare(input), response);
  assert.deepEqual(socket.sent[0].payload, {
    roomCode: 'room', peerId: 'peer1',
    file: metadata({ id: 'file1', hash: 'optional-hash' })
  });
  assert.equal(Object.hasOwn(socket.sent[0].payload.file, 'data'), false);
  assert.equal(service.getFiles()[0].chunkSize, 4);
  assert.equal(service.getFiles()[0].totalChunks, 3);
  assert.equal(service.getFiles()[0].transferId, 'transfer1');
  assert.equal(events.onFilesChanged.length, 1);
  assert.equal(service.addFile, undefined);
  assert.equal(service.downloadFile, undefined);
});

test('large files with unknown MIME types emit binary metadata without a file payload', async t => {
  const { service, socket } = fixture(t);
  const input = metadata({
    name: 'installer.msi', size: 901054464, type: '',
    chunkSize: 1048576, totalChunks: 860,
    data: 'must not be sent',
    arrayBuffer() { assert.fail('Registration must not read the file'); },
  });
  socket.respond('add-file', created({ chunkSize: input.chunkSize, totalChunks: input.totalChunks }));
  await service.createFileShare(input);
  assert.deepEqual(socket.sent[0].payload, {
    roomCode: 'room', peerId: 'peer1',
    file: {
      name: 'installer.msi', size: 901054464, type: 'application/octet-stream',
      chunkSize: 1048576, totalChunks: 860,
    },
  });
  assert.equal(service.getFiles()[0].type, 'application/octet-stream');
});

test('file-added arriving before add-file acknowledgement keeps richer pushed metadata', async t => {
  const { service, socket, events } = fixture(t);
  const pushed = share({
    status: 'transferring',
    transfer: { state: 'transferring', uploadedChunks: 2, acknowledgedChunks: 1, receiverConnected: true }
  });
  socket.handlers.set('add-file', (_payload, callback) => {
    socket.push('file-added', pushed);
    callback(created());
  });
  await service.createFileShare(metadata());
  assert.equal(service.getFiles()[0], pushed);
  assert.equal(events.onFilesChanged.length, 1);
  assert.equal(events.onFileAdded.length, 1);
});

test('add-file rejects bad metadata, negotiated dimensions, IDs, and expiry', async t => {
  const { service, socket } = fixture(t);
  for (const input of [metadata({ size: -1 }), metadata({ chunkSize: 0 }), metadata({ totalChunks: 99 })]) {
    await assert.rejects(service.createFileShare(input), /chunk dimensions/);
  }
  assert.equal(socket.sent.length, 0);
  for (const response of [
    created({ chunkSize: 0 }), created({ totalChunks: 2 }), created({ transferId: '' }),
    created({ fileId: '' }), created({ expiresAt: Date.now() - 1 })
  ]) {
    socket.respond('add-file', response);
    await assert.rejects(service.createFileShare(metadata()));
  }
  assert.equal(service.getFileCount(), 0);
});

test('start/state requests await callbacks and use exact control payloads', async t => {
  const { service, socket } = fixture(t);
  service.files.set('file1', share());
  let answer;
  socket.handlers.set('start-transfer', (_payload, callback) => { answer = callback; });
  let settled = false;
  const pending = service.startTransfer('file1').then(value => { settled = true; return value; });
  await Promise.resolve();
  assert.equal(settled, false);
  assert.deepEqual(socket.sent[0].payload, { roomCode: 'room', fileId: 'file1', peerId: 'peer1' });
  answer(started());
  assert.deepEqual((await pending).uploadedChunks, [0, 2]);
  socket.respond('get-transfer-state', snapshot());
  const state = await service.getTransferState('transfer1');
  assert.deepEqual(socket.sent.at(-1).payload, { transferId: 'transfer1' });
  assert.deepEqual(state.summary.acknowledgedChunks, [0]);
});

test('start/state reject chunk counts, duplicate/out-of-range indexes, and mismatched IDs', async t => {
  const { service, socket } = fixture(t);
  service.files.set('file1', share());
  for (const indexes of [2, [0, 0], [-1], [3], [1.5]]) {
    for (const field of ['uploadedChunks', 'acknowledgedChunks']) {
      socket.respond('start-transfer', started({ [field]: indexes }));
      await assert.rejects(service.startTransfer('file1'), /index arrays/);
      const state = snapshot();
      state.summary[field] = indexes;
      socket.respond('get-transfer-state', state);
      await assert.rejects(service.getTransferState('transfer1'), /index arrays/);
    }
  }
  for (const response of [started({ fileId: 'other' }), started({ transferId: 'other' }), started({ chunkSize: 5, totalChunks: 2 })]) {
    socket.respond('start-transfer', response);
    await assert.rejects(service.startTransfer('file1'), /mismatch/);
  }
  for (const response of [snapshot({ roomCode: 'other' }), snapshot({ fileId: 'other' }), snapshot({ transferId: 'other' })]) {
    socket.respond('get-transfer-state', response);
    await assert.rejects(service.getTransferState('transfer1'), /mismatch/);
  }
});

test('acknowledge/cancel are dispatch-only without callback and reject offline dispatch', async t => {
  const { service, socket } = fixture(t);
  service.files.set('file1', share());
  await service.acknowledgeChunk('transfer1', 2);
  await service.cancelTransfer('transfer1', 'sender_cancelled');
  assert.deepEqual(socket.sent[0], {
    event: 'ack-transfer-chunk', payload: { transferId: 'transfer1', chunkIndex: 2, peerId: 'peer1' }, args: []
  });
  assert.deepEqual(socket.sent[1], {
    event: 'cancel-transfer',
    payload: { roomCode: 'room', transferId: 'transfer1', peerId: 'peer1', reason: 'sender_cancelled' }, args: []
  });
  assert.equal(service.pendingRequests.size, 0);
  await assert.rejects(service.acknowledgeChunk('transfer1', 3), /Invalid chunk index/);
  socket.connected = false;
  await assert.rejects(service.acknowledgeChunk('transfer1', 0), /Not connected/);
  await assert.rejects(service.cancelTransfer('transfer1', 'sender_cancelled'), /Not connected/);
  assert.equal(socket.sent.length, 2);
});

test('transfer pushes forward counts without inventing index sets and completion updates metadata', t => {
  const { service, socket, events } = fixture(t);
  service.files.set('file1', share());
  const update = {
    fileId: 'file1', transferId: 'transfer1', chunkIndex: 2,
    status: { state: 'transferring', uploadedChunks: 2, acknowledgedChunks: 1, senderConnected: true }
  };
  socket.push('transfer-updated', update);
  assert.equal(events.onTransferUpdated[0][0], update);
  assert.equal(service.getFiles()[0].transfer.uploadedChunks, 2);
  assert.equal(service.getFiles()[0].transfer.acknowledgedChunks, 1);
  assert.equal(Object.hasOwn(service.getFiles()[0].transfer, 'chunkIndex'), false);
  socket.push('transfer-completed', { ...update, status: { state: 'transferring', uploadedChunks: 3, acknowledgedChunks: 3 } });
  assert.equal(service.getFiles()[0].status, 'completed');
  assert.equal(service.getFiles()[0].transfer.state, 'completed');
  assert.equal(events.onTransferCompleted[0][0].status.state, 'completed');
  assert.equal(events.onFilesChanged.length, 2);
});

test('invalid transfer pushes report errors without changing connection or file state', t => {
  const { service, socket, events } = fixture(t);
  const file = share();
  service.files.set(file.id, file);
  const update = {
    fileId: 'file1', transferId: 'transfer1',
    status: { state: 'transferring', uploadedChunks: 2, acknowledgedChunks: 1 }
  };
  const malformed = [
    null, { ...update, transferId: '' }, { ...update, transferId: 'other' },
    { ...update, fileId: ' ' }, { ...update, status: { ...update.status, state: '' } },
    { ...update, status: { ...update.status, uploadedChunks: [0, 1] } },
    { ...update, status: { ...update.status, uploadedChunks: 4 } },
    { ...update, status: { ...update.status, acknowledgedChunks: -1 } }
  ];
  for (const value of malformed) socket.push('transfer-updated', value);
  assert.equal(events.onTransferError.length, malformed.length);
  assert.equal(events.onConnectionChanged.length, 0);
  assert.equal(events.onTransferUpdated.length, 0);
  assert.equal(events.onFilesChanged.length, 0);
  assert.equal(service.getFiles()[0], file);
  assert.equal(service.isConnected(), true);
});

test('chunk templates support both placeholder forms, encode IDs, and resolve from backend origin', t => {
  const { service } = fixture(t);
  assert.equal(service.getChunkUrl(undefined, 'a/b?c#{x}', 2),
    'https://backend.example/api/transfers/a%2Fb%3Fc%23%7Bx%7D/chunks/2');
  for (const template of [
    '/api/transfers/:transferId/chunks/:chunkIndex',
    'api/transfers/{transferId}/chunks/{chunkIndex}',
    'https://backend.example/api/transfers/:transferId/chunks/{chunkIndex}'
  ]) {
    assert.equal(service.getChunkUrl(template, 'a/b', 3),
      'https://backend.example/api/transfers/a%2Fb/chunks/3');
  }
});

test('chunk templates reject other origins, protocols, credentials, and unresolved placeholders', t => {
  const { service } = fixture(t);
  for (const template of [
    'https://other.example/:transferId/:chunkIndex', '//other.example/chunk',
    'http://backend.example/chunk', 'https://backend.example:444/chunk',
    'https://user:pass@backend.example/chunk', 'javascript:alert(1)', 'data:text/plain,hi',
    '/api/{unknown}', ''
  ]) assert.throws(() => service.getChunkUrl(template, 'transfer1', 0));
  assert.throws(() => service.getChunkUrl(undefined, '..', 0));
  assert.throws(() => service.getChunkUrl(undefined, 'transfer1', -1));
});

test('disconnect retains offline shares, cancels requests, and rejoin replaces authoritative lists', async t => {
  const { service, socket, events } = fixture(t);
  const file = share();
  service.files.set(file.id, file);
  const pending = service.startTransfer('file1');
  const rejected = assert.rejects(pending, /Connection lost/);
  service.cleanup();
  await rejected;
  assert.equal(service.pendingRequests.size, 0);
  assert.equal(service.getFiles()[0], file);
  assert.equal(events.onFilesChanged.length, 0);
  socket.respond('join-room', {
    success: true, peers: [{ id: 'peer2', name: 'Bob', lastSeen: 1 }],
    files: [], texts: [{ id: 'text1', text: 'history', peerId: 'peer2', peerName: 'Bob', createdAt: 1 }]
  });
  await service.joinRoom();
  assert.deepEqual(socket.sent.at(-1).payload, { roomCode: 'room', peerName: 'Alice', peerId: 'peer1' });
  assert.equal(service.getFileCount(), 0);
  assert.equal(service.getPeerCount(), 2);
  assert.equal(events.onTextsChanged.at(-1)[0][0].text, 'history');
});

test('peer deduplication, peer rename/leave, and remove-file protocol remain unchanged', async t => {
  const { service, socket, events } = fixture(t);
  const peer = { id: 'peer2', name: 'Bob', lastSeen: 1 };
  socket.push('peer-joined', { ...peer, id: 'peer1' });
  socket.push('peer-joined', peer);
  socket.push('peer-joined', peer);
  assert.equal(events.onPeerJoined.length, 1);
  socket.push('peer-updated', { ...peer, name: 'Robert' });
  assert.equal(service.getPeers()[0].name, 'Robert');
  socket.push('peer-left', { peerId: 'peer2' });
  socket.push('peer-joined', peer);
  assert.equal(events.onPeerJoined.length, 2);
  assert.equal(events.onPeerLeft[0][0], 'peer2');
  service.updatePeerName('New Alice');
  assert.deepEqual(socket.sent.at(-1).payload, { roomCode: 'room', peerId: 'peer1', peerName: 'New Alice' });
  service.files.set('file1', share());
  socket.respond('remove-file', { success: true });
  assert.equal(await service.removeFile('file1'), true);
  assert.deepEqual(socket.sent.at(-1).payload, { fileId: 'file1', roomCode: 'room' });
  socket.push('file-removed', { fileId: 'file1' });
  assert.equal(events.onFileRemoved[0][0], 'file1');
});

test('chat can resolve from matching text-added broadcast without server acknowledgement', async t => {
  const { service, socket, events } = fixture(t);
  const baseline = socket.listenerCount('text-added');
  const pending = service.addText('hello', 'text1', 123);
  assert.deepEqual(socket.sent[0].payload, {
    roomCode: 'room', text: { id: 'text1', message: 'hello', peerId: 'peer1', peerName: 'Alice', createdAt: 123 }
  });
  let settled = false;
  pending.then(() => { settled = true; });
  socket.push('text-added', { id: 'text1', text: 'other peer', peerId: 'peer2', peerName: 'Bob', createdAt: 123 });
  await Promise.resolve();
  assert.equal(settled, false);
  socket.push('text-added', { id: 'text1', text: 'hello', peerId: 'peer1', peerName: 'Alice', createdAt: 123 });
  assert.equal((await pending).text, 'hello');
  assert.equal(events.onTextAdded.length, 2);
  assert.equal(socket.listenerCount('text-added'), baseline);
  assert.equal(service.pendingRequests.size, 0);
});

test('chat handles explicit acknowledgements and disconnect removes pending broadcast confirmation', async t => {
  const { service, socket } = fixture(t);
  socket.respond('add-text', { success: true, text: { id: 'text1', message: 'normalized' } });
  assert.equal((await service.addText('hello', 'text1', 123)).text, 'normalized');
  socket.handlers.delete('add-text');
  const baseline = socket.listenerCount('text-added');
  const pending = service.addText('pending', 'text2', 456);
  assert.equal(socket.listenerCount('text-added'), baseline + 1);
  const rejected = assert.rejects(pending, /Connection lost/);
  service.cleanup();
  await rejected;
  assert.equal(socket.listenerCount('text-added'), baseline);
  assert.equal(service.pendingRequests.size, 0);
});
