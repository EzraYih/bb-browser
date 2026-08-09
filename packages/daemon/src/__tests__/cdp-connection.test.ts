/**
 * CdpConnection tests — sessionCommand timeout + targetDestroyed cleanup.
 *
 * These tests verify the diagnostic-critical behaviors:
 * 1. sessionCommand rejects after timeoutMs when no response arrives
 * 2. Target.targetDestroyed event rejects pending sessionCommands
 * 3. Pending sessionCommand tracking is cleaned up after timeout/destroy
 *
 * Uses mock WebSocket (EventEmitter) — no real Chrome or WebSocket needed.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { CdpConnection } from "../cdp-connection.js";
import { TabStateManager } from "../tab-state.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Create a mock WebSocket that behaves like ws.WebSocket for our purposes.
 * Supports: send, on, off, once, close, readyState.
 */
function createMockWebSocket(): EventEmitter & {
  send: (data: string) => void;
  readyState: number;
  close: () => void;
} {
  const ws = new EventEmitter() as EventEmitter & {
    send: (data: string) => void;
    readyState: number;
    close: () => void;
  };
  ws.send = (_data: string) => {
    // Mock: doesn't actually send anywhere
  };
  ws.readyState = 1; // WebSocket.OPEN
  ws.close = () => {
    ws.readyState = 3; // WebSocket.CLOSED
    ws.emit("close");
  };
  return ws;
}

/**
 * Create a CdpConnection with a mock WebSocket pre-installed.
 * Sets up sessions map so sessionCommand doesn't call attachAndEnable.
 */
function createMockCdpConnection(): { cdp: CdpConnection; ws: ReturnType<typeof createMockWebSocket>; tabManager: TabStateManager } {
  const tabManager = new TabStateManager();
  const cdp = new CdpConnection("127.0.0.1", 9222, tabManager);

  const ws = createMockWebSocket();

  // Inject mock socket into CdpConnection (bypassing private field check)
  (cdp as unknown as { socket: typeof ws }).socket = ws;
  (cdp as unknown as { _connected: boolean })._connected = true;

  // Call setupListeners so the main message handler is registered
  // (this is normally done by doConnect, which we bypass)
  (cdp as unknown as { setupListeners: (ws: typeof ws) => void }).setupListeners(ws);

  // Pre-register a session so sessionCommand doesn't call attachAndEnable
  const targetId = "TARGET_TEST_1234";
  const sessionId = "SESSION_TEST";
  (cdp as unknown as { sessions: Map<string, string> }).sessions.set(targetId, sessionId);
  (cdp as unknown as { attachedTargets: Map<string, string> }).attachedTargets.set(sessionId, targetId);

  // Also register the tab in tabManager
  tabManager.addTab(targetId);

  return { cdp, ws, tabManager };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("CdpConnection sessionCommand", () => {
  describe("sessionCommand timeout", () => {
    it("rejects after timeoutMs when no response arrives", async () => {
      const { cdp } = createMockCdpConnection();

      const shortTimeout = 100; // 100ms
      const promise = cdp.sessionCommand("TARGET_TEST_1234", "Runtime.evaluate", {
        expression: "1+1",
      }, shortTimeout);

      // Should reject with timeout error
      await assert.rejects(
        promise,
        (err: Error) => {
          assert.ok(err.message.includes("sessionCommand timeout"));
          assert.ok(err.message.includes("100ms"));
          return true;
        },
        "Should reject with sessionCommand timeout error",
      );
    });

    it("removes the message listener after timeout", async () => {
      const { cdp, ws } = createMockCdpConnection();

      const listenerCountBefore = ws.listenerCount("message");

      const promise = cdp.sessionCommand("TARGET_TEST_1234", "Runtime.evaluate", {}, 50);

      // Listener should be added
      assert.ok(ws.listenerCount("message") > listenerCountBefore);

      await assert.rejects(promise);

      // Listener should be removed after timeout
      assert.equal(ws.listenerCount("message"), listenerCountBefore);
    });

    it("cleans up pendingSessionCommands after timeout", async () => {
      const { cdp } = createMockCdpConnection();

      const promise = cdp.sessionCommand("TARGET_TEST_1234", "Runtime.evaluate", {}, 50);

      // While pending, the command should be tracked
      const pendingBefore = (cdp as unknown as {
        pendingSessionCommands: Map<string, Set<unknown>>;
      }).pendingSessionCommands.get("TARGET_TEST_1234");
      assert.ok(pendingBefore && pendingBefore.size > 0, "Should have pending command tracked");

      await assert.rejects(promise);

      // After timeout, should be cleaned up
      const pendingAfter = (cdp as unknown as {
        pendingSessionCommands: Map<string, Set<unknown>>;
      }).pendingSessionCommands.get("TARGET_TEST_1234");
      assert.ok(!pendingAfter || pendingAfter.size === 0, "Pending commands should be cleaned up after timeout");
    });
  });

  describe("targetDestroyed cleanup", () => {
    it("rejects pending sessionCommand when Target.targetDestroyed fires", async () => {
      const { cdp, ws } = createMockCdpConnection();
      const targetId = "TARGET_TEST_1234";

      // Start a sessionCommand with a long timeout (won't timeout during test)
      const promise = cdp.sessionCommand(targetId, "Runtime.evaluate", {
        expression: "1+1",
      }, 10000); // 10s — won't timeout during test

      // Allow the promise to settle into pending state
      await new Promise((r) => setTimeout(r, 10));

      // Simulate Target.targetDestroyed event
      // Need to wait a tick for sessionCommand's listener to be registered
      await new Promise((r) => setTimeout(r, 20));
      ws.emit("message", Buffer.from(JSON.stringify({
        method: "Target.targetDestroyed",
        params: { targetId },
      })));

      // The pending sessionCommand should be rejected with "Target destroyed"
      await assert.rejects(
        promise,
        (err: Error) => {
          assert.ok(
            err.message.includes("Target destroyed"),
            `Expected "Target destroyed" in error, got: ${err.message}`,
          );
          return true;
        },
        "Should reject with Target destroyed error",
      );
    });

    it("records target_destroyed navigation event before cleanup", async () => {
      const { ws, tabManager } = createMockCdpConnection();
      const targetId = "TARGET_TEST_1234";

      // Add a navigation event first so lastKnownUrl is set
      const tab = tabManager.getTab(targetId)!;
      tab.addNavigationEvent({
        type: "frame_navigated",
        url: "https://www.xiaohongshu.com/explore/test",
        timestamp: Date.now(),
      });

      // Simulate Target.targetDestroyed event
      ws.emit("message", Buffer.from(JSON.stringify({
        method: "Target.targetDestroyed",
        params: { targetId },
      })));

      // The tab should have a target_destroyed navigation event
      // (tab may have been removed from manager, but we captured it before)
      const events = tab.navigationEvents.toArray();
      const destroyedEvent = events.find((e) => e.type === "target_destroyed");
      assert.ok(destroyedEvent, "Should have target_destroyed navigation event");
      assert.equal(destroyedEvent.url, "https://www.xiaohongshu.com/explore/test");
    });

    it("removes the tab from tabManager after targetDestroyed", async () => {
      const { ws, tabManager } = createMockCdpConnection();
      const targetId = "TARGET_TEST_1234";

      assert.ok(tabManager.getTab(targetId), "Tab should exist before destroy");

      // Simulate Target.targetDestroyed event
      ws.emit("message", Buffer.from(JSON.stringify({
        method: "Target.targetDestroyed",
        params: { targetId },
      })));

      assert.ok(!tabManager.getTab(targetId), "Tab should be removed after destroy");
    });
  });

  describe("disconnect rejects pending commands", () => {
    it("rejects all pending sessionCommands on disconnect", async () => {
      const { cdp } = createMockCdpConnection();

      const promise = cdp.sessionCommand("TARGET_TEST_1234", "Runtime.evaluate", {}, 10000);

      // Allow the promise to settle into pending state
      await new Promise((r) => setTimeout(r, 10));

      // Disconnect should reject all pending commands
      cdp.disconnect();

      await assert.rejects(
        promise,
        (err: Error) => {
          assert.ok(
            err.message.includes("CDP connection closed"),
            `Expected "CDP connection closed" in error, got: ${err.message}`,
          );
          return true;
        },
        "Should reject with CDP connection closed error",
      );
    });
  });

  describe("successful sessionCommand", () => {
    it("resolves when matching response arrives", async () => {
      const { cdp, ws } = createMockCdpConnection();
      const targetId = "TARGET_TEST_1234";
      const sessionId = "SESSION_TEST";

      // Start a sessionCommand
      const promise = cdp.sessionCommand<{ result: { value: number } }>(
        targetId,
        "Runtime.evaluate",
        { expression: "1+1" },
        5000,
      );

      // Allow the command to be sent and listener registered
      await new Promise((r) => setTimeout(r, 10));

      // We need the actual ID used. Let's intercept send.
      const origSend = ws.send;
      ws.send = (_data: string) => {};

      // Actually, we already sent the command. The nextId was already incremented.
      // Let's just emit a response with the expected structure.
      // The sessionCommand uses `this.nextId++`, so the first call gets id=1.
      ws.emit("message", Buffer.from(JSON.stringify({
        id: 1,
        sessionId,
        result: { result: { value: 2 } },
      })));

      const result = await promise;
      assert.deepEqual(result, { result: { value: 2 } });

      // Restore send
      ws.send = origSend;
    });
  });
});

// ---------------------------------------------------------------------------
// Malformed WebSocket message handling (defect #2)
// ---------------------------------------------------------------------------

describe("CdpConnection malformed message handling", () => {
  it("ignores non-JSON message without throwing", async () => {
    const { cdp, ws } = createMockCdpConnection();

    // Simulate Chrome sending a non-JSON message (protocol glitch)
    assert.doesNotThrow(() => {
      ws.emit("message", Buffer.from("not valid json {{{"));
    });

    // Normal commands should still work after the malformed message
    const result = cdp.browserCommand("Target.getTargets");
    ws.emit("message", Buffer.from(JSON.stringify({ id: 1, result: { targetInfos: [] } })));
    assert.deepEqual(await result, { targetInfos: [] });
  });

  it("ignores empty message", async () => {
    const { ws } = createMockCdpConnection();

    assert.doesNotThrow(() => {
      ws.emit("message", Buffer.from(""));
    });
  });
});
