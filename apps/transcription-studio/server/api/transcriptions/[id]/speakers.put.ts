import { createError, defineEventHandler, getRouterParam, readBody } from 'h3'
import { z } from 'zod'
import { updateSpeakerNames } from '../../../../harness/workspace/manager'
import { workspaceRequest } from '../../../../harness/workspace/http'

const schema = z.object({ speakerNames: z.record(z.string(), z.string()) }).strict()

export default defineEventHandler(event => workspaceRequest(async () => {
  const parsed = schema.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, message: 'Invalid speaker names', stack: '' })
  return updateSpeakerNames(getRouterParam(event, 'id') || '', parsed.data.speakerNames)
}))
