import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import http from 'node:http';
import express from 'express';
import test from 'node:test';

test('production upload static handler hides raw and encoded private paths but serves old media', async t => {
  const root = await mkdtemp(path.join(tmpdir(), 'upload-static-test-'));
  t.after(() => rm(root, {recursive:true, force:true}));
  await mkdir(path.join(root, '.upload-sessions'));
  await writeFile(path.join(root, '.upload-sessions', 'secret.part'), 'private content');
  await writeFile(path.join(root, 'old.mp4'), 'old media');
  const { createUploadStatic } = await import('../src/uploads/local/static');
  const app = express(); app.use('/uploads', createUploadStatic(root));
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  t.after(() => new Promise<void>(resolve => server.close(() => resolve())));
  const port = (server.address() as any).port;
  for (const target of ['.upload-sessions/secret.part', '%2eupload-sessions/secret.part', '%252eupload-sessions/secret.part', 'x/%2e%2e/.upload-sessions/secret.part', '%2eupload-sessions%5csecret.part']) {
    const response = await new Promise<{status:number, body:string}>((resolve,reject) => {
      http.get({host:'127.0.0.1',port,path:`/uploads/${target}`}, res => {
        let body=''; res.on('data', b => body+=b); res.on('end', () => resolve({status:res.statusCode!,body}));
      }).on('error', reject);
    });
    assert.ok(response.status >= 400);
    assert.ok(!response.body.includes('private content'));
  }
  const old = await fetch(`http://127.0.0.1:${port}/uploads/old.mp4`);
  assert.equal(old.status,200); assert.equal(await old.text(),'old media');
});
