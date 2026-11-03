import { defineEventHandler, getRouterParam } from 'h3'
import { retryTranscription } from '~~/harness/workspace/manager'
import { workspaceRequest } from '~~/harness/workspace/http'

/** Caller supplies only an existing job ID; source paths are resolved server-side. */
export default defineEventHandler(event => workspaceRequest(() => retryTranscription(getRouterParam(event, 'id') ?? '')))
