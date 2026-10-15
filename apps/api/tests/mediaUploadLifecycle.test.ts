import assert from "node:assert/strict";
import { once } from "node:events";
import { request } from "node:http";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import express from "express";
import test from "node:test";
import * as uploads from "../src/middleware/upload";
import { createApiServer, allowMediaUploadTime } from "../src/httpServer";

async function fixture(context: any) {
  const create = (uploads as any).createMediaUpload;
  assert.equal(typeof create, "function", "Upload receiver must clean files on a receive timeout");
  const directory = await mkdtemp(join(tmpdir(), "scheduler-upload-test-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const app = express();
  app.post("/upload", allowMediaUploadTime, create(directory).fields([
    { name: "file", maxCount: 1 }, { name: "thumbnail", maxCount: 1 }
  ]), (_req: any, res: any) => res.sendStatus(201));
  app.use((_error: Error, _req: any, res: any, _next: any) => {
    if (!res.writableEnded) res.sendStatus(500);
  });
  const server = createApiServer(app, { ordinaryRequestTimeoutMs: 100, uploadRequestTimeoutMs: 600 });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  context.after(() => { server.closeAllConnections(); server.close(); });
  const port = (server.address() as any).port;
  return { port, directory };
}

test("timed-out multipart uploads remove both completed and partial temporary files", async context => {
  const { port, directory } = await fixture(context);
  const result = new Promise<number>((resolve, reject) => {
    const req = request({ port, hostname: "127.0.0.1", path: "/upload", method: "POST", headers: {
      "Content-Type": "multipart/form-data; boundary=fixture"
    } }, res => { res.resume(); res.on("end", () => resolve(res.statusCode!)); });
    req.on("error", reject);
    req.write('--fixture\r\nContent-Disposition: form-data; name="thumbnail"; filename="thumb.png"\r\nContent-Type: image/png\r\n\r\ncomplete\r\n');
    req.write('--fixture\r\nContent-Disposition: form-data; name="file"; filename="video.mp4"\r\nContent-Type: video/mp4\r\n\r\npartial');
  });
  await delay(100);
  assert.equal((await readdir(directory)).length, 2, "fixture must actually write both files");
  assert.equal(await result, 408);
  for (let i = 0; i < 30 && (await readdir(directory)).length; i++) await delay(20);
  assert.deepEqual(await readdir(directory), []);
});

test("successful uploads retain their media file after the response closes", async context => {
  const { port, directory } = await fixture(context);
  const status = await new Promise<number>((resolve, reject) => {
    const req = request({ port, hostname: "127.0.0.1", path: "/upload", method: "POST", headers: {
      "Content-Type": "multipart/form-data; boundary=fixture"
    } }, res => { res.resume(); res.on("end", () => resolve(res.statusCode!)); });
    req.on("error", reject);
    req.end('--fixture\r\nContent-Disposition: form-data; name="file"; filename="video.mp4"\r\nContent-Type: video/mp4\r\n\r\nretained\r\n--fixture--\r\n');
  });
  assert.equal(status, 201);
  const files = await readdir(directory);
  assert.equal(files.length, 1);
  assert.equal(await readFile(join(directory, files[0]), "utf8"), "retained");
});

test("client disconnects clean partial uploads without waiting for the deadline", async context => {
  const { port, directory } = await fixture(context);
  const req = request({ port, hostname: "127.0.0.1", path: "/upload", method: "POST", headers: {
    "Content-Type": "multipart/form-data; boundary=fixture"
  } });
  req.on("error", () => {});
  req.write('--fixture\r\nContent-Disposition: form-data; name="file"; filename="video.mp4"\r\nContent-Type: video/mp4\r\n\r\npartial');
  for (let i = 0; i < 20 && !(await readdir(directory)).length; i++) await delay(10);
  assert.equal((await readdir(directory)).length, 1);
  req.destroy();
  for (let i = 0; i < 20 && (await readdir(directory)).length; i++) await delay(10);
  assert.deepEqual(await readdir(directory), []);
});
