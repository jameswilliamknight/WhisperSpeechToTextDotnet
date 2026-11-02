import { afterEach, expect, test } from 'bun:test'
import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const directories: string[] = []
const managerPath = new URL('../../harness/runs/manager.ts', import.meta.url).href
const storePath = new URL('../../harness/runs/store.ts', import.meta.url).href
afterEach(async () => { await Promise.all(directories.splice(0).map(path => rm(path, { recursive: true, force: true }))) })

test('run speaker renames persist without altering benchmark result data', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'studio-speakers-')))
  directories.push(root)
  const worker = Bun.spawn([process.execPath, '-e', `
    import { strict as assert } from 'node:assert';
    import { saveRun, listRuns } from ${JSON.stringify(storePath)};
    import { updateRunSpeakerNames } from ${JSON.stringify(managerPath)};
    const result={segments:[{start:0,end:1,text:'Hi',speaker:'a'}],turns:[{start:0,end:1,speaker:'a'}],stages:{},metadata:{runtime:'test',models:[],backend:'test'},warnings:[]};
    const id=crypto.randomUUID();
    await saveRun({id, backend:'whisper', preset:'smoke', status:'succeeded', phase:'Complete', startedAt:new Date().toISOString(), result});
    assert.deepEqual(await updateRunSpeakerNames(id,{a:' Alice '}),{a:'Alice'});
    const run=(await listRuns())[0];
    assert.deepEqual(run.speakerNames,{a:'Alice'});assert.deepEqual(run.result,result);
    await assert.rejects(() => updateRunSpeakerNames(id,{nope:'Alice'}),/Unknown speaker/);
  `], { cwd: root, env: { ...process.env, STUDIO_ROOT: root }, stdout: 'pipe', stderr: 'pipe' })
  const [code, output, error] = await Promise.all([worker.exited, new Response(worker.stdout).text(), new Response(worker.stderr).text()])
  expect({ code, output: output + error }).toEqual({ code: 0, output: '' })
}, 30_000)
