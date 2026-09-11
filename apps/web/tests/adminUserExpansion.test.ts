import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("admin user cards keep details collapsed until their summary is expanded", () => {
  const admin = readFileSync("apps/web/app/admin/page.tsx", "utf8");

  assert.match(admin, /const \[expandedUserId, setExpandedUserId\] = useState<string \| null>\(null\)/);
  assert.match(admin, /aria-expanded=\{expandedUserId === user\.id\}/);
  assert.match(admin, /expandedUserId === user\.id \? t\("收起详情", "Collapse details"\) : t\("展开详情", "Expand details"\)/);
  assert.match(admin, /\{expandedUserId === user\.id \? \(/);
});
