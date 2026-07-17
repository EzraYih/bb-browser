import test from "node:test";
import assert from "node:assert/strict";
import { pickPreferredSiteTab, HEALTH_CHECK_SCRIPT } from "./commands/site";

test("prefers exact URL tab over another tab on the same domain", () => {
  const selected = pickPreferredSiteTab(
    [
      {
        index: 0,
        url: "https://www.xiaohongshu.com/explore/646432bb00000000130168ab?xsec_token=t1&xsec_source=",
        title: "generic",
        active: true,
        tabId: "tab-a",
        tab: "36d3",
      },
      {
        index: 1,
        url: "https://www.xiaohongshu.com/explore/646432bb00000000130168ab?xsec_token=t1%3D&xsec_source=",
        title: "exact",
        active: false,
        tabId: "tab-b",
        tab: "e120",
      },
    ],
    "www.xiaohongshu.com",
    "https://www.xiaohongshu.com/explore/646432bb00000000130168ab?xsec_token=t1%3D&xsec_source=",
  );

  assert.equal(selected?.tabId, "tab-b");
});

test("prefers the most recent exact URL tab when multiple tabs share the same URL", () => {
  const selected = pickPreferredSiteTab(
    [
      {
        index: 0,
        url: "https://www.xiaohongshu.com/explore/66eaf19e000000002503263d?xsec_token=t1&xsec_source=",
        title: "older",
        active: true,
        tabId: "tab-a",
        tab: "01e5",
      },
      {
        index: 1,
        url: "https://www.xiaohongshu.com/explore/66eaf19e000000002503263d?xsec_token=t1&xsec_source=",
        title: "newer",
        active: false,
        tabId: "tab-b",
        tab: "3193",
      },
    ],
    "www.xiaohongshu.com",
    "https://www.xiaohongshu.com/explore/66eaf19e000000002503263d?xsec_token=t1&xsec_source=",
  );

  assert.equal(selected?.tabId, "tab-b");
});

// ═══════════════════════════════════════════════════════════════════
// HEALTH_CHECK_SCRIPT — tab 健康检查脚本 (Task 4)
// ═══════════════════════════════════════════════════════════════════

test("HEALTH_CHECK_SCRIPT is a non-empty string", () => {
  assert.equal(typeof HEALTH_CHECK_SCRIPT, "string");
  assert.ok(HEALTH_CHECK_SCRIPT.length > 0);
});

test("HEALTH_CHECK_SCRIPT returns JSON with ok field", () => {
  // The script should be a self-executing function that returns JSON
  assert.ok(HEALTH_CHECK_SCRIPT.includes("ok"));
  assert.ok(HEALTH_CHECK_SCRIPT.includes("url"));
  assert.ok(HEALTH_CHECK_SCRIPT.includes("readyState"));
});

test("HEALTH_CHECK_SCRIPT includes try-catch for error resilience", () => {
  assert.ok(HEALTH_CHECK_SCRIPT.includes("try"));
  assert.ok(HEALTH_CHECK_SCRIPT.includes("catch"));
});
