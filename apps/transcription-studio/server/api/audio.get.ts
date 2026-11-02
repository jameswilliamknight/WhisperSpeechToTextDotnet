import { createReadStream } from 'node:fs'
import { lstat } from 'node:fs/promises'
import { createError, defineEventHandler, getHeader, sendStream, setHeader, setResponseStatus } from 'h3'
import { copiedSource, sourceInfo } from '../../harness/source/source'

export default defineEventHandler(async (event) => {
  if (!(await sourceInfo()).prepared) throw createError({ statusCode: 404, message: 'Source not prepared' })
  const stat = await lstat(copiedSource)
  if (!stat.isFile() || stat.isSymbolicLink()) throw createError({ statusCode: 409, message: 'Invalid source copy' })
  setHeader(event, 'Content-Type', 'audio/mpeg')
  setHeader(event, 'Accept-Ranges', 'bytes')
  const range = getHeader(event, 'range')
  if (!range) {
    setHeader(event, 'Content-Length', stat.size)
    return sendStream(event, createReadStream(copiedSource))
  }
  const match = /^bytes=(\d+)-(\d*)$/.exec(range)
  const start = Number(match?.[1])
  const end = match?.[2] ? Math.min(Number(match[2]), stat.size - 1) : stat.size - 1
  if (!match || !Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= stat.size) {
    setHeader(event, 'Content-Range', `bytes */${stat.size}`)
    throw createError({ statusCode: 416, message: 'Invalid audio range' })
  }
  setResponseStatus(event, 206)
  setHeader(event, 'Content-Range', `bytes ${start}-${end}/${stat.size}`)
  setHeader(event, 'Content-Length', end - start + 1)
  return sendStream(event, createReadStream(copiedSource, { start, end }))
})
