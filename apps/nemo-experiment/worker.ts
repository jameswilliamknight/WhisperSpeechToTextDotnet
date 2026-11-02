import { mkdir, mkdtemp, readdir, rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { labelWords, parseTurns, parseWords, type Segment } from "./normalize";
import { models, runtime } from "./provenance";

const root = import.meta.dir;
const cli = join(root, ".runtime/nemo-speech-0.3.0-macos-aarch64-metal/bin/nemo-speech");
const modelPaths = models.map((m) => join(root, "models", m.repo, m.revision, m.file));

async function run(command: string[]) {
  const child = Bun.spawn(command, {
    env: { ...process.env, NEMO_SPEECH_MODEL_DIR: join(root, "models") },
    stdout: "ignore", stderr: "inherit",
  });
  const exit = await child.exited;
  if (exit !== 0) throw new Error(`${command[0]} failed (exit ${exit})`);
}

async function main() {
  const { values } = parseArgs({ options: { input: { type: "string" }, output: { type: "string" } } });
  if (!values.input || !values.output) throw new Error("Usage: bun worker.ts --input working-copy.wav --output result.json");
  const input = resolve(values.input), output = resolve(values.output);
  if (input === output) throw new Error("Input and output must differ");
  for (const path of [input, cli, ...modelPaths])
    if (!await Bun.file(path).exists()) throw new Error(`Missing ${path}; run bash setup.sh`);
  await mkdir(join(root, ".runtime/jobs"), { recursive: true });
  const job = await mkdtemp(join(root, ".runtime/jobs/run-"));
  try {
    // Parakeet is offline-only. Bounded PCM chunks avoid unbounded attention
    // memory, at the cost of reloads and unreconciled chunk-edge words.
    const started = performance.now();
    await run(["ffmpeg", "-nostdin", "-hide_banner", "-loglevel", "error", "-i", input,
      // 100ms audio packets make every 60s cut sample-exact, avoiding cumulative
      // drift from ffmpeg's otherwise arbitrary PCM packet boundaries.
      "-vn", "-ac", "1", "-ar", "16000", "-af", "asetnsamples=n=1600:p=0",
      "-c:a", "pcm_s16le", "-f", "segment",
      "-segment_time", "60", "-reset_timestamps", "1", join(job, "chunk-%06d.wav")]);
    const chunks = (await readdir(job)).filter((p) => p.endsWith(".wav")).sort();
    if (!chunks.length) throw new Error("No audio chunks");
    const words: Segment[] = [];
    for (const [index, chunk] of chunks.entries()) {
      const raw = join(job, `${chunk}.json`);
      await run([cli, "transcribe", join(job, chunk), "--model", modelPaths[0]!,
        "--backend", "metal", "--format", "json", "--output", raw]);
      words.push(...parseWords(await Bun.file(raw).json(), index * 60));
    }
    const transcriptionSeconds = (performance.now() - started) / 1000;
    const diarStart = performance.now();
    const diar = join(job, "diarization.json");
    await run([cli, "diarize", input, "--model", modelPaths[1]!, "--backend", "metal",
      "--preset", "v3-streaming", "--format", "json", "--output", diar]);
    const turns = parseTurns(await Bun.file(diar).json());
    const diarisationSeconds = (performance.now() - diarStart) / 1000;
    const segments = labelWords(words, turns);
    // Static adapter caveats live here rather than in per-run output: ASR uses
    // independent 60s chunks without boundary reconciliation (model reloads each
    // chunk), stage times include process startup/model load and ffmpeg conversion,
    // and word speakers use maximum turn overlap rather than native joint ASR
    // speaker assignment with overlapping turns retained.
    const warnings: string[] = [];
    if (segments.some((s) => !s.speaker)) warnings.push("Some words have no overlapping diarization turn and remain unlabelled.");
    await mkdir(dirname(output), { recursive: true });
    await Bun.write(output, JSON.stringify({ segments, turns,
      stages: { transcriptionSeconds, diarisationSeconds },
      metadata: { runtime, backend: "metal", models: models.map((m) => `${m.repo}@${m.revision}/${m.file}`) },
      warnings }, null, 2) + "\n");
  } finally {
    await rm(job, { recursive: true, force: true });
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
