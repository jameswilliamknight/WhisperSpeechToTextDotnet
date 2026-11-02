import { expect, test } from "bun:test";
import { align, parseTurns, parseWhisper } from "./normalize";

test("Whisper offsets convert milliseconds to seconds without guessing clock strings", () => {
  expect(parseWhisper({ transcription: [{ offsets: { from: 125, to: 1999 }, text: " hello " }] }))
    .toEqual([{ start: 0.125, end: 1.999, text: "hello" }]);
});
test("empty native results remain empty", () => {
  expect(parseWhisper({ transcription: [] })).toEqual([]);
  expect(parseTurns({ segments: [] })).toEqual([]);
});
test("invalid/missing/negative/reversed/nonfinite ASR timestamps fail", () => {
  for (const offsets of [{ from: -1, to: 1 }, { from: 2, to: 1 }, { from: 0, to: NaN }, { from: "0", to: 1 }, {}])
    expect(() => parseWhisper({ transcription: [{ offsets, text: "test" }] })).toThrow();
  expect(() => parseWhisper({ text: "test" })).toThrow();
});
test("NeMo JSON is seconds and speakers are one-based", () => {
  expect(parseTurns({ segments: [{ start: 0.1, end: 2, speaker: 2 }] }))
    .toEqual([{ start: 0.1, end: 2, speaker: "speaker_2" }]);
  for (const speaker of [0, -1, 1.5, "1", undefined])
    expect(() => parseTurns({ segments: [{ start: 0, end: 1, speaker }] })).toThrow();
});
test("NeMo malformed timestamps and non-object shapes fail", () => {
  for (const value of [null, [], {}, { segments: [null] }, { segments: [{ start: 3, end: 1, speaker: 1 }] }])
    expect(() => parseTurns(value)).toThrow();
});
test("boundary contact and zero-length segments never invent speakers", () => {
  const segments = [{ start: 1, end: 2, text: "gap" }, { start: 0, end: 0, text: "zero" }];
  expect(align(segments, [{ start: 0, end: 1, speaker: "a" }, { start: 2, end: 3, speaker: "b" }]))
    .toEqual(segments);
});
test("greatest overlap wins; deterministic ties preserve first; inputs unchanged", () => {
  const segment = { start: 0, end: 4, text: "speaker boundary" };
  const turns = [{ start: 0, end: 1, speaker: "a" }, { start: 1, end: 4, speaker: "b" }];
  expect(align([segment], turns)[0]?.speaker).toBe("b");
  expect(align([segment], [{ start: 0, end: 2, speaker: "a" }, { start: 2, end: 4, speaker: "b" }])[0]?.speaker).toBe("a");
  expect(segment).not.toHaveProperty("speaker");
  expect(turns).toHaveLength(2);
});
