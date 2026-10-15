import assert from "node:assert/strict";
import { request } from "node:http";
import { once } from "node:events";
import { setTimeout as delay } from "node:timers/promises";
import express from "express";
import test from "node:test";
import * as application from "../src/httpServer";

// Real HTTP bodies, with scaled deadlines: changing the normal/upload deadline
// selection must break these tests, not just an assertion about a constant.
async function fixture(context: any) {
  const create = (application as any).createApiServer;
  assert.equal(typeof create, "function", "API server must enforce per-request receive deadlines");
  const app = express();
  const extend = (application as any).allowMediaUploadTime;
  app.post("/upload", (req, res, next) => {
    if (req.headers.authorization !== "Bearer fixture") return res.sendStatus(401);
    extend(req, res, next);
  });
  app.use(express.raw({ type: () => true }));
  app.use(async (req, res) => {
    if (req.path === "/processing") await delay(220);
    res.json({ bytes: req.body.length });
  });
  app.use((_error: Error, _req: any, res: any, _next: any) => {
    if (!res.writableEnded) res.sendStatus(500);
  });
  const server = create(app, { ordinaryRequestTimeoutMs: 120, uploadRequestTimeoutMs: 800 });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  context.after(() => { server.closeAllConnections(); server.close(); });
  return server.address().port;
}

function send(port: number, path: string, endAfter: number, authorized = true, multipart = true) {
  return new Promise<{ status: number; body: string }>((resolve, reject) => {
    const req = request({ hostname: "127.0.0.1", port, path, method: "POST", headers: {
      "Content-Length": "2", "Content-Type": multipart ? "multipart/form-data; boundary=fixture" : "application/octet-stream",
      ...(authorized ? { Authorization: "Bearer fixture" } : {})
    } }, res => {
      let body = "";
      res.on("data", chunk => { body += chunk; });
      res.on("end", () => resolve({ status: res.statusCode!, body }));
    });
    req.on("error", reject);
    req.write("a");
    const timer = setTimeout(() => req.end("b"), endAfter);
    req.on("close", () => clearTimeout(timer));
  });
}

test("authorized uploads survive the ordinary receive deadline", async context => {
  const port = await fixture(context);
  const result = await send(port, "/upload", 260);
  assert.equal(result.status, 200);
  assert.deepEqual(JSON.parse(result.body), { bytes: 2 });
});

test("ordinary endpoints still return 408 for an incomplete body", async context => {
  const result = await send(await fixture(context), "/ordinary", 260);
  assert.equal(result.status, 408);
});

test("uploads exceeding their own receive deadline return a clear 408", async context => {
  const result = await send(await fixture(context), "/upload", 1200);
  assert.equal(result.status, 408);
  assert.match(JSON.parse(result.body).message, /上传超时.*重试/);
});

test("receiving a complete body clears the deadline before processing", async context => {
  const result = await send(await fixture(context), "/processing", 10);
  assert.equal(result.status, 200);
});

test("unauthenticated requests cannot acquire the upload receive budget", async context => {
  const result = await send(await fixture(context), "/upload", 260, false);
  assert.equal(result.status, 401);
});

test("nonmultipart requests to the upload endpoint retain the ordinary deadline", async context => {
  const result = await send(await fixture(context), "/upload", 260, true, false);
  assert.equal(result.status, 408);
});

test("a receive deadline safely closes an already-started response without crashing", async context => {
  const create = (application as any).createApiServer;
  const server = create((_req: any, res: any) => { res.writeHead(200); res.write("started"); },
    { ordinaryRequestTimeoutMs: 80, uploadRequestTimeoutMs: 500 });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  context.after(() => { server.closeAllConnections(); server.close(); });
  await new Promise<void>((resolve, reject) => {
    const req = request({ hostname: "127.0.0.1", port: server.address().port, method: "POST",
      headers: { "Content-Length": "2" } }, res => {
      res.resume(); res.on("aborted", resolve); res.on("end", () => reject(new Error("Expected aborted response")));
    });
    req.on("error", reject); req.write("a");
  });
});
