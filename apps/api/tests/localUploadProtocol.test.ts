import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import * as protocol from "../src/uploads/local/protocol";
import * as fixtures from "./helpers/localUploadFixture";

const api = protocol as any;
const hashA = "ca978112ca1bbdcafac231b39a23dc4da786eff8147c4e72b9807785afee48bb";
function manifest(sizeBytes = 1) {
  const partHashes = Array(Math.ceil(sizeBytes / 1048576)).fill(hashA);
  return { clientKey: "b17acafb-1317-4c40-9705-cff57893e8ca", originalName: "video.mp4", mimeType: "video/mp4", sizeBytes,
    partHashes, fingerprint: createHash("sha256").update(JSON.stringify([sizeBytes, "video/mp4", partHashes])).digest("hex") };
}

test("manifest accepts the exact 250 MiB limit but rejects oversized or inconsistent declarations", () => {
  assert.equal(typeof api.parseManifest, "function");
  assert.equal(api.parseManifest(manifest(262144000)).sizeBytes, 262144000);
  for (const value of [null, manifest(262144001), manifest(0), { ...manifest(), sizeBytes: NaN }, { ...manifest(), partHashes: [] },
    { ...manifest(), fingerprint: "0".repeat(64) }, { ...manifest(), clientKey: "../other" },
    { ...manifest(), originalName: "../other.mp4" }, { ...manifest(), originalName: "x".repeat(256) },
    { ...manifest(), mimeType: "application/javascript" }, { ...manifest(), partHashes: ["bad"] }]) {
    assert.throws(() => api.parseManifest(value));
  }
});

test("part lengths include exact tails and reject out of range or fractional indices", () => {
  assert.equal(typeof api.expectedPartBytes, "function");
  assert.equal(api.expectedPartBytes(1048577, 0), 1048576);
  assert.equal(api.expectedPartBytes(1048577, 1), 1);
  assert.equal(api.expectedPartBytes(262144000, 249), 1048576);
  for (const [size, index] of [[1048576, 1], [1, -1], [1, 0.5], [0, 0], [NaN, 0], [262144001, 0]]) {
    assert.throws(() => api.expectedPartBytes(size, index));
  }
});

test("fingerprints use content and match an independently calculated wire fixture", async () => {
  assert.equal(typeof api.computeFingerprint, "function");
  assert.equal(await api.computeFingerprint(1, "video/mp4", [hashA]), "dcaca25e8dfedf9907dd9eb4cad9fb1b446b6412851f9c22841a35d7c2572c30");
  assert.notEqual(await api.computeFingerprint(1, "video/mp4", ["3e23e8160039594a33894f6564e1b1348bbd7a0088d42c4acb73eeaed59c009d"]),
    "dcaca25e8dfedf9907dd9eb4cad9fb1b446b6412851f9c22841a35d7c2572c30");
});

test("test fixture refuses absent, nonlocal and production-equivalent services before connecting", async context => {
  assert.equal(typeof (fixtures as any).validateLocalUploadTestEnvironment, "function");
  const validate = (fixtures as any).validateLocalUploadTestEnvironment;
  const good = { LOCAL_UPLOAD_TEST_DATABASE_URL: "postgresql://u:p@127.0.0.1:55436/upload_test", LOCAL_UPLOAD_TEST_REDIS_URL: "redis://127.0.0.1:55437/0",
    DATABASE_URL: "postgresql://unused:unused@127.0.0.1:1/unused", REDIS_URL: "redis://127.0.0.1:1" };
  assert.doesNotThrow(() => validate(good));
  for (const env of [{}, { ...good, LOCAL_UPLOAD_TEST_DATABASE_URL: good.DATABASE_URL },
    { ...good, LOCAL_UPLOAD_TEST_DATABASE_URL: "postgresql://u:p@db.example.com/upload_test" },
    { ...good, LOCAL_UPLOAD_TEST_DATABASE_URL: "postgresql://u:p@127.0.0.1/production" },
    { ...good, LOCAL_UPLOAD_TEST_REDIS_URL: good.REDIS_URL },
    { ...good, LOCAL_UPLOAD_TEST_REDIS_URL: "redis://cache.example.com/0" }]) {
    assert.throws(() => validate(env));
  }
});
