import fs from "node:fs/promises";
import path from "node:path";

export interface SpawnSpec {
  command: string;
  args: string[];
}

const RUN_COMMAND_ALIASES = ["opencode", "nga"] as const;
const DEFAULT_WINDOWS_PATH_EXTENSIONS = [".COM", ".EXE", ".BAT", ".CMD"];

export interface OpencodeRunArgsOptions {
  agent?: string;
  model?: {
    providerID: string;
    modelID: string;
  };
}

export function buildOpencodeRunArgs(prompt: string, options?: OpencodeRunArgsOptions): string[] {
  const args = ["run", "--dangerously-skip-permissions"];

  if (options?.agent) {
    args.push("--agent", options.agent);
  }

  if (options?.model) {
    args.push("--model", `${options.model.providerID}/${options.model.modelID}`);
  }

  args.push(prompt);
  return args;
}

export function resolveRunCommandCandidates(command: string): string[] {
  const normalized = command.trim().toLowerCase();
  if (normalized === "auto") {
    return [...RUN_COMMAND_ALIASES];
  }
  if (normalized === "opencode") {
    return ["opencode", "nga"];
  }
  if (normalized === "nga") {
    return ["nga", "opencode"];
  }
  return [command];
}

export async function resolveAvailableRunCommand(
  command: string,
  environment?: Record<string, string>,
  platform: NodeJS.Platform = process.platform,
): Promise<string | undefined> {
  const candidates = resolveRunCommandCandidates(command);
  for (const candidate of candidates) {
    if (await isCommandAvailable(candidate, environment, platform)) {
      return candidate;
    }
  }
  return undefined;
}

export function resolveSpawnSpec(command: string, args: string[]): SpawnSpec {
  if (process.platform !== "win32") {
    return { command, args };
  }

  return {
    command: process.env.ComSpec ?? "cmd.exe",
    args: ["/d", "/s", "/c", command, ...args],
  };
}

async function isCommandAvailable(
  command: string,
  environment?: Record<string, string>,
  platform: NodeJS.Platform = process.platform,
): Promise<boolean> {
  if (isPathLikeCommand(command)) {
    return pathExists(command);
  }

  const pathValue = readEnvironmentValue(environment, platform === "win32" ? "Path" : "PATH");
  if (!pathValue) {
    return false;
  }

  const directories = pathValue
    .split(path.delimiter)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
  const extensions = platform === "win32" ? readWindowsPathExtensions(environment, command) : [""];

  for (const directory of directories) {
    for (const extension of extensions) {
      if (await pathExists(path.join(directory, `${command}${extension}`))) {
        return true;
      }
    }
  }

  return false;
}

function readWindowsPathExtensions(environment: Record<string, string> | undefined, command: string): string[] {
  if (path.extname(command)) {
    return [""];
  }

  const configured =
    readEnvironmentValue(environment, "PATHEXT")
      ?.split(";")
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0) ?? [];

  return configured.length > 0 ? configured : DEFAULT_WINDOWS_PATH_EXTENSIONS;
}

function readEnvironmentValue(environment: Record<string, string> | undefined, name: string): string | undefined {
  const target = name.toLowerCase();
  if (environment) {
    const environmentMatch = Object.keys(environment).find((key) => key.toLowerCase() === target);
    if (environmentMatch) {
      return environment[environmentMatch];
    }
  }

  const processMatch = Object.keys(process.env).find((key) => key.toLowerCase() === target);
  return processMatch ? process.env[processMatch] : undefined;
}

function isPathLikeCommand(command: string): boolean {
  return command.includes("/") || command.includes("\\") || path.isAbsolute(command);
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}
