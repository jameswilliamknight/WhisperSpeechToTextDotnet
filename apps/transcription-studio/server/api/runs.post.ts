import { createError, defineEventHandler, readValidatedBody, setResponseStatus } from 'h3'
import { z } from 'zod'
import { startRun } from '../../harness/runs/manager'

const requestSchema = z.object({ backend: z.enum(['fluidaudio', 'nemo', 'whisper']), preset: z.enum(['smoke', 'full']) }).strict()

export default defineEventHandler(async (event) => {
  const body = await readValidatedBody(event, value => requestSchema.parse(value))
  try {
    const run = await startRun(body.backend, body.preset)
    setResponseStatus(event, 202)
    return run
  }
  catch (error) { throw createError({ statusCode: 409, message: error instanceof Error ? error.message : 'Cannot start benchmark' }) }
})
