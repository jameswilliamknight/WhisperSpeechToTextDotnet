import { constants } from 'node:fs'
import { open } from 'node:fs/promises'
import { createError, defineEventHandler, getHeader, getRouterParam, sendStream, setHeader, setResponseStatus } from 'h3'
import { audioFile } from '../../../../harness/workspace/manager'
import { workspaceRequest } from '../../../../harness/workspace/http'

export default defineEventHandler(event => workspaceRequest(async () => {
  const path = await audioFile(getRouterParam(event, 'id') || '')
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW)
  let handedOff = false
  try {
    const stat = await file.stat()
    if (!stat.isFile() || !stat.size) throw new Error('Working audio is unavailable')
    let start = 0
    let end = stat.size - 1
    const range = getHeader(event, 'range')
    if (range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range)
      if (!match || (!match[1] && !match[2])) throw createError({ statusCode: 416, message: 'Invalid byte range' })
      if (!match[1]) start = Math.max(0, stat.size - Number(match[2]))
      else { start = Number(match[1]); if (match[2]) end = Math.min(end, Number(match[2])) }
      if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= stat.size) {
        setHeader(event, 'Content-Range', `bytes */${stat.size}`)
        throw createError({ statusCode: 416, message: 'Invalid byte range' })
      }
      setResponseStatus(event, 206)
      setHeader(event, 'Content-Range', `bytes ${start}-${end}/${stat.size}`)
    }
    setHeader(event, 'Accept-Ranges', 'bytes')
    setHeader(event, 'Content-Type', 'audio/wav')
    setHeader(event, 'Content-Length', end - start + 1)
    const stream = file.createReadStream({ start, end, autoClose: true })
    handedOff = true
    return sendStream(event, stream)
  }
  finally { if (!handedOff) await file.close() }
}))
