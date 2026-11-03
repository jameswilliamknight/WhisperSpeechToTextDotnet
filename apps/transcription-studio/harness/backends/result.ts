import { z } from 'zod'
import type { WorkerResult } from '#shared/studio'
import { alignedWords } from '#shared/wordAlignment'

const seconds = z.number().finite().nonnegative()
const span = z.object({ start: seconds, end: seconds }).refine(value => value.end >= value.start, 'Reversed time span')
const alignment = z.object({
  version: z.literal(1),
  source: span.safeExtend({ text: z.string() }),
  words: z.array(span.safeExtend({ from: z.number().int().nonnegative(), to: z.number().int().positive() })),
}).optional().catch(undefined)

export const workerResultSchema = z.object({
  segments: z.array(span.safeExtend({ text: z.string(), speaker: z.string().optional(), alignment })),
  turns: z.array(span.safeExtend({ speaker: z.string() })),
  stages: z.record(z.string(), seconds).default({}),
  metadata: z.object({ runtime: z.string(), models: z.array(z.string()), backend: z.string() }),
  warnings: z.array(z.string()).default([]),
})

export function parseWorkerResult(input: unknown): WorkerResult {
  const result = workerResultSchema.parse(input)
  for (const segment of result.segments) {
    if (segment.alignment && !alignedWords(segment).length) delete segment.alignment
  }
  return result
}
