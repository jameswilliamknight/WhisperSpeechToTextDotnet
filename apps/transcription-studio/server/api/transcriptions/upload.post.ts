import { defineEventHandler, getQuery, getHeader, createError } from 'h3'
import { startTranscription } from '../../../harness/workspace/manager'
import { maxInputBytes } from '../../../harness/workspace/locations'
import { workspaceRequest } from '../../../harness/workspace/http'

export default defineEventHandler(event => workspaceRequest(async () => {
  if (getHeader(event, 'content-type')?.split(';')[0]?.trim() !== 'application/octet-stream') throw createError({ statusCode: 415, message: 'Raw audio upload requires application/octet-stream' })
  const length = getHeader(event, 'content-length')
  if (length && (!/^\d+$/.test(length) || Number(length) > maxInputBytes)) throw createError({ statusCode: 413, message: 'Audio exceeds the 2 GB upload limit' })
  return startTranscription(getQuery(event).name, event.node.req)
}))
