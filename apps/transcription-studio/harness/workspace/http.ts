import { createError, isError } from 'h3'

/** Expected local validation errors are responses, not console logs containing private paths/content. */
export async function workspaceRequest<T>(action: () => Promise<T>): Promise<T> {
  try { return await action() }
  catch (error) {
    if (isError(error)) throw error
    const message = error instanceof Error ? error.message : 'Workspace request failed'
    const statusCode = message.includes('not found') ? 404 : message.includes('already running') ? 409 : message.includes('upload size limit') ? 413 : 400
    throw createError({ statusCode, message, stack: '' })
  }
}
