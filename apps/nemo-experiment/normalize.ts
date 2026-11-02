type Span = { start: number; end: number };
export type Turn = Span & { speaker: string };
export type Segment = Span & { text: string; speaker?: string };

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Expected object");
  return value as Record<string, unknown>;
}

function span(value: Record<string, unknown>): Span {
  const { start, end } = value;
  if (typeof start !== "number" || typeof end !== "number" ||
      !Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end < start)
    throw new Error("Invalid timestamps (expected seconds)");
  return { start, end };
}

export function parseTurns(value: unknown): Turn[] {
  const segments = object(value).segments;
  if (!Array.isArray(segments)) throw new Error("Missing diarization segments");
  return segments.map((item) => {
    const row = object(item);
    if (!Number.isInteger(row.speaker) || Number(row.speaker) < 1) throw new Error("Invalid speaker");
    return { ...span(row), speaker: `speaker_${row.speaker}` };
  });
}

export function parseWords(value: unknown, offset = 0): Segment[] {
  const row = object(value);
  if (!Array.isArray(row.words)) throw new Error("Missing ASR words");
  if (row.words.length === 0 && typeof row.text === "string" && row.text.trim())
    throw new Error("ASR produced text without timestamps; refusing fabricated timings");
  return row.words.map((item) => {
    const word = object(item);
    if (typeof word.word !== "string") throw new Error("Invalid word");
    const { start, end } = span(word);
    return { start: start + offset, end: end + offset, text: word.word };
  });
}

// Preserve overlapping native turns. Label words by greatest positive overlap;
// first native turn wins ties, and silence never receives an invented speaker.
export function labelWords(words: Segment[], turns: Turn[]): Segment[] {
  return words.map((word) => {
    let best = 0;
    let speaker: string | undefined;
    for (const turn of turns) {
      const overlap = Math.min(word.end, turn.end) - Math.max(word.start, turn.start);
      if (overlap > best) { best = overlap; speaker = turn.speaker; }
    }
    return speaker ? { ...word, speaker } : { ...word };
  });
}
