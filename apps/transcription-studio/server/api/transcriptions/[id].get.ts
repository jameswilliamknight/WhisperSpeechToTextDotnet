import { defineEventHandler, getRouterParam } from 'h3'
import { transcriptionDetail } from '../../../harness/workspace/manager'
import { workspaceRequest } from '../../../harness/workspace/http'

export default defineEventHandler(event => workspaceRequest(() => transcriptionDetail(getRouterParam(event, 'id') || '')))
