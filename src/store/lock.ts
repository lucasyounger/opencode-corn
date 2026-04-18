import fs from "node:fs/promises";
import { nowIso } from "../utils/time.js";
import { removeFile } from "./fs.js";

export interface LockHandle {
  release(): Promise<void>;
}

export async function acquireLock(lockPath: string): Promise<LockHandle | undefined> {
  try {
    const lock = await fs.readFile(lockPath, "utf8");
    const value = JSON.parse(lock) as { pid?: number };
    if (typeof value.pid === "number" && isProcessRunning(value.pid)) {
      return undefined;
    }
    await removeFile(lockPath);
  } catch (error) {
    if (!isNotFound(error)) {
      throw error;
    }
  }

  try {
    const handle = await fs.open(lockPath, "wx");
    await handle.writeFile(`${JSON.stringify({ acquiredAt: nowIso(), pid: process.pid }, null, 2)}\n`, "utf8");
    await handle.close();
  } catch (error) {
    if (isAlreadyExists(error)) {
      return undefined;
    }
    throw error;
  }

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

function isAlreadyExists(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "EEXIST"
  );
}

function isProcessRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return !isMissingProcess(error);
  }
}

function isMissingProcess(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ESRCH"
  );
}
