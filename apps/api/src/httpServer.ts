import { createServer, type IncomingMessage, type RequestListener } from "node:http";
import type { RequestHandler } from "express";

const ordinaryRequestTimeoutMs = 5 * 60 * 1000;
const uploadRequestTimeoutMs = 30 * 60 * 1000;
const receiveDeadlines = new WeakMap<IncomingMessage, () => void>();

// Only mount after authentication and workspace upload authorization. A URL or
// Content-Type alone must never grant a longer receive budget.
export const allowMediaUploadTime: RequestHandler = (req, res, next) => {
  if (req.destroyed || res.writableEnded) return;
  if (req.method === "POST" && req.is("multipart/form-data")) {
    receiveDeadlines.get(req)?.();
  }
  next();
};

export function createApiServer(
  listener: RequestListener,
  deadlines = { ordinaryRequestTimeoutMs, uploadRequestTimeoutMs }
) {
  // Node's parser budget is server-wide; socket.setTimeout() cannot override
  // it. Keep its header protection and impose the ordinary body budget below.
  return createServer({ requestTimeout: deadlines.uploadRequestTimeoutMs,
    headersTimeout: Math.min(60_000, deadlines.uploadRequestTimeoutMs) }, (req, res) => {
    const startedAt = performance.now();
    let timer: NodeJS.Timeout;
    let upload = false;
    const clear = () => { clearTimeout(timer); receiveDeadlines.delete(req); };
    const arm = (budget: number) => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (req.complete || req.destroyed || res.writableEnded) return clear();
        if (res.headersSent) { clear(); req.destroy(); return; }
        res.shouldKeepAlive = false;
        res.writeHead(408, { "Content-Type": "application/json; charset=utf-8", Connection: "close" });
        res.end(JSON.stringify({ error: "RequestTimeout", message: upload ? "上传超时，请重试" : "请求超时，请重试" }));
      }, Math.max(1, budget - (performance.now() - startedAt)));
      timer.unref();
    };
    receiveDeadlines.set(req, () => { upload = true; arm(deadlines.uploadRequestTimeoutMs); });
    arm(deadlines.ordinaryRequestTimeoutMs);
    req.once("end", clear);
    req.once("close", clear);
    res.once("close", clear);
    res.once("finish", () => {
      clear();
      // Finish sending 408/401 before aborting the incomplete body. This also
      // prevents a rejected upload from occupying a keep-alive connection.
      if (!req.complete) req.destroy();
    });
    listener(req, res);
  });
}
