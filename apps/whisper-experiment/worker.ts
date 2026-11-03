import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { cli, model, modelId, root, run, runtime, shutdown, transcribe } from "./asr";
import { align, parseTurns } from "./normalize";
import { assertWorkingCopy } from "./origin";
import { writeProgress } from "./progress";

async function main() {
  process.umask(0o077);
  process.once("SIGTERM", () => shutdown.abort());
  process.once("SIGINT", () => shutdown.abort());
  const { values } = parseArgs({ options: {
    input: { type: "string" }, output: { type: "string" }, origin: { type: "string" }, progress: { type: "string" },
  } });
  if (!values.input || !values.output) throw new Error("Usage: bun worker.ts --input working.wav --output result.json [--origin original] [--progress status.json]");
  const nemo = process.env.NEMO_SPEECH_BIN, diarModel = process.env.NEMO_DIAR_MODEL;
  if (!nemo || !diarModel) throw new Error("Real diarization required: configure NEMO_SPEECH_BIN and NEMO_DIAR_MODEL to local files");
  const input = resolve(values.input), output = resolve(values.output);
  const progress = values.progress ? resolve(values.progress) : undefined;
  if (input === output || input === progress || output === progress) throw new Error("Input, output and progress must differ");
  let progressWrites = Promise.resolve();
  const report = (stage: string, percent: number | null = null) => {
    if (progress) progressWrites = progressWrites.then(() => writeProgress(progress, stage, percent)).catch(() => {});
  };
  // Origin is an identity check only; the harness never passes original audio contents here.
  await assertWorkingCopy(input, values.origin ? resolve(values.origin) : undefined);
  if (await Bun.file(output).exists()) throw new Error("Output already exists; choose a new private result path");
  for (const path of [cli, model, nemo, diarModel])
    if (!await Bun.file(path).exists()) throw new Error("Missing local runtime/model; see README setup/configuration");
  await mkdir(join(root, ".runtime/jobs"), { recursive: true, mode: 0o700 });
  const job = await mkdtemp(join(root, ".runtime/jobs/run-"));
  try {
    report("Transcribing audio", 0);
    const asr = await transcribe(input, job, percent => report("Transcribing audio", percent));
    report("Identifying speakers");
    const diarStart = performance.now(), diarOutput = join(job, "diar.json");
    await run([nemo, "diarize", input, "--model", diarModel, "--backend", "metal",
      "--preset", "v3-streaming", "--format", "json", "--output", diarOutput], "NeMo diarization");
    const turns = parseTurns(await Bun.file(diarOutput).json());
    if (shutdown.signal.aborted) throw new Error("Worker cancelled");
    report("Aligning speakers");
    const diarisationSeconds = (performance.now() - diarStart) / 1000;
    const segments = align(asr.segments, turns);
    // Static adapter caveats live here rather than in per-run output: speakers are
    // assigned by maximum positive overlap to whole Whisper segments (first turn
    // wins ties). Optional word timings enrich display only; segments may still span
    // speaker changes. Native overlapping turns are retained, stage times include
    // startup/model loading, and Metal
    // may fall back to CPU because this adapter does not enforce GPU usage.
    const warnings: string[] = [];
    if (segments.some((s) => !s.speaker)) warnings.push("Some ASR segments have no overlapping speaker turn and remain unlabelled.");
    report("Saving transcript", 100);
    await mkdir(dirname(output), { recursive: true, mode: 0o700 });
    await writeFile(output, JSON.stringify({ segments, turns,
      stages: { transcriptionSeconds: asr.transcriptionSeconds, diarisationSeconds },
      metadata: { runtime: `${runtime} + NeMo-Speech.cpp (configured local CLI)`,
        models: [modelId, diarModel], backend: "whisper-metal-auto+nemo-metal" }, warnings }, null, 2) + "\n",
      { flag: "wx", mode: 0o600 });
    report("Complete", 100);
    await progressWrites;
  } finally {
    await progressWrites;
    await rm(job, { recursive: true, force: true });
  }
}

main().catch(() => { console.error("Whisper worker failed; check local runtime/models, configuration, WAV input and unused output path (details suppressed for privacy)."); process.exitCode = 1; });
