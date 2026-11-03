import { Database } from 'bun:sqlite'
import { strict as assert } from 'node:assert'
import { join } from 'node:path'
import { privateRoot } from '~~/harness/paths'
import { backupWorkspace } from '~~/harness/workspace/maintenance'
import { acquireRunLock } from '~~/harness/runs/store'
import { jobs, removeFailedHistory } from '~~/harness/workspace/store'

const release = await acquireRunLock()
try {
  const records = await jobs()
  if (records.some(record => record.detail.status === 'running')) throw new Error('Stop active jobs before cleaning history')
  const backup = await backupWorkspace('before-failed-history')
  const db = new Database(join(privateRoot, 'workspace.sqlite'), { readonly: true })
  let successful: { id: string; value: string }[]
  try {
    successful = db.query<{ id: string; value: string }, []>('SELECT id,value FROM jobs').all().filter(row => JSON.parse(row.value).detail.status === 'succeeded')
  }
  finally { db.close() }
  const report = await removeFailedHistory()
  const after = new Database(join(privateRoot, 'workspace.sqlite'), { readonly: true })
  try {
    for (const row of successful) assert.equal(after.query<{ value: string }, [string]>('SELECT value FROM jobs WHERE id = ?').get(row.id)?.value, row.value, 'Successful job was modified')
  }
  finally { after.close() }
  // Only counts/path are printed: the backup itself contains confidential data.
  console.log(JSON.stringify({ ...report, successfulRecordsUnchanged: true, backup }))
}
finally { await release() }
