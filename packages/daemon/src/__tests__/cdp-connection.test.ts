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
  const cdp = new CdpConnection("127.0.0.1", 9222, tabManager, 60000);

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

    it("does not add per-command message listeners", async () => {
      const { cdp, ws } = createMockCdpConnection();
      const listenerCountBefore = ws.listenerCount("message");

      const promise = cdp.sessionCommand("TARGET_TEST_1234", "Runtime.evaluate", {}, 50);
      // Prevent unhandled rejection if assertion fails before await
      promise.catch(() => {});

      // Listener count should NOT increase — main handler routes all responses
      assert.equal(ws.listenerCount("message"), listenerCountBefore);

      await assert.rejects(promise);

      // Still no extra listeners
      assert.equal(ws.listenerCount("message"), listenerCountBefore);
    });

    it("cleans up pendingSessionCommands after timeout", async () => {
      const { cdp } = createMockCdpConnection();

      const promise = cdp.sessionCommand("TARGET_TEST_1234", "Runtime.evaluate", {}, 50);

      // While pending, the command should be tracked
      const pendingBefore = (cdp as unknown as {
        pendingSessionCommands: Map<string, Set<number>>;
      }).pendingSessionCommands.get("TARGET_TEST_1234");
      assert.ok(pendingBefore && pendingBefore.size > 0, "Should have pending command tracked");

      await assert.rejects(promise);

      // After timeout, should be cleaned up
      const pendingAfter = (cdp as unknown as {
        pendingSessionCommands: Map<string, Set<number>>;
      }).pendingSessionCommands.get("TARGET_TEST_1234");
      assert.ok(!pendingAfter || pendingAfter.size === 0, "Pending commands should be cleaned up after timeout");
    });
  });

  describe("sessionCommand listener efficiency", () => {
    it("does not add per-command listeners for 20 concurrent commands", async () => {
      const { cdp, ws } = createMockCdpConnection();
      const listenerCountBefore = ws.listenerCount("message");

      // Start 20 concurrent sessionCommands
      const promises: Promise<unknown>[] = [];
      for (let i = 0; i < 20; i++) {
        promises.push(
          cdp.sessionCommand("TARGET_TEST_1234", "Runtime.evaluate", {}, 10000).catch(() => {}),
        );
      }

      // Allow all commands to register
      await new Promise((r) => setTimeout(r, 20));

      // CRITICAL: listener count should NOT increase
      assert.equal(
        ws.listenerCount("message"),
        listenerCountBefore,
        "Should not add per-command listeners — main handler routes all responses",
      );

      // Cleanup: reject all pending
      cdp.disconnect();
      await Promise.allSettled(promises);
    });

    it("resolves 20 concurrent sessionCommands correctly", async () => {
      const { cdp, ws } = createMockCdpConnection();
      const targetId = "TARGET_TEST_1234";
      const sessionId = "SESSION_TEST";

      // Start 20 concurrent sessionCommands
      const promises: Promise<unknown>[] = [];
      for (let i = 0; i < 20; i++) {
        promises.push(
          cdp.sessionCommand(targetId, "Runtime.evaluate", {}, 5000),
        );
      }

      await new Promise((r) => setTimeout(r, 20));

      // Emit 20 responses with ids 1..20
      for (let i = 1; i <= 20; i++) {
        ws.emit("message", Buffer.from(JSON.stringify({
          id: i,
          sessionId,
          result: { value: i },
        })));
      }

      const results = await Promise.all(promises);
      assert.equal(results.length, 20);
      for (let i = 0; i < 20; i++) {
        assert.deepEqual(results[i], { value: i + 1 });
      }

      // Verify cleanup
      const pending = (cdp as unknown as { pending: Map<number, unknown> }).pending;
      assert.equal(pending.size, 0, "Pending Map should be empty after all resolved");
      const pendingSession = (cdp as unknown as { pendingSessionCommands: Map<string, Set<number>> }).pendingSessionCommands;
      assert.ok(!pendingSession.has(targetId) || pendingSession.get(targetId)!.size === 0,
        "pendingSessionCommands should be empty after all resolved");
    });

    it("rejects all concurrent sessionCommands on targetDestroyed", async () => {
      const { cdp, ws } = createMockCdpConnection();
      const targetId = "TARGET_TEST_1234";

      // Start 15 concurrent sessionCommands
      const promises: Promise<unknown>[] = [];
      for (let i = 0; i < 15; i++) {
        promises.push(
          cdp.sessionCommand(targetId, "Runtime.evaluate", {}, 10000),
        );
      }

      await new Promise((r) => setTimeout(r, 20));

      // Verify commands are tracked
      const pendingSession = (cdp as unknown as { pendingSessionCommands: Map<string, Set<number>> }).pendingSessionCommands;
      assert.ok(pendingSession.has(targetId), "Should have pending commands tracked");
      assert.equal(pendingSession.get(targetId)!.size, 15, "Should have 15 pending commands");

      // Simulate targetDestroyed
      ws.emit("message", Buffer.from(JSON.stringify({
        method: "Target.targetDestroyed",
        params: { targetId },
      })));

      // All should be rejected
      const results = await Promise.allSettled(promises);
      const rejected = results.filter((r) => r.status === "rejected");
      assert.equal(rejected.length, 15, "All 15 should be rejected");

      // Verify cleanup
      assert.ok(!pendingSession.has(targetId), "pendingSessionCommands should be cleaned up");
      const pending = (cdp as unknown as { pending: Map<number, unknown> }).pending;
      assert.equal(pending.size, 0, "pending Map should be empty");
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

// ---------------------------------------------------------------------------
// browserCommand timeout (defect #1)
// ---------------------------------------------------------------------------

describe("CdpConnection browserCommand timeout", () => {
  it("rejects after timeoutMs when no response arrives", async () => {
    const { cdp } = createMockCdpConnection();

    const shortTimeout = 100;
    const promise = cdp.browserCommand("Target.getTargets", {}, shortTimeout);

    await assert.rejects(
      promise,
      (err: Error) => {
        assert.ok(err.message.includes("browserCommand timeout"));
        assert.ok(err.message.includes("100ms"));
        return true;
      },
      "Should reject with browserCommand timeout error",
    );
  });

  it("cleans up pending Map entry after timeout", async () => {
    const { cdp } = createMockCdpConnection();

    const promise = cdp.browserCommand("Target.getTargets", {}, 50);
    await assert.rejects(promise);

    const pending = (cdp as unknown as { pending: Map<number, unknown> }).pending;
    assert.equal(pending.size, 0, "Pending Map should be empty after timeout");
  });

  it("resolves normally when response arrives before timeout", async () => {
    const { cdp, ws } = createMockCdpConnection();

    const promise = cdp.browserCommand<{ targetInfos: [] }>("Target.getTargets", {}, 5000);

    // Allow the command to be sent
    await new Promise((r) => setTimeout(r, 10));

    // Emit response with id=1 (first browserCommand)
    ws.emit("message", Buffer.from(JSON.stringify({
      id: 1,
      result: { targetInfos: [] },
    })));

    const result = await promise;
    assert.deepEqual(result, { targetInfos: [] });
  });
});

// ---------------------------------------------------------------------------
// Auto-reconnect on unexpected WebSocket close (defect #3)
// ---------------------------------------------------------------------------

describe("CdpConnection auto-reconnect", () => {
  it("schedules reconnect timer after unexpected WebSocket close", () => {
    const { cdp, ws } = createMockCdpConnection();

    // Simulate unexpected close
    ws.close();

    const internal = cdp as unknown as { reconnectTimer: ReturnType<typeof setTimeout> | null };
    assert.ok(internal.reconnectTimer !== null, "Reconnect timer should be scheduled after unexpected close");

    // Cleanup
    cdp.disconnect();
  });

  it("does not schedule reconnect on explicit disconnect", () => {
    const { cdp } = createMockCdpConnection();

    cdp.disconnect();

    const internal = cdp as unknown as {
      reconnectTimer: ReturnType<typeof setTimeout> | null;
      shouldReconnect: boolean;
    };
    assert.equal(internal.shouldReconnect, false, "shouldReconnect should be false after disconnect");
    assert.equal(internal.reconnectTimer, null, "No reconnect timer should be scheduled after explicit disconnect");
  });

  it("clears pending reconnect timer on disconnect", () => {
    const { cdp, ws } = createMockCdpConnection();

    // Trigger unexpected close to schedule a reconnect timer
    ws.close();

    const internal = cdp as unknown as { reconnectTimer: ReturnType<typeof setTimeout> | null };
    assert.ok(internal.reconnectTimer !== null, "Reconnect timer should be scheduled");

    // Now explicitly disconnect — should clear the timer
    cdp.disconnect();

    assert.equal(internal.reconnectTimer, null, "Reconnect timer should be cleared after disconnect");
  });
});
