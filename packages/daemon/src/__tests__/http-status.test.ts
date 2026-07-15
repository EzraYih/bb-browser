/**
 * /status endpoint tests — verify navigationEvents and lastKnownUrl are exposed.
 *
 * These tests verify that the /status API returns the new diagnostic fields
 * added by the nav-interrupt-diagnostics design (§2.1.5).
 *
 * Uses a real HttpServer + real CdpConnection (with mock socket) on a test port.
 */

import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import { HttpServer } from "../http-server.js";
import { CdpConnection } from "../cdp-connection.js";
import { TabStateManager } from "../tab-state.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let portCounter = 49700;

function nextPort(): number {
  return portCounter++;
}

/**
 * Create a CdpConnection with a tab that has navigation events.
 * The CDP connection is NOT actually connected (no WebSocket),
 * but the tabManager has tabs with navigation events.
 */
function createCdpWithNavEvents(): CdpConnection {
  const tabManager = new TabStateManager();
  const cdp = new CdpConnection("127.0.0.1", 9222, tabManager);

  // Add a tab with navigation events
  const tab = tabManager.addTab("TARGET_NAV_1234");
  tab.addNavigationEvent({
    type: "frame_navigated",
    url: "https://www.xiaohongshu.com/explore/abc123",
    timestamp: 1721000000000,
  });
  tab.addNavigationEvent({
    type: "target_destroyed",
    url: "https://www.xiaohongshu.com/explore/abc123",
    timestamp: 1721000001000,
  });

  // Add another tab with different navigation events
  const tab2 = tabManager.addTab("TARGET_NAV_5678");
  tab2.addNavigationEvent({
    type: "frame_navigated",
    url: "https://www.xiaohongshu.com/explore/xyz",
    timestamp: 1721000002000,
  });

  return cdp;
}

/**
 * Start an HttpServer on a test port and return it.
 */
async function startTestServer(cdp: CdpConnection): Promise<{ server: HttpServer; port: number }> {
  const port = nextPort();
  const server = new HttpServer({
    host: "127.0.0.1",
    port,
    cdp,
  });
  await server.start();
  return { server, port };
}

async function stopServer(server: HttpServer): Promise<void> {
  await server.stop();
}

async function fetchStatus(port: number): Promise<Record<string, unknown>> {
  const res = await fetch(`http://127.0.0.1:${port}/status`);
  assert.equal(res.status, 200);
  return (await res.json()) as Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("GET /status — navigationEvents + lastKnownUrl", () => {
  const servers: HttpServer[] = [];

  afterEach(async () => {
    for (const s of servers) {
      await stopServer(s);
    }
    servers.length = 0;
  });

  it("returns navigationEvents for each tab", async () => {
    const cdp = createCdpWithNavEvents();
    const { server, port } = await startTestServer(cdp);
    servers.push(server);

    const status = await fetchStatus(port);
    const tabs = status.tabs as Array<Record<string, unknown>>;

    assert.ok(tabs, "tabs should be present in /status response");
    assert.equal(tabs.length, 2, "should have 2 tabs");

    // First tab has 2 navigation events
    const tab1 = tabs.find((t) => t.targetId === "TARGET_NAV_1234");
    assert.ok(tab1, "tab TARGET_NAV_1234 should exist");
    const navEvents1 = tab1.navigationEvents as Array<Record<string, unknown>>;
    assert.ok(navEvents1, "navigationEvents should be present");
    assert.equal(navEvents1.length, 2);
    assert.equal(navEvents1[0].type, "frame_navigated");
    assert.equal(navEvents1[0].url, "https://www.xiaohongshu.com/explore/abc123");
    assert.equal(navEvents1[1].type, "target_destroyed");

    // Second tab has 1 navigation event
    const tab2 = tabs.find((t) => t.targetId === "TARGET_NAV_5678");
    assert.ok(tab2, "tab TARGET_NAV_5678 should exist");
    const navEvents2 = tab2.navigationEvents as Array<Record<string, unknown>>;
    assert.equal(navEvents2.length, 1);
    assert.equal(navEvents2[0].type, "frame_navigated");
    assert.equal(navEvents2[0].url, "https://www.xiaohongshu.com/explore/xyz");
  });

  it("returns lastKnownUrl for each tab", async () => {
    const cdp = createCdpWithNavEvents();
    const { server, port } = await startTestServer(cdp);
    servers.push(server);

    const status = await fetchStatus(port);
    const tabs = status.tabs as Array<Record<string, unknown>>;

    // First tab: lastKnownUrl should be the URL from the frame_navigated event
    const tab1 = tabs.find((t) => t.targetId === "TARGET_NAV_1234");
    assert.ok(tab1);
    assert.equal(tab1.lastKnownUrl, "https://www.xiaohongshu.com/explore/abc123");

    // Second tab: lastKnownUrl should be set from its frame_navigated event
    const tab2 = tabs.find((t) => t.targetId === "TARGET_NAV_5678");
    assert.ok(tab2);
    assert.equal(tab2.lastKnownUrl, "https://www.xiaohongshu.com/explore/xyz");
  });

  it("returns empty navigationEvents for tab with no navigation", async () => {
    const tabManager = new TabStateManager();
    const cdp = new CdpConnection("127.0.0.1", 9222, tabManager);
    tabManager.addTab("TARGET_EMPTY"); // no navigation events

    const { server, port } = await startTestServer(cdp);
    servers.push(server);

    const status = await fetchStatus(port);
    const tabs = status.tabs as Array<Record<string, unknown>>;

    assert.equal(tabs.length, 1);
    const tab = tabs[0];
    assert.equal(tab.targetId, "TARGET_EMPTY");
    assert.deepEqual(tab.navigationEvents, []);
    assert.equal(tab.lastKnownUrl, "");
  });

  it("includes navigationEvents with seq field", async () => {
    const cdp = createCdpWithNavEvents();
    const { server, port } = await startTestServer(cdp);
    servers.push(server);

    const status = await fetchStatus(port);
    const tabs = status.tabs as Array<Record<string, unknown>>;

    const tab1 = tabs.find((t) => t.targetId === "TARGET_NAV_1234");
    const navEvents = tab1!.navigationEvents as Array<Record<string, unknown>>;

    // Each event should have a seq field
    for (const event of navEvents) {
      assert.ok(typeof event.seq === "number", "seq should be a number");
      assert.ok(event.seq > 0, "seq should be positive");
    }

    // seq should be monotonically increasing
    assert.ok(navEvents[0].seq < navEvents[1].seq, "seq should be increasing");
  });
});
