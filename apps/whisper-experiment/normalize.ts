import { whisperWordAlignment, type WordAlignment } from './wordTimings';

export type Segment = { start: number; end: number; text: string; speaker?: string; alignment?: WordAlignment };
export type Turn = { start: number; end: number; speaker: string };

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Expected JSON object");
  return value as Record<string, unknown>;
}

function span(start: unknown, end: unknown) {
  if (typeof start !== "number" || typeof end !== "number" ||
      !Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end < start)
    throw new Error("Invalid timestamp span");
  return { start, end };
}

// Native whisper-cli JSON offsets are integer milliseconds, not seconds or ticks.
export function parseWhisper(value: unknown): Segment[] {
  const rows = object(value).transcription;
  if (!Array.isArray(rows)) throw new Error("Missing Whisper transcription");
  return rows.map((item) => {
    const row = object(item), offsets = object(row.offsets);
    const times = span(offsets.from, offsets.to);
    if (typeof row.text !== "string") throw new Error("Invalid Whisper text");
    const source = { start: times.start / 1000, end: times.end / 1000, text: row.text.trim() };
    const alignment = whisperWordAlignment(row, source);
    return { ...source, ...(alignment ? { alignment } : {}) };
  });
}

// NeMo-Speech.cpp v0.3.0 standalone diarize JSON uses seconds and 1-based speakers.
export function parseTurns(value: unknown): Turn[] {
  const rows = object(value).segments;
  if (!Array.isArray(rows)) throw new Error("Missing NeMo diarization segments");
  return rows.map((item) => {
    const row = object(item);
    if (!Number.isInteger(row.speaker) || Number(row.speaker) < 1) throw new Error("Invalid NeMo speaker");
    return { ...span(row.start, row.end), speaker: `speaker_${row.speaker}` };
  });
}

// Segment-level timestamps cannot honestly split text at speaker changes. Keep text
// intact, pick greatest positive overlap (first wins ties), and retain all turns.
export function align(segments: Segment[], turns: Turn[]): Segment[] {
  return segments.map((segment) => {
    let best = 0;
    let speaker: string | undefined;
    for (const turn of turns) {
      const overlap = Math.min(segment.end, turn.end) - Math.max(segment.start, turn.start);
      if (overlap > best) { best = overlap; speaker = turn.speaker; }
    }
    return speaker ? { ...segment, speaker } : { ...segment };
  });
}
