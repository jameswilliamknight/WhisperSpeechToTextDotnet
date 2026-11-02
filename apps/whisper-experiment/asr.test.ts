import { expect, test } from "bun:test";
import { run } from "./asr";

test("native nonzero exit is rejected without child text", async () => {
  await expect(run([process.execPath, "-e", "console.error('SECRET');process.exit(7)"], "test"))
    .rejects.toThrow("exit 7");
});
test("bounded subprocess timeout terminates a child", async () => {
  await expect(run([process.execPath, "-e", "setInterval(()=>{},1000)"], "timeout", { timeoutMs: 50 }))
    .rejects.toThrow("timed out");
});
test("cancellation terminates a running child and pre-abort never spawns", async () => {
  const controller = new AbortController();
  const pending = run([process.execPath, "-e", "setInterval(()=>{},1000)"], "cancel", { signal: controller.signal });
  controller.abort();
  await expect(pending).rejects.toThrow("cancelled");
  await expect(run(["does-not-exist"], "pre-abort", { signal: controller.signal })).rejects.toThrow("cancelled");
});
