import { z } from 'zod'
import type { WorkerResult } from '../../shared/studio'

const seconds = z.number().finite().nonnegative()
const span = z.object({ start: seconds, end: seconds }).refine(value => value.end >= value.start, 'Reversed time span')

export const workerResultSchema = z.object({
  segments: z.array(span.safeExtend({ text: z.string(), speaker: z.string().optional() })),
  turns: z.array(span.safeExtend({ speaker: z.string() })),
  stages: z.record(z.string(), seconds).default({}),
  metadata: z.object({ runtime: z.string(), models: z.array(z.string()), backend: z.string() }),
  warnings: z.array(z.string()).default([]),
})

export function parseWorkerResult(input: unknown): WorkerResult {
  return workerResultSchema.parse(input)
}
