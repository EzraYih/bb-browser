import test from "node:test";
import assert from "node:assert/strict";
import { pickPreferredSiteTab } from "./commands/site.js";

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
