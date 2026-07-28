import test from "node:test";
import assert from "node:assert/strict";
import { COMMAND_TIMEOUT } from "./constants.js";

test("COMMAND_TIMEOUT is 500 seconds to exceed adapter timeBudget", () => {
  assert.equal(COMMAND_TIMEOUT, 500000);
});
