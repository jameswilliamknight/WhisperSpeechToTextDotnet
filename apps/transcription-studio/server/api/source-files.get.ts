import { defineEventHandler } from 'h3'
import { sourceFiles } from '../../harness/workspace/locations'
import { settings } from '../../harness/workspace/store'
import { workspaceRequest } from '../../harness/workspace/http'

export default defineEventHandler(() => workspaceRequest(async () => ({ files: await sourceFiles(await settings()) })))
