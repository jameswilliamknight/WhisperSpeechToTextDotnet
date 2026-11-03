import { expect, test } from 'bun:test'
import { fixture, script, syntheticSetup } from './workspace-fixture'

const wait = `async function finished(id){let detail;do{await Bun.sleep(25);detail=await manager.transcriptionDetail(id)}while(detail.status==='running');return detail}`

test('retry copies the recorded source after Settings changes and preserves successful artifacts', async () => {
  const f = await fixture()
  try {
    expect(await script(f.root, `
      const workerBody=''; ${syntheticSetup} ${wait}
      const first=await manager.startTranscription('synthetic.wav');
      const original=await finished(first.id);assert.equal(original.status,'succeeded');
      const old=await store.job(first.id);const text=await readFile(original.outputPath,'utf8');
      const before=await lstat(join(source,'synthetic.wav'));
      const other=join(root,'..','other-source');await mkdir(other);await writeFile(join(other,'synthetic.wav'),'not the original audio');
      await manager.updateSettings({...settings,sourceDirectory:other});
      const second=await manager.retryTranscription(first.id);const retry=await finished(second.id);
      assert.equal(retry.status,'succeeded',retry.error);assert.notEqual(second.id,first.id);
      const copied=await store.job(second.id);
      assert.equal(copied.original.path,join(source,'synthetic.wav'));
      assert.deepEqual(await readFile(copied.inputPath),await readFile(old.inputPath));
      assert.notEqual(copied.inputPath,old.inputPath);assert.notEqual(retry.outputPath,original.outputPath);
      assert.equal(await readFile(original.outputPath,'utf8'),text);
      assert.deepEqual((await store.job(first.id)).detail.result,old.detail.result);
      assert.equal((await lstat(join(source,'synthetic.wav'))).mtimeMs,before.mtimeMs);
      const snapshot=await manager.workspaceSnapshot();assert.equal(snapshot.jobs.length,2);
      assert.equal(snapshot.jobs[0].recordingId,snapshot.jobs[1].recordingId);
      assert.equal(snapshot.jobs[0].hasTranscript,true);assert.equal(snapshot.jobs[0].retryAvailable,true);
      await unlink(join(source,'synthetic.wav'));
      assert.equal((await manager.workspaceSnapshot()).jobs[0].retryAvailable,false);
      await assert.rejects(manager.retryTranscription(second.id),/unavailable/);
    `)).toEqual({ code: 0, output: '' })
  }
  finally { await f.cleanup() }
}, 30_000)

test('failed retry keeps good result; cleanup removes only failures and repairs selection', async () => {
  const f = await fixture()
  try {
    expect(await script(f.root, `
      const workerBody=''; ${syntheticSetup} ${wait}
      const first=await manager.startTranscription('synthetic.wav');const good=await finished(first.id);
      const savedResult=JSON.stringify(good.result),text=await readFile(good.outputPath,'utf8');
      await writeFile(worker,'process.exit(7)');
      const second=await manager.retryTranscription(first.id);const failed=await finished(second.id);assert.equal(failed.status,'failed');
      await manager.updatePreferences({selectedJobId:second.id,copyWithSpeakers:false});
      assert.deepEqual(await store.removeFailedHistory(),{removed:1,retainedSuccessful:1});
      assert.equal((await store.preferences()).selectedJobId,first.id);assert.equal((await store.preferences()).copyWithSpeakers,false);
      assert.equal(JSON.stringify((await store.job(first.id)).detail.result),savedResult);
      assert.equal(await readFile(good.outputPath,'utf8'),text);assert.equal((await store.jobs()).length,1);
      assert.equal(await readFile(join(source,'synthetic.wav')).then(b=>b.length),wav.length);
    `)).toEqual({ code: 0, output: '' })
  }
  finally { await f.cleanup() }
}, 30_000)

test('identical uploaded bytes prompt before inference and retry uses a fresh retained-input copy', async () => {
  const f = await fixture()
  try {
    expect(await script(f.root, `
      const workerBody=''; ${syntheticSetup} ${wait}
      const first=await manager.startTranscription('uploaded.wav',Readable.from([wav]));assert.equal((await finished(first.id)).status,'succeeded');
      await assert.rejects(manager.startTranscription('uploaded.wav',Readable.from([wav])),error=>error.retryJobId===first.id);
      assert.equal((await store.jobs()).length,1);
      const second=await manager.retryTranscription(first.id);assert.equal((await finished(second.id)).status,'succeeded');
      const a=await store.job(first.id),b=await store.job(second.id);
      assert.equal(a.detail.recordingId,b.detail.recordingId);assert.notEqual(a.inputPath,b.inputPath);
      assert.deepEqual(await readFile(a.inputPath),await readFile(b.inputPath));
      const release=await acquireRunLock();await release();
    `)).toEqual({ code: 0, output: '' })
  }
  finally { await f.cleanup() }
}, 30_000)

test('completion and process reaping survive the requesting server process exiting', async () => {
  const f = await fixture()
  try {
    const start = await script(f.root, `
      const workerBody='Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,350);'; ${syntheticSetup}
      await manager.startTranscription('synthetic.wav');
      process.exit(0);
    `)
    expect(start).toEqual({ code: 0, output: '' })
    expect(await script(f.root, `
      const deadline=Date.now()+10000;let record;
      do{record=(await store.jobs())[0];if(record.detail.status!=='running')break;await Bun.sleep(25)}while(Date.now()<deadline);
      assert.equal(record.detail.status,'succeeded',record.detail.error);
      assert.equal(await readFile(record.detail.outputPath,'utf8'),'Synthetic fixture.\\n');
      const lease=await acquireRunLock();await lease();
    `)).toEqual({ code: 0, output: '' })
  }
  finally { await f.cleanup() }
}, 30_000)
