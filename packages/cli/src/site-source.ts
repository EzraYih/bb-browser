import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const SITE_META_PATTERN = /\/\*\s*@meta[\s\S]*?\*\//;
const SITE_INCLUDE_PATTERN = /^[ \t]*\/\/\s*@include\s+(.+?)\s*$/gm;

function normalizeIncludePath(specifier: string): string {
  const trimmed = specifier.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

export function isInternalSiteFile(fileName: string): boolean {
  return fileName.startsWith("_");
}

export function stripSiteMeta(content: string): string {
  return content.replace(SITE_META_PATTERN, "").trim();
}

export function loadSiteSource(filePath: string, stack = new Set<string>()): string {
  if (stack.has(filePath)) {
    throw new Error(`Cyclic site include detected: ${filePath}`);
  }

  stack.add(filePath);
  try {
    const content = readFileSync(filePath, "utf-8");
    return content.replace(SITE_INCLUDE_PATTERN, (_match, rawSpecifier: string) => {
      const specifier = normalizeIncludePath(rawSpecifier);
      if (!specifier.startsWith(".")) {
        throw new Error(`Only relative site includes are supported: ${specifier}`);
      }

      const includePath = resolve(dirname(filePath), specifier);
      return loadSiteSource(includePath, stack).trim();
    });
  } finally {
    stack.delete(filePath);
  }
}

export function loadSiteScriptBody(filePath: string): string {
  return stripSiteMeta(loadSiteSource(filePath));
}
