import assert from "node:assert/strict";
import test from "node:test";
import * as wire from "../lib/localUploadProtocol";

test("browser fingerprint matches API wire format and distinguishes equal-size different contents", async () => {
  const compute = (wire as any).computeFingerprint;
  assert.equal(typeof compute, "function");
  assert.equal(await compute(1, "video/mp4", ["ca978112ca1bbdcafac231b39a23dc4da786eff8147c4e72b9807785afee48bb"]),
    "dcaca25e8dfedf9907dd9eb4cad9fb1b446b6412851f9c22841a35d7c2572c30");
  assert.equal(await compute(1, "video/mp4", ["3e23e8160039594a33894f6564e1b1348bbd7a0088d42c4acb73eeaed59c009d"]),
    "945060d9c8f221402b4b77088807c82eda868d704b0a89d22324476d67d5cbbf");
});
