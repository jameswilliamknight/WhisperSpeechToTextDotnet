import { rename, writeFile } from "node:fs/promises";

export interface WorkerProgress {
  stage: string;
  percent: number | null;
  updatedAt: string;
}

/** Atomic, metadata-only progress: never include recognised text or audio paths. */
export async function writeProgress(path: string, stage: string, percent: number | null = null): Promise<void> {
  const temporary = `${path}.${process.pid}.tmp`;
  const value: WorkerProgress = { stage, percent, updatedAt: new Date().toISOString() };
  await writeFile(temporary, `${JSON.stringify(value)}\n`, { mode: 0o600 });
  await rename(temporary, path);
}
