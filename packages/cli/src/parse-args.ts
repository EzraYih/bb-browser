/**
 * CLI 参数解析 — 从 index.ts 提取，便于单元测试
 */

export interface ParsedArgs {
  command: string | null;
  args: string[];
  flags: {
    json: boolean;
    help: boolean;
    version: boolean;
    interactive: boolean;
    compact: boolean;
    depth?: number;
    selector?: string;
    tab?: string;
    days?: number;
    jq?: string;
    openclaw?: boolean;
    progress?: boolean;
    port?: number;
    since?: string;
  };
}

/**
 * 解析命令行参数
 */
export function parseArgs(argv: string[]): ParsedArgs {
  const args = argv.slice(2); // 跳过 node 和脚本路径

  const result: ParsedArgs = {
    command: null,
    args: [],
    flags: {
      json: false,
      help: false,
      version: false,
      interactive: false,
      compact: false,
    },
  };

  let skipNext = false;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (skipNext) {
      skipNext = false;
      continue;
    }
    if (arg === "--json") {
      result.flags.json = true;
    } else if (arg === "--jq") {
      skipNext = true;
      const nextIdx = i + 1;
      if (nextIdx < args.length) {
        result.flags.jq = args[nextIdx];
        result.flags.json = true;
      }
    } else if (arg === "--openclaw") {
      result.flags.openclaw = true;
    } else if (arg === "--progress") {
      result.flags.progress = true;
    } else if (arg === "--port") {
      skipNext = true;
      const nextIdx = i + 1;
      if (nextIdx < args.length) {
        result.flags.port = parseInt(args[nextIdx], 10);
      }
    } else if (arg === "--help" || arg === "-h") {
      result.flags.help = true;
    } else if (arg === "--version" || arg === "-v") {
      result.flags.version = true;
    } else if (arg === "--interactive" || arg === "-i") {
      result.flags.interactive = true;
    } else if (arg === "--compact" || arg === "-c") {
      result.flags.compact = true;
    } else if (arg === "--depth" || arg === "-d") {
      skipNext = true;
      const nextIdx = i + 1;
      if (nextIdx < args.length) {
        result.flags.depth = parseInt(args[nextIdx], 10);
      }
    } else if (arg === "--selector" || arg === "-s") {
      skipNext = true;
      const nextIdx = i + 1;
      if (nextIdx < args.length) {
        result.flags.selector = args[nextIdx];
      }
    } else if (arg === "--days") {
      skipNext = true;
      const nextIdx = i + 1;
      if (nextIdx < args.length) {
        result.flags.days = parseInt(args[nextIdx], 10);
      }
    } else if (arg === "--id") {
      // --id 及其值由子命令通过 process.argv 自行解析，这里跳过
      skipNext = true;
    } else if (arg === "--tab") {
      // --tab 参数及其值，无论出现在命令前后都跳过
      skipNext = true;
    } else if (arg === "--since") {
      // --since 参数及其值，无论出现在命令前后都跳过
      skipNext = true;
    } else if (arg === "--method") {
      // --method 参数及其值，由子命令通过 process.argv 解析
      skipNext = true;
    } else if (arg === "--status") {
      // --status 参数及其值，由子命令通过 process.argv 解析
      skipNext = true;
    } else if (arg.startsWith("-")) {
      // 未知选项 — 传递给子命令处理（site 命令有自己的 --flag value 解析器）
      result.args.push(arg);
      // 如果下一个参数不以 - 开头，它是此 flag 的值，一并传递
      if (i + 1 < args.length && !args[i + 1].startsWith("-")) {
        result.args.push(args[i + 1]);
        skipNext = true;
      }
    } else if (result.command === null) {
      result.command = arg;
    } else {
      result.args.push(arg);
    }
  }

  return result;
}
