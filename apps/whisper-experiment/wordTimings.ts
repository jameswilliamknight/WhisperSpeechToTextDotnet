export interface TimedWord {
  from: number;
  to: number;
  start: number;
  end: number;
}

export interface WordAlignment {
  version: 1;
  source: { text: string; start: number; end: number };
  words: TimedWord[];
}

/** Native tokens are subwords, not words. Only combine tokens whose real character
 * ranges cover a complete word; never divide segment duration to invent timing.
 * Source snapshots deliberately use exact text/times instead of a lossy hash. */
export function whisperWordAlignment(row: Record<string, unknown>, source: WordAlignment['source']): WordAlignment | undefined {
  if (!Array.isArray(row.tokens) || !row.tokens.length || typeof row.text !== 'string') return;
  const tokens: { text: string; start?: number; end?: number }[] = [];
  for (const value of row.tokens) {
    if (!value || typeof value !== 'object') return;
    const token = value as Record<string, unknown>;
    if (typeof token.text !== 'string') return;
    // The selected multilingual model reserves IDs >= 50257 for control tokens.
    if (typeof token.id === 'number' && token.id >= 50257) continue;
    const offsets = token.offsets as { from?: unknown; to?: unknown } | undefined;
    const from = offsets?.from, to = offsets?.to;
    const valid = typeof from === 'number' && typeof to === 'number' && Number.isFinite(from) && Number.isFinite(to)
      && from >= source.start * 1000 && to <= source.end * 1000 && to > from;
    tokens.push({ text: token.text, ...(valid ? { start: from / 1000, end: to / 1000 } : {}) });
  }
  const full = tokens.map(token => token.text).join('');
  if (full !== row.text || full.trim() !== source.text) return;
  const leading = full.length - full.trimStart().length;
  let cursor = -leading;
  const ranges = tokens.map(token => {
    const from = cursor;
    cursor += token.text.length;
    return { ...token, from, to: cursor };
  });
  const words: TimedWord[] = [];
  for (const match of source.text.matchAll(/\S+/gu)) {
    const from = match.index, to = from + match[0].length;
    const pieces = ranges.filter(token => token.from < to && token.to > from);
    if (!pieces.length || pieces.some(token => (token.start === undefined || token.end === undefined) && /[\p{L}\p{N}]/u.test(token.text))) continue;
    // If a native token spans multiple whitespace-delimited words, its internal
    // boundary is unknown. Leave these words neutral rather than duplicating time.
    if (pieces.some(token => /\s/u.test(source.text.slice(Math.max(0, token.from), token.to).trim()))) continue;
    const timed = pieces.filter(token => token.start !== undefined && token.end !== undefined);
    if (!timed.length) continue;
    const start = Math.min(...timed.map(token => token.start!));
    const end = Math.max(...timed.map(token => token.end!));
    if (words.length && start < words.at(-1)!.end) continue;
    words.push({ from, to, start, end });
  }
  return words.length ? { version: 1, source, words } : undefined;
}
