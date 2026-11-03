import { defineEventHandler, readBody } from 'h3'
import { z } from 'zod'
import { updatePreferences } from '~~/harness/workspace/manager'
import { workspaceRequest } from '~~/harness/workspace/http'

const processing = z.object({
  disableGrouping: z.boolean(), disableGapBridging: z.boolean(), disableUnlabelledCondensing: z.boolean(),
  disableIslandCorrection: z.boolean(), disablePlainCopyFlow: z.boolean(),
}).strict()
const schema = z.object({ selectedJobId: z.string().nullable(), copyWithSpeakers: z.boolean(), transcriptProcessing: processing.optional() }).strict()
export default defineEventHandler(event => workspaceRequest(async () => updatePreferences(schema.parse(await readBody(event)))))
