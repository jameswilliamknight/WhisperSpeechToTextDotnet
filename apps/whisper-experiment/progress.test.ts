import { expect, test } from "bun:test";
import { lstat, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseWhisperProgress } from "./asr";
import { writeProgress } from "./progress";

test("parses only numeric whisper progress and clamps it", () => {
  expect(parseWhisperProgress("whisper_print_progress_callback: progress = 42%")).toBe(42);
  expect(parseWhisperProgress("progress = 0%")).toBe(0);
  expect(parseWhisperProgress("progress = 101%")).toBe(100);
  expect(parseWhisperProgress("recognised private text")).toBeUndefined();
});

test("progress metadata is private, atomic and contains no transcript text", async () => {
  const root = await mkdtemp(join(tmpdir(), "whisper-progress-"));
  try {
    const path = join(root, "progress.json");
    await writeProgress(path, "Transcribing audio", 42);
    expect(JSON.parse(await readFile(path, "utf8"))).toMatchObject({ stage: "Transcribing audio", percent: 42 });
    expect((await lstat(path)).mode & 0o777).toBe(0o600);
    expect((await readFile(path, "utf8")).includes("recognised")).toBe(false);
  } finally { await rm(root, { recursive: true, force: true }); }
});
