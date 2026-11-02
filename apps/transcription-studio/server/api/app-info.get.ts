import { defineEventHandler } from 'h3'

// A launcher probes identity before reusing a port; never open an unrelated local app.
export default defineEventHandler(() => ({ application: 'local-transcribe', version: 1 }))
