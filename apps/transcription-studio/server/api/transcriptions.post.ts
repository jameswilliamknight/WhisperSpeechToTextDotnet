import { defineEventHandler, readBody } from 'h3'
import { z } from 'zod'
import { startTranscription } from '../../harness/workspace/manager'
import { workspaceRequest } from '../../harness/workspace/http'

const schema = z.object({ sourceName: z.string() }).strict()
export default defineEventHandler(event => workspaceRequest(async () => startTranscription(schema.parse(await readBody(event)).sourceName)))
