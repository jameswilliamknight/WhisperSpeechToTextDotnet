import { expect, test } from 'bun:test';
import { parseWhisper } from './normalize';

const source = { offsets: { from: 0, to: 3000 }, text: ' Hello world!' };
const token = (text: string, from: number, to: number, id = 10) => ({ text, id, offsets: { from, to } });
const parse = (tokens: unknown[]) => parseWhisper({ transcription: [{ ...source, tokens }] })[0]!;

test('full native JSON combines subwords and punctuation using real times', () => {
  const result = parse([token(' Hello', 0, 500), token(' wor', 600, 900), token('ld', 900, 1100), token('!', 1100, 1200), token('[_END_]', 0, 0, 50257)]);
  expect(result.text).toBe('Hello world!');
  expect(result.alignment).toEqual({ version: 1, source: { start: 0, end: 3, text: 'Hello world!' }, words: [
    { from: 0, to: 5, start: 0, end: 0.5 }, { from: 6, to: 12, start: 0.6, end: 1.2 },
  ] });
});
test('missing or mismatched token text never fabricates word timing', () => {
  expect(parse([]).alignment).toBeUndefined();
  expect(parse([token(' Different', 0, 500)]).alignment).toBeUndefined();
  expect(parse([token(' Hello world!', 0, 1200)]).alignment).toBeUndefined();
});
test('untimed, reversed and out-of-bounds words stay neutral', () => {
  for (const [from, to] of [[-1, 500], [600, 500], [0, 4000], [0, NaN]]) {
    const result = parse([token(' Hello', from!, to!), token(' world!', 600, 1200)]);
    expect(result.alignment?.words).toEqual([{ from: 6, to: 12, start: 0.6, end: 1.2 }]);
  }
});
