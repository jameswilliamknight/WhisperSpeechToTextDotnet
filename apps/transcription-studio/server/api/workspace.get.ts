import { defineEventHandler } from 'h3'
import { workspaceSnapshot } from '../../harness/workspace/manager'
import { workspaceRequest } from '../../harness/workspace/http'

export default defineEventHandler(() => workspaceRequest(workspaceSnapshot))
