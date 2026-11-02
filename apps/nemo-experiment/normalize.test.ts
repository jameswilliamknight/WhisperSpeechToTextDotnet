import { expect, test } from "bun:test";
import { labelWords, parseTurns, parseWords } from "./normalize";

test("native seconds and chunk offsets are preserved", () => {
  expect(parseWords({ words: [{ word: "hello", start: 0.24, end: 0.56 }] }, 60))
    .toEqual([{ text: "hello", start: 60.24, end: 60.56 }]);
});
test("native one-based speakers, overlap and silence", () => {
  const turns = parseTurns({ segments: [
    { start: 0, end: 2, speaker: 1 }, { start: 1, end: 4, speaker: 2 },
  ] });
  expect(turns[0]?.speaker).toBe("speaker_1");
  const words = [{ start: 1.5, end: 3, text: "two" }, { start: 5, end: 6, text: "unknown" }];
  expect(labelWords(words, turns)).toEqual([
    { ...words[0], speaker: "speaker_2" }, words[1],
  ]);
});
test("empty speech is valid but text without timings is not", () => {
  expect(parseWords({ text: "", words: [] })).toEqual([]);
  expect(parseTurns({ segments: [] })).toEqual([]);
  expect(() => parseWords({ text: "missing alignment", words: [] })).toThrow();
});
test("malformed output fails rather than fabricating data", () => {
  expect(() => parseWords({})).toThrow();
  expect(() => parseWords({ words: [{ word: "bad", start: -1, end: 2 }] })).toThrow();
  expect(() => parseTurns({ segments: [{ start: 1, end: 0, speaker: 1 }] })).toThrow();
  expect(() => parseTurns({ segments: [{ start: 0, end: 1, speaker: 0 }] })).toThrow();
});

test("overlap ties retain the first native turn and zero-duration words stay unlabelled", () => {
  const turns = parseTurns({ segments: [
    { start: 0, end: 2, speaker: 2 }, { start: 0, end: 2, speaker: 1 },
  ] });
  expect(labelWords([{ start: 0, end: 1, text: "tie" }], turns)[0]?.speaker).toBe("speaker_2");
  expect(labelWords([{ start: 1, end: 1, text: "zero" }], turns)[0]?.speaker).toBeUndefined();
});
