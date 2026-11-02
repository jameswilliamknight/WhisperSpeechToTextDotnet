import { defineEventHandler, readBody } from 'h3'
import { z } from 'zod'
import { updatePreferences } from '../../../harness/workspace/manager'
import { workspaceRequest } from '../../../harness/workspace/http'

const schema = z.object({ selectedJobId: z.string().nullable(), copyWithSpeakers: z.boolean() }).strict()
export default defineEventHandler(event => workspaceRequest(async () => updatePreferences(schema.parse(await readBody(event)))))
