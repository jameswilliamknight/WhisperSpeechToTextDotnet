import { assertRunOwner, releaseRunLock } from '~~/harness/runs/store'
import { executeJob } from '~~/harness/workspace/execute'
import { job } from '~~/harness/workspace/store'

/** Separate from Nitro/HMR. Never print transcript-bearing diagnostics. */
async function main() {
  process.umask(0o077)
  const token = process.env.STUDIO_RUN_TOKEN
  if (!token) throw new Error('Missing coordinator ownership')
  let gate = ''
  for await (const chunk of process.stdin) {
    gate += String(chunk)
    if (gate.length > 16) throw new Error('Invalid coordinator gate')
  }
  if (gate !== 'GO\n') throw new Error('Coordinator gate closed')
  await assertRunOwner(token)
  const record = await job(process.argv[2] ?? '')
  if (record.detail.status !== 'running') throw new Error('Job is not running')
  const controller = new AbortController()
  process.once('SIGTERM', () => controller.abort())
  process.once('SIGINT', () => controller.abort())
  process.stdout.write('READY\n')
  await executeJob(record, controller)
  // Persistence failures do not release admission; stale-owner recovery still
  // checks the native process-group fence before admitting any replacement.
  await releaseRunLock(token)
}

main().catch(() => {
  console.error('Job coordinator failed; private state and worker admission require review.')
  process.exitCode = 1
})
