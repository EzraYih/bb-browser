import test from "node:test";
import assert from "node:assert/strict";
import { parseArgs } from "./parse-args.js";

test("parseArgs passes unknown --flag value pairs to subcommand args", () => {
  // 模拟 bb-xhs 调用: bb-browser --tab 1 site xiaohongshu/notes-comments-batch --notes '[]' --single-note-timeout-ms 12000
  const argv = [
    "node",
    "bb-browser",
    "--tab", "1",
    "site",
    "xiaohongshu/notes-comments-batch",
    "--notes", "[]",
    "--single-note-timeout-ms", "12000",
  ];
  const result = parseArgs(argv);

  assert.strictEqual(result.command, "site");
  // site 子命令的 args 应包含 adapter 路径和所有 --flag value 对
  assert.ok(result.args.includes("xiaohongshu/notes-comments-batch"), "should include adapter path");
  assert.ok(result.args.includes("--notes"), "should include --notes flag");
  assert.ok(result.args.includes("[]"), "should include notes value");
  assert.ok(result.args.includes("--single-note-timeout-ms"), "should include --single-note-timeout-ms flag");
  assert.ok(result.args.includes("12000"), "should include timeout value");
});

test("parseArgs passes unknown boolean flag (no value) to subcommand args", () => {
  const argv = [
    "node",
    "bb-browser",
    "--tab", "1",
    "site",
    "xiaohongshu/notes-comments-batch",
    "--verbose",
  ];
  const result = parseArgs(argv);

  assert.strictEqual(result.command, "site");
  assert.ok(result.args.includes("--verbose"), "should include --verbose flag");
});

test("parseArgs still strips known global flags", () => {
  const argv = [
    "node",
    "bb-browser",
    "--tab", "1",
    "--json",
    "site",
    "xiaohongshu/test",
  ];
  const result = parseArgs(argv);

  assert.strictEqual(result.command, "site");
  assert.ok(!result.args.includes("--tab"), "should strip --tab");
  assert.ok(!result.args.includes("--json"), "should strip --json");
  assert.ok(result.args.includes("xiaohongshu/test"), "should include adapter path");
});
