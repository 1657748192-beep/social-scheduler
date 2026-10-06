import assert from "node:assert/strict";
import test from "node:test";
import { assertTikTokSandboxAccess } from "../src/services/tiktokSandboxPolicy";

const valid = {
  enabled: true, allowedUserId: "u", allowedWorkspaceId: "w", allowedAccountId: "a",
  clientId: "sandbox", clientSecret: "secret", userId: "u", workspaceId: "w", accountId: "a",
  memberStatus: "active", role: "owner"
};
for (const role of ["owner", "admin"]) test(`sandbox permits matching active ${role}`, () => {
  assert.doesNotThrow(() => assertTikTokSandboxAccess({ ...valid, role }));
});
for (const [name, change] of Object.entries({
  disabled: { enabled: false }, missingUser: { allowedUserId: "" }, missingWorkspace: { allowedWorkspaceId: "" },
  missingAccount: { allowedAccountId: "" }, missingKey: { clientId: "" }, missingSecret: { clientSecret: "" },
  otherUser: { userId: "other" }, otherWorkspace: { workspaceId: "other" }, otherAccount: { accountId: "other" },
  disabledMember: { memberStatus: "disabled" }, invitedMember: { memberStatus: "invited" },
  editor: { role: "editor" }, viewer: { role: "viewer" }
})) test(`sandbox rejects ${name}`, () => {
  assert.throws(() => assertTikTokSandboxAccess({ ...valid, ...change }), (error: any) => {
    assert.equal(error.statusCode, 403); assert.equal(error.details, undefined);
    assert.ok(!error.message.includes("secret")); return true;
  });
});
