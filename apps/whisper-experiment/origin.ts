import { stat } from "node:fs/promises";

/**
 * Path prefix rules are wrong for user-selected source folders. The harness supplies
 * the original path separately so this check can reject file identity, not location.
 */
export async function assertWorkingCopy(input: string, origin?: string): Promise<void> {
  if (!origin) return;
  const [candidate, original] = await Promise.all([stat(input), stat(origin)]);
  if (candidate.dev === original.dev && candidate.ino === original.ino)
    throw new Error("Input must be a working copy, never the original recording");
}
