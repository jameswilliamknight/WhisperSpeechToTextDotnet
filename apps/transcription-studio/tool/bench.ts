import { prepareSource, verifySource } from '../harness/source/source'
import { cancelRun, startRun, studioSnapshot, waitForRun } from '../harness/runs/manager'
import type { BackendId, RunPreset } from '../shared/studio'

const [command, backend, preset = 'smoke'] = process.argv.slice(2)
if (command === 'prepare') {
  const source = await prepareSource()
  console.log(JSON.stringify(source, null, 2))
}
else if (command === 'verify') {
  await verifySource()
  console.log('Source and private copy integrity verified.')
}
else if (command === 'status') {
  const snapshot = await studioSnapshot()
  // Never print transcript contents to terminals or agent logs.
  console.log(JSON.stringify({ ...snapshot, runs: snapshot.runs.map(({ result, ...run }) => ({ ...run, segments: result?.segments.length, speakers: new Set(result?.turns.map(turn => turn.speaker)).size })) }, null, 2))
}
else if (command === 'run' && ['fluidaudio', 'nemo', 'whisper'].includes(backend || '') && ['smoke', 'full'].includes(preset)) {
  const run = await startRun(backend as BackendId, preset as RunPreset)
  const stop = () => { void cancelRun(run.id) }
  process.once('SIGINT', stop)
  console.log(`Started ${run.id}: ${backend}/${preset}`)
  const complete = await waitForRun(run.id)
  process.removeListener('SIGINT', stop)
  if (!complete) throw new Error('Missing completed run')
  const { result, ...summary } = complete
  console.log(JSON.stringify({ ...summary, segments: result?.segments.length, speakers: new Set(result?.turns.map(turn => turn.speaker)).size }, null, 2))
  if (complete.status !== 'succeeded') process.exitCode = 1
}
else {
  console.error('Usage: bun run bench prepare|verify|status|run <fluidaudio|nemo|whisper> [smoke|full]')
  process.exitCode = 1
}
