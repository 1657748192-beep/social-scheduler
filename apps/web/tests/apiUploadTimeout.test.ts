import assert from "node:assert/strict";
import test from "node:test";
import { apiUpload } from "../lib/api";

// XMLHttpRequest is a browser boundary unavailable in Node. The real apiUpload
// still decides timeout, status handling, progress and session-expiry behavior.
class UploadTransport {
  static latest: UploadTransport;
  timeout = 0;
  status = 0;
  responseText = "";
  upload: any = {};
  onload!: () => void;
  ontimeout!: () => void;
  onerror!: () => void;
  onabort!: () => void;
  constructor() { UploadTransport.latest = this; }
  open() {}
  setRequestHeader() {}
  send() {}
}

function start(context: any) {
  const before = Object.getOwnPropertyDescriptor(globalThis, "XMLHttpRequest");
  Object.defineProperty(globalThis, "XMLHttpRequest", { configurable: true, value: UploadTransport });
  context.after(() => {
    if (before) Object.defineProperty(globalThis, "XMLHttpRequest", before);
    else delete (globalThis as any).XMLHttpRequest;
  });
  const promise = apiUpload("/workspaces/w/media", "fixture", new FormData());
  return { promise, transport: UploadTransport.latest };
}

test("browser upload waits 35 minutes so server can finish after receiving", async context => {
  const { promise, transport } = start(context);
  const timeout = transport.timeout;
  transport.status = 201; transport.responseText = '{"id":"asset"}'; transport.onload();
  assert.deepEqual(await promise, { id: "asset" });
  assert.equal(timeout, 35 * 60 * 1000);
});

for (const body of ["", "<html>Request Timeout</html>", '{"message":"Request timeout"}']) {
  test(`HTTP 408 becomes actionable upload timeout (${body || "empty"})`, async context => {
    const { promise, transport } = start(context);
    transport.status = 408; transport.responseText = body; transport.onload();
    await assert.rejects(promise, /上传超时，请重试/);
  });
}

test("browser timeout uses the same actionable message", async context => {
  const { promise, transport } = start(context);
  transport.ontimeout();
  await assert.rejects(promise, /上传超时，请重试/);
});

test("file limit errors retain the server's 250 MB explanation", async context => {
  const { promise, transport } = start(context);
  transport.status = 413; transport.responseText = '{"message":"单个图片或视频不能超过 250 MB"}'; transport.onload();
  await assert.rejects(promise, /不能超过 250 MB/);
});

test('legacy upload errors preserve HTTP status for shared upload UI',async context=>{
 const {promise,transport}=start(context);transport.status=403;transport.responseText='{"message":"Forbidden"}';transport.onload();
 await assert.rejects(promise,{status:403});
});
