import { createError, defineEventHandler, getHeader, setHeader } from 'h3'

/** Private counselling audio/transcripts must never become a LAN service or a cross-origin mutation target. */
export default defineEventHandler((event) => {
  const remote = event.node.req.socket.remoteAddress
  const host = getHeader(event, 'host') || ''
  let localHost = false
  try { localHost = ['localhost', '127.0.0.1', '[::1]'].includes(new URL(`http://${host}`).hostname) } catch { /* Invalid Host. */ }
  // Nuxt's dev worker can omit the socket; its outer listener is explicitly loopback-bound.
  const localPeer = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(remote || '') || (!remote && import.meta.dev)
  if (!localHost || !localPeer) {
    throw createError({ statusCode: 403, message: 'Studio is local-only' })
  }
  setHeader(event, 'Cache-Control', 'no-store')
  setHeader(event, 'Referrer-Policy', 'no-referrer')
  setHeader(event, 'X-Content-Type-Options', 'nosniff')
  setHeader(event, 'X-Frame-Options', 'DENY')
  if (!['GET', 'HEAD', 'OPTIONS'].includes(event.method)) {
    const origin = getHeader(event, 'origin')
    const rawUpload = event.method === 'POST' && event.path.split('?')[0] === '/api/transcriptions/upload'
      && getHeader(event, 'content-type')?.split(';')[0]?.trim() === 'application/octet-stream'
    if (origin !== `http://${host}` || (!rawUpload && !getHeader(event, 'content-type')?.startsWith('application/json'))) {
      throw createError({ statusCode: 403, message: 'Same-origin JSON request required' })
    }
  }
})
