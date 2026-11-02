import { createError, defineEventHandler, getRouterParam, readBody } from 'h3'
import { z } from 'zod'
import { updateRunSpeakerNames } from '../../../../harness/runs/manager'

const schema = z.object({ speakerNames: z.record(z.string(), z.string()) }).strict()

export default defineEventHandler(async (event) => {
  const parsed = schema.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, message: 'Invalid speaker names', stack: '' })
  try {
    return await updateRunSpeakerNames(getRouterParam(event, 'runId') || '', parsed.data.speakerNames)
  }
  catch (error) {
    const message = error instanceof Error ? error.message : 'Speaker names could not be saved'
    throw createError({ statusCode: message.includes('not available') ? 409 : 400, message, stack: '' })
  }
})
