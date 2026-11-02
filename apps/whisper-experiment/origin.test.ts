import { expect, test } from "bun:test";
import { link, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assertWorkingCopy } from "./origin";

test("rejects the original file and hard links to it", async () => {
  const root = await mkdtemp(join(tmpdir(), "whisper-origin-"));
  try {
    const original = join(root, "original.wav"), linked = join(root, "linked.wav");
    await writeFile(original, "synthetic");
    await link(original, linked);
    await expect(assertWorkingCopy(original, original)).rejects.toThrow(/working copy/);
    await expect(assertWorkingCopy(linked, original)).rejects.toThrow(/working copy/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("accepts a copied working file and calls without an origin", async () => {
  const root = await mkdtemp(join(tmpdir(), "whisper-origin-"));
  try {
    const original = join(root, "original.wav"), copy = join(root, "working.wav");
    await writeFile(original, "synthetic");
    await writeFile(copy, "synthetic");
    await expect(assertWorkingCopy(copy, original)).resolves.toBeUndefined();
    await expect(assertWorkingCopy(copy)).resolves.toBeUndefined();
  } finally { await rm(root, { recursive: true, force: true }); }
});
