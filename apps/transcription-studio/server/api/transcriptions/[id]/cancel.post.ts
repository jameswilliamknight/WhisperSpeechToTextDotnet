import { defineEventHandler, getRouterParam, readBody } from 'h3'
import { z } from 'zod'
import { cancelTranscription } from '../../../../harness/workspace/manager'
import { workspaceRequest } from '../../../../harness/workspace/http'

export default defineEventHandler(event => workspaceRequest(async () => {
  z.object({}).strict().parse(await readBody(event))
  await cancelTranscription(getRouterParam(event, 'id') || '')
  return { success: true }
}))
