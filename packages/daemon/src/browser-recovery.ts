import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const DAEMON_DIR = process.env.BB_BROWSER_HOME || path.join(os.homedir(), ".bb-browser");
const MANAGED_BROWSER_DIR = path.join(DAEMON_DIR, "browser");
const MANAGED_USER_DATA_DIR = path.join(MANAGED_BROWSER_DIR, "user-data");
const MANAGED_PORT_FILE = path.join(MANAGED_BROWSER_DIR, "cdp-port");

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function canConnect(host: string, port: number, timeoutMs = 1200): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(`http://${host}:${port}/json/version`, { signal: controller.signal });
      return response.ok;
    } finally {
      clearTimeout(timer);
    }
  } catch {
    return false;
  }
}

function findBrowserExecutable(): string | null {
  if (process.platform === "darwin") {
    const candidates = [
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/Applications/Google Chrome Dev.app/Contents/MacOS/Google Chrome Dev",
      "/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary",
      "/Applications/Google Chrome Beta.app/Contents/MacOS/Google Chrome Beta",
      "/Applications/Arc.app/Contents/MacOS/Arc",
      "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
      "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
    ];
    return candidates.find((candidate) => existsSync(candidate)) ?? null;
  }

  if (process.platform === "linux") {
    const candidates = [
      "/usr/bin/google-chrome",
      "/usr/bin/google-chrome-stable",
      "/usr/bin/chromium-browser",
      "/usr/bin/chromium",
      "/snap/bin/chromium",
    ];
    return candidates.find((candidate) => existsSync(candidate)) ?? null;
  }

  if (process.platform === "win32") {
    const localAppData = process.env.LOCALAPPDATA ?? "";
    const candidates = [
      "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
      "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
      ...(localAppData ? [
        `${localAppData}\\Google\\Chrome Dev\\Application\\chrome.exe`,
        `${localAppData}\\Google\\Chrome SxS\\Application\\chrome.exe`,
        `${localAppData}\\Google\\Chrome Beta\\Application\\chrome.exe`,
      ] : []),
      "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
      "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
      "C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe",
    ];
    return candidates.find((candidate) => existsSync(candidate)) ?? null;
  }

  return null;
}

async function launchManagedBrowser(port: number): Promise<boolean> {
  const executable = findBrowserExecutable();
  if (!executable) return false;

  await mkdir(MANAGED_USER_DATA_DIR, { recursive: true });

  const args = [
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${MANAGED_USER_DATA_DIR}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-sync",
    "--disable-background-networking",
    "--disable-component-update",
    "--disable-features=Translate,MediaRouter",
    "--disable-session-crashed-bubble",
    "--hide-crash-restore-bubble",
    "about:blank",
  ];

  try {
    const child = spawn(executable, args, {
      detached: true,
      stdio: "ignore",
    });
    child.unref();
  } catch {
    return false;
  }

  await mkdir(MANAGED_BROWSER_DIR, { recursive: true });
  await writeFile(MANAGED_PORT_FILE, String(port), "utf8");
  return true;
}

export async function ensureChromeCdpAvailable(host: string, port: number): Promise<boolean> {
  if (await canConnect(host, port)) {
    return true;
  }

  const launched = await launchManagedBrowser(port);
  if (!launched) {
    return false;
  }

  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    if (await canConnect(host, port)) {
      return true;
    }
    await sleep(250);
  }

  return false;
}
