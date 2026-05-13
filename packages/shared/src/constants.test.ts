import test from "node:test";
import assert from "node:assert/strict";
import { COMMAND_TIMEOUT } from "./constants.js";

test("COMMAND_TIMEOUT is 120 seconds for longer live site runs", () => {
  assert.equal(COMMAND_TIMEOUT, 120000);
});
