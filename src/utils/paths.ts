import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";

export function expandHome(input: string): string {
  if (input === "~") {
    return os.homedir();
  }
  if (input.startsWith("~/") || input.startsWith("~\\")) {
    return path.join(os.homedir(), input.slice(2));
  }
  return input;
}

export function normalizeAbsolutePath(input: string): string {
  return path.resolve(expandHome(input));
}

export function createScopeId(workdir: string): string {
  const normalized = normalizeAbsolutePath(workdir).toLowerCase();
  return crypto.createHash("sha256").update(normalized).digest("hex").slice(0, 16);
}

export function ensureTrailingNewline(input: string): string {
  return input.endsWith("\n") ? input : `${input}\n`;
}
