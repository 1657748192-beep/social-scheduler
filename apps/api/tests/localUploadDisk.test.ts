import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm, mkdir, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import fs from 'node:fs';
import test from 'node:test';

const digest = (b: Buffer) => createHash('sha256').update(b).digest('hex');
async function fixture(t: any) {
  const root = await mkdtemp(path.join(tmpdir(), 'upload-disk-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const { createLocalUploadDisk } = await import('../src/uploads/local/disk');
  return { root, disk: createLocalUploadDisk(root) };
}

test('only verified private blocks survive and a failed attempt preserves a winner', async t => {
  const {root, disk} = await fixture(t);
  const sid = randomUUID(), bytes = Buffer.from('original video bytes');
  const saved = await disk.receive(sid, 0, Readable.from([bytes]), bytes.length, digest(bytes), new AbortController().signal);
  assert.deepEqual(await readFile(path.join(root, saved.storageKey)), bytes);
  assert.equal(saved.sizeBytes, bytes.length);
  assert.equal(saved.sha256, digest(bytes));
  for (const [body, length, hash] of [
    [bytes, bytes.length - 1, digest(bytes)],
    [bytes, bytes.length + 1, digest(bytes)],
    [bytes, bytes.length, '0'.repeat(64)]
  ] as const) {
    await assert.rejects(disk.receive(sid, 0, Readable.from([body]), length, hash, new AbortController().signal));
    assert.deepEqual(await readdir(path.join(root, '.upload-sessions', sid)), [path.basename(saved.storageKey)]);
  }
  assert.ok(await disk.availableBytes() > 0n);
  await disk.removeOwned([saved.storageKey]);
  assert.deepEqual(await readdir(path.join(root, '.upload-sessions', sid)), []);
});

test('aborted and failed input streams remove only their own attempt', async t => {
  const {root, disk} = await fixture(t), sid = randomUUID();
  const input = new Readable({ read() {} }), controller = new AbortController();
  const result = disk.receive(sid, 0, input, 10, '0'.repeat(64), controller.signal);
  setTimeout(() => controller.abort(), 20);
  await assert.rejects(result);
  const broken = Readable.from((async function* () { yield Buffer.from('a'); throw Object.assign(new Error('disk full upstream'), {code:'ENOSPC'}); })());
  await assert.rejects(disk.receive(sid, 0, broken, 10, '0'.repeat(64), new AbortController().signal));
  assert.deepEqual(await readdir(path.join(root, '.upload-sessions', sid)), []);
});

test('ENOSPC on the real output file leaves no block and reports storage exhaustion', async t => {
  const {root, disk} = await fixture(t), sid = randomUUID();
  const original = fs.createWriteStream;
  t.mock.method(fs, 'createWriteStream', (...args: Parameters<typeof original>) => {
    const output = original(...args);
    output._write = (_chunk, _encoding, done) => done(Object.assign(new Error('disk full'), {code:'ENOSPC'}));
    return output;
  });
  await assert.rejects(disk.receive(sid, 0, Readable.from([Buffer.from('a')]), 1, digest(Buffer.from('a')), new AbortController().signal), {statusCode:507});
  assert.deepEqual(await readdir(path.join(root, '.upload-sessions', sid)), []);
});

test('an input already disconnected is rejected without waiting for request timeout', async t => {
  const {disk} = await fixture(t), source = new Readable({read(){}});
  source.destroy();
  await new Promise(resolve => source.once('close', resolve));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 80);
  try {
    await assert.rejects(disk.receive(randomUUID(), 0, source, 1, '0'.repeat(64), controller.signal), /interrupted/i);
  } finally { clearTimeout(timer); }
});

test('private storage rejects path traversal, invalid bounds and symlink session directories', async t => {
  const {root, disk} = await fixture(t), b = Buffer.from('a');
  for (const sid of ['../outside', '%2e%2e%2foutside', 'not-a-uuid']) {
    await assert.rejects(disk.receive(sid, 0, Readable.from([b]), 1, digest(b), new AbortController().signal));
  }
  for (const [index, size] of [[-1, 1], [250, 1], [0, 1048577], [0, 0]]) {
    await assert.rejects(disk.receive(randomUUID(), index, Readable.from([b]), size, digest(b), new AbortController().signal));
  }
  await assert.rejects(disk.removeOwned(['../outside', '.upload-sessions/../../outside']));
  const sid = randomUUID();
  await mkdir(path.join(root, '.upload-sessions'), {recursive:true});
  const outside = await mkdtemp(path.join(tmpdir(), 'upload-outside-test-'));
  t.after(() => rm(outside, {recursive:true, force:true}));
  await symlink(outside, path.join(root, '.upload-sessions', sid), 'junction');
  await assert.rejects(disk.receive(sid, 0, Readable.from([b]), 1, digest(b), new AbortController().signal));
  assert.deepEqual(await readdir(outside), []);
});
