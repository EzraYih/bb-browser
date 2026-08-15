/**
 * log.ts tests — verify ts() returns ISO 8601 timestamp.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ts } from "../log.js";

describe("log.ts", () => {
  it("ts() returns a string matching ISO 8601 format", () => {
    const result = ts();
    assert.equal(typeof result, "string");
    // ISO 8601: YYYY-MM-DDTHH:mm:ss.sssZ
    assert.match(result, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/);
  });

  it("ts() returns a value close to Date.now()", () => {
    const before = Date.now();
    const result = ts();
    const after = Date.now();
    const parsed = new Date(result).getTime();
    assert.ok(parsed >= before && parsed <= after,
      `ts() timestamp ${result} should be between ${before} and ${after}`);
  });
});
