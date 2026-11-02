import { createError, defineEventHandler, getRouterParam } from 'h3'
import { cancelRun } from '../../../../harness/runs/manager'

export default defineEventHandler(async (event) => {
  try { await cancelRun(getRouterParam(event, 'runId') || ''); return { cancelled: true } }
  catch { throw createError({ statusCode: 409, message: 'Run is not active' }) }
})
