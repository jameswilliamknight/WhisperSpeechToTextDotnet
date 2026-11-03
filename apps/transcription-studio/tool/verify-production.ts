import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import type { WorkspaceSnapshot } from '../shared/workspace'
import { processingToggleDefaults } from '../shared/transcriptProcessing'

// Isolated state: production smoke tests must never inspect the owner's recording or run real workers.
const root = await realpath(await mkdtemp(join(tmpdir(), 'studio-production-')))
function startServer() { return Bun.spawn([process.execPath, resolve('.output/server/index.mjs')], {
  env: { ...process.env, HOST: 'localhost', PORT: '42077', STUDIO_ROOT: root },
  stdout: 'pipe', stderr: 'pipe',
}) }
let child = startServer()
async function waitForReady() {
  const ready = (async () => {
  for await (const chunk of child.stdout) {
    if (new TextDecoder().decode(chunk).includes('Listening')) return
  }
  throw new Error('Production server stopped before listening')
  })()
  await Promise.race([ready, new Promise((_, reject) => setTimeout(() => reject(new Error('Production startup timeout')), 15_000).unref())])
}
try {
  await waitForReady()
  for (const path of ['/', '/settings', '/benchmarks']) {
    const page = await fetch(`http://localhost:42077${path}`)
    if (page.status !== 200 || !(await page.text()).includes('Transcription Studio')) throw new Error(`Production page failed: ${path}`)
  }
  const response = await fetch('http://localhost:42077/api/studio')
  if (response.status !== 200) throw new Error(`Production API returned ${response.status}`)
  const state = await response.json() as { source: { prepared: boolean }; runs: unknown[] }
  if (state.source.prepared || state.runs.length) throw new Error('Production smoke did not use isolated state')
  const identity = await fetch('http://localhost:42077/api/app-info').then(response => response.json())
  if (identity.application !== 'local-transcribe') throw new Error('Launcher identity endpoint failed')
  const workspaceResponse = await fetch('http://localhost:42077/api/workspace')
  if (workspaceResponse.status !== 200) throw new Error(`Workspace API returned ${workspaceResponse.status}`)
  const workspace = await workspaceResponse.json() as WorkspaceSnapshot
  if (workspace.jobs.length || workspace.activeJobId || workspace.settings.sourceDirectory) throw new Error('Workspace smoke did not use isolated state')
   if (JSON.stringify(workspace.preferences.transcriptProcessing) !== JSON.stringify(processingToggleDefaults)) throw new Error('Processing defaults must all be false')
   const preferences = { selectedJobId: null, copyWithSpeakers: false, transcriptProcessing: { ...processingToggleDefaults, disableGrouping: true } }
  const saved = await fetch('http://localhost:42077/api/workspace/preferences', {
    method: 'PUT', headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:42077' }, body: JSON.stringify(preferences),
  })
  if (!saved.ok) throw new Error(`Workspace preference persistence failed: ${saved.status}`)
  const restored = await fetch('http://localhost:42077/api/workspace').then(response => response.json()) as WorkspaceSnapshot
  if (restored.preferences.copyWithSpeakers !== false) throw new Error('Workspace preferences were not retained')
  if (restored.preferences.transcriptProcessing?.disableGrouping !== true) throw new Error('Processing switches were not retained')
  const invalidProcessing = await fetch('http://localhost:42077/api/workspace/preferences', {
    method: 'PUT', headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:42077' },
    body: JSON.stringify({ ...preferences, transcriptProcessing: { ...preferences.transcriptProcessing, disableGrouping: 'true' } }),
  })
  if (invalidProcessing.ok) throw new Error('Invalid processing switch accepted')
  const sourceDirectory = join(root, 'source')
  await mkdir(sourceDirectory)
  await writeFile(join(sourceDirectory, 'synthetic.wav'), 'synthetic audio fixture, never processed')
  await writeFile(join(sourceDirectory, 'not-audio.txt'), 'not audio')
  const locations = { ...workspace.settings, sourceDirectory }
  const settingsResponse = await fetch('http://localhost:42077/api/workspace/settings', {
    method: 'PUT', headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:42077' }, body: JSON.stringify(locations),
  })
  if (!settingsResponse.ok) throw new Error(`Production settings failed: ${settingsResponse.status}`)
  const sourceFiles = await fetch('http://localhost:42077/api/source-files').then(response => response.json()) as { files: { name: string }[] }
  if (sourceFiles.files.length !== 1 || sourceFiles.files[0]?.name !== 'synthetic.wav') throw new Error('Production source listing failed')
  const forbidden = await fetch('http://localhost:42077/api/runs', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'Origin': 'https://untrusted.invalid' }, body: '{}',
  })
  if (forbidden.status !== 403) throw new Error('Production mutation guard failed')
  const forbiddenUpload = await fetch('http://localhost:42077/api/transcriptions/upload?name=test.wav', {
    method: 'POST', headers: { 'Content-Type': 'application/octet-stream', Origin: 'https://untrusted.invalid' }, body: 'synthetic',
  })
  if (forbiddenUpload.status !== 403) throw new Error('Production upload origin guard failed')
  child.kill('SIGTERM')
  await child.exited
  child = startServer()
  await waitForReady()
  const restarted = await fetch('http://localhost:42077/api/workspace').then(response => response.json()) as WorkspaceSnapshot
  if (restarted.preferences.copyWithSpeakers !== false || restarted.settings.sourceDirectory !== sourceDirectory) throw new Error('SQLite settings/preferences did not survive server restart')
  if (restarted.preferences.transcriptProcessing?.disableGrouping !== true || restarted.preferences.transcriptProcessing.disableGapBridging !== false) throw new Error('Processing switches did not survive SQLite restart')
  console.log('Production pages/APIs, SQLite restart persistence, source listing, launcher identity, isolated state and JSON/upload origin guards verified.')
}
finally {
  child.kill('SIGTERM')
  await child.exited
  await rm(root, { recursive: true, force: true })
}
