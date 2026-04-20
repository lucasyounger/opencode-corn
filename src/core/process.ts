export interface SpawnSpec {
  command: string;
  args: string[];
}

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

export function resolveSpawnSpec(command: string, args: string[]): SpawnSpec {
  if (process.platform !== "win32") {
    return { command, args };
  }

  return {
    command: process.env.ComSpec ?? "cmd.exe",
    args: ["/d", "/s", "/c", command, ...args],
  };
}
