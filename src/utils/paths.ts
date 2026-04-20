import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";

const DEFAULT_SCOPE_LABEL = "workspace";
const MAX_SCOPE_LABEL_LENGTH = 24;

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

export function createLegacyScopeId(workdir: string): string {
  const normalized = normalizeAbsolutePath(workdir).toLowerCase();
  return crypto.createHash("sha256").update(normalized).digest("hex").slice(0, 16);
}

export function createScopeId(workdir: string): string {
  return `scope-${createScopeLabel(workdir)}-${createLegacyScopeId(workdir)}`;
}

export function ensureTrailingNewline(input: string): string {
  return input.endsWith("\n") ? input : `${input}\n`;
}

function createScopeLabel(workdir: string): string {
  const normalized = normalizeAbsolutePath(workdir).toLowerCase();
  const basename = path.basename(normalized).trim();
  const slug = basename
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_SCOPE_LABEL_LENGTH);

  return slug.length > 0 ? slug : DEFAULT_SCOPE_LABEL;
}
