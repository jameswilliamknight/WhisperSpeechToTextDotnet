const palette = [
  'var(--color-fb-primary)',
  'var(--color-green-400, #4ade80)',
  'var(--color-red-400, #f87171)',
  'var(--color-yellow-400, #facc15)',
  'var(--color-purple-400, #c084fc)',
  'var(--color-orange-400, #fb923c)',
]

/** One-based sequence: speaker 1 is blue, speaker 2 green, and so on. */
export function speakerColorAt(sequence: number): Record<string, string> {
  if (!Number.isInteger(sequence) || sequence < 1) return {}
  const index = sequence - 1
  // Golden-angle spacing yields a repeatable, well-distributed continuation.
  const color = palette[index] ?? `hsl(${Math.round((index - palette.length) * 137.508 + 195) % 360} 75% 70%)`
  return {
    '--speaker-color': color,
    '--speaker-border': index === 0 ? 'var(--color-fb-primary-border)' : `color-mix(in srgb, ${color} 65%, transparent)`,
    '--speaker-fill': index === 0 ? 'var(--color-fb-primary-soft)' : `color-mix(in srgb, ${color} 20%, transparent)`,
    color,
  }
}

/** Resolve opaque ids through the shared stable order, never editable names. */
export function speakerColor(speaker: string | undefined, speakers: readonly string[]): Record<string, string> {
  return speakerColorAt(speaker ? speakers.indexOf(speaker) + 1 : 0)
}
