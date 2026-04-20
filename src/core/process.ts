export interface SpawnSpec {
  command: string;
  args: string[];
}

export function buildOpencodeRunArgs(prompt: string): string[] {
  return ["run", "--dangerously-skip-permissions", prompt];
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
