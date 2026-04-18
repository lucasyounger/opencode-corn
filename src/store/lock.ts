import fs from "node:fs/promises";
import { nowIso } from "../utils/time.js";
import { removeFile, writeJsonFile } from "./fs.js";

export interface LockHandle {
  release(): Promise<void>;
}

export async function acquireLock(lockPath: string): Promise<LockHandle | undefined> {
  try {
    await fs.stat(lockPath);
    return undefined;
  } catch (error) {
    if (!isNotFound(error)) {
      throw error;
    }
  }

  await writeJsonFile(lockPath, { acquiredAt: nowIso(), pid: process.pid });
  return {
    async release() {
      await removeFile(lockPath);
    },
  };
}

function isNotFound(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ENOENT"
  );
}
