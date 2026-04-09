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
    port?: number;
    since?: string;
  };
}

export function parseArgs(argv: string[]): ParsedArgs {
  const args = argv.slice(2);

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

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === "--json") {
      result.flags.json = true;
      continue;
    }
    if (arg === "--jq") {
      if (i + 1 < args.length) {
        result.flags.jq = args[i + 1];
        result.flags.json = true;
        i++;
      }
      continue;
    }
    if (arg === "--openclaw") {
      result.flags.openclaw = true;
      continue;
    }
    if (arg === "--port") {
      if (i + 1 < args.length) {
        result.flags.port = parseInt(args[i + 1], 10);
        i++;
      }
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      result.flags.help = true;
      continue;
    }
    if (arg === "--version" || arg === "-v") {
      result.flags.version = true;
      continue;
    }
    if (arg === "--interactive" || arg === "-i") {
      result.flags.interactive = true;
      continue;
    }
    if (arg === "--compact" || arg === "-c") {
      result.flags.compact = true;
      continue;
    }
    if (arg === "--depth" || arg === "-d") {
      if (i + 1 < args.length) {
        result.flags.depth = parseInt(args[i + 1], 10);
        i++;
      }
      continue;
    }
    if (arg === "--selector" || arg === "-s") {
      if (i + 1 < args.length) {
        result.flags.selector = args[i + 1];
        i++;
      }
      continue;
    }
    if (arg === "--days") {
      if (i + 1 < args.length) {
        result.flags.days = parseInt(args[i + 1], 10);
        i++;
      }
      continue;
    }
    if (arg === "--id" || arg === "--tab" || arg === "--since" || arg === "--method" || arg === "--status") {
      if (i + 1 < args.length) {
        i++;
      }
      continue;
    }

    if (arg.startsWith("-")) {
      if (result.command === "site") {
        result.args.push(arg);
      }
      continue;
    }

    if (result.command === null) {
      result.command = arg;
    } else {
      result.args.push(arg);
    }
  }

  return result;
}
