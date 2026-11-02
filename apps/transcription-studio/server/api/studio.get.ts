import { defineEventHandler } from 'h3'
import { studioSnapshot } from '../../harness/runs/manager'

export default defineEventHandler(() => studioSnapshot())
