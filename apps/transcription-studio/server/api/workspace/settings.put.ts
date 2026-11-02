import { defineEventHandler, readBody } from 'h3'
import { z } from 'zod'
import { updateSettings } from '../../../harness/workspace/manager'
import { workspaceRequest } from '../../../harness/workspace/http'

const schema = z.object({ sourceDirectory: z.string(), workingDirectory: z.string(), outputDirectory: z.string() }).strict()
export default defineEventHandler(event => workspaceRequest(async () => updateSettings(schema.parse(await readBody(event)))))
