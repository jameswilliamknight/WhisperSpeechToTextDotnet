import { join } from "node:path";
import { parseWhisper } from "./normalize";

export const runtime = "whisper.cpp v1.8.2 (4979e04f5dcaccb36057e059bbaed8a2f5288315)";
export const modelId = "ggerganov/whisper.cpp@5359861c739e955e79d9a303bcbc70fb988958b1/ggml-large-v3-turbo.bin";
export const root = import.meta.dir;
export const cli = join(root, ".runtime/whisper.cpp/build/bin/whisper-cli");
export const model = join(root, "models/ggml-large-v3-turbo.bin");
export const shutdown = new AbortController();

// Native tools can print recognised text on either stream. Never inherit them.
// Children stay in the worker's process group. Terminate, then force-kill after
// five seconds, so timeout/cancellation cannot leave a native inference orphan.
export async function run(command: string[], stage: string,
  options: { signal?: AbortSignal; timeoutMs?: number; onProgressLine?: (line: string) => void } = {}) {
  const signal = options.signal ?? shutdown.signal;
  const timeoutMs = options.timeoutMs ?? 6 * 60 * 60 * 1000;
  if (signal.aborted) throw new Error(`${stage} cancelled`);
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new Error("Invalid native timeout");
  const child = Bun.spawn(command, { stdout: "ignore", stderr: options.onProgressLine ? "pipe" : "ignore" });
  // Consume progress concurrently; transcript-bearing stderr is parsed only for the
  // numeric callback pattern and never logged, persisted, or returned.
  const stderr = options.onProgressLine && child.stderr && typeof child.stderr !== "number"
    ? (async () => {
        const decoder = new TextDecoder(); let buffered = "";
        for await (const chunk of child.stderr as ReadableStream<Uint8Array>) {
          buffered += decoder.decode(chunk, { stream: true });
          let newline: number;
          while ((newline = buffered.indexOf("\n")) >= 0) {
            const line = buffered.slice(0, newline); buffered = buffered.slice(newline + 1);
            try { options.onProgressLine!(line) } catch { /* Progress must never break inference. */ }
          }
        }
      })()
    : Promise.resolve();
  let stopped = false;
  let force: ReturnType<typeof setTimeout> | undefined;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    child.kill("SIGTERM");
    force = setTimeout(() => child.kill("SIGKILL"), 5000);
  };
  signal.addEventListener("abort", stop, { once: true });
  if (signal.aborted) stop();
  const timer = setTimeout(stop, timeoutMs);
  try {
    const code = await child.exited;
    await stderr;
    if (stopped || code !== 0) throw new Error(`${stage} failed/cancelled/timed out (exit ${code}); native output suppressed for privacy`);
  } finally {
    clearTimeout(timer);
    if (force) clearTimeout(force);
    signal.removeEventListener("abort", stop);
  }
}

/** whisper.cpp's stderr callback is the only progress source; parse just the percentage. */
export function parseWhisperProgress(line: string): number | undefined {
  const match = /progress\s*=\s*(\d{1,3})%/i.exec(line);
  return match ? Math.min(100, Number(match[1])) : undefined;
}

// Internal helper only: the public worker requires a real configured diarizer.
export async function transcribe(input: string, job: string, onProgress?: (percent: number) => void) {
  const prefix = join(job, "asr");
  const started = performance.now();
  // Full JSON retains native token timestamps without splitting text into tiny exports.
  const command = [cli, "-m", model, "-f", input, "-l", "en", "-ojf", "-of", prefix, "-np"];
  if (onProgress) command.push("-pp");
  await run(command, "Whisper ASR", {
    onProgressLine: onProgress
      ? line => {
          const percent = parseWhisperProgress(line);
          if (percent !== undefined) onProgress(percent);
        }
      : undefined,
  });
  const segments = parseWhisper(await Bun.file(`${prefix}.json`).json());
  return { segments, transcriptionSeconds: (performance.now() - started) / 1000 };
}
