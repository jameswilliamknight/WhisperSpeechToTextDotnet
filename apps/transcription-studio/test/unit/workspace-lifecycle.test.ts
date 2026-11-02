import { expect, test } from 'bun:test'
import { fixture, script, syntheticSetup, storeModule, lockModule } from './workspace-fixture'

test('cancellation waits for native cleanup and allows the next shared lease', async () => {
  const f = await fixture()
  try {
    expect(await script(f.root, `
      const workerBody='Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,30000);';${syntheticSetup}
      const started=await manager.startTranscription('synthetic.wav');
      while((await manager.transcriptionDetail(started.id)).phase!=='Transcribing and identifying speakers')await Bun.sleep(10);
      await manager.cancelTranscription(started.id);
      assert.equal((await manager.transcriptionDetail(started.id)).status,'cancelled');
      const release=await acquireRunLock();await release();
      await assert.rejects(lstat(join(root,'.local','worker-group.json')),/ENOENT/);
      assert.deepEqual(await readdir(settings.outputDirectory),[]);
    `)).toEqual({ code: 0, output: '' })
  }
  finally { await f.cleanup() }
}, 30_000)

test('failed and invalid workers never export transcripts; existing output files are never overwritten', async () => {
  const f = await fixture()
  try {
    expect(await script(f.root, `
      const workerBody='process.exit(2);';${syntheticSetup}
      const started=await manager.startTranscription('synthetic.wav');
      let detail;do{await Bun.sleep(10);detail=await manager.transcriptionDetail(started.id)}while(detail.status==='running');
      assert.equal(detail.status,'failed');assert.deepEqual(await readdir(settings.outputDirectory),[]);
      await writeFile(worker,'const fs=require("fs");fs.writeFileSync(process.argv[process.argv.indexOf("--output")+1],JSON.stringify({segments:[],turns:[],metadata:{runtime:"test",models:[],backend:"test"}}))');
      const invalid=await manager.startTranscription('synthetic.wav');
      do{await Bun.sleep(10);detail=await manager.transcriptionDetail(invalid.id)}while(detail.status==='running');
      assert.equal(detail.status,'failed');assert.match(detail.error,/transcription and speaker turns/);
      await writeFile(worker,'Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,300);require("fs").writeFileSync(process.argv[process.argv.indexOf("--output")+1],'+JSON.stringify(JSON.stringify(result))+')');
      const collision=await manager.startTranscription('synthetic.wav');
      const output=join(settings.outputDirectory,collision.id+'.txt');await writeFile(output,'existing',{flag:'wx'});
      do{await Bun.sleep(10);detail=await manager.transcriptionDetail(collision.id)}while(detail.status==='running');
      assert.equal(detail.status,'failed');assert.equal(await readFile(output,'utf8'),'existing');
    `)).toEqual({ code: 0, output: '' })
  }
  finally { await f.cleanup() }
}, 30_000)

test('original changes during processing fail integrity validation and suppress exports', async () => {
  const f = await fixture()
  try {
    expect(await script(f.root, `
      const workerBody='Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,500);';${syntheticSetup}
      const started=await manager.startTranscription('synthetic.wav');
      while((await manager.transcriptionDetail(started.id)).phase!=='Transcribing and identifying speakers')await Bun.sleep(10);
      await writeFile(join(source,'synthetic.wav'),'changed externally');
      let detail;do{await Bun.sleep(10);detail=await manager.transcriptionDetail(started.id)}while(detail.status==='running');
      assert.equal(detail.status,'failed');assert.match(detail.error,/integrity/);
      assert.deepEqual(await readdir(settings.outputDirectory),[]);
    `)).toEqual({ code: 0, output: '' })
  }
  finally { await f.cleanup() }
}, 30_000)

test('snapshot recovery never interrupts a live owner and recovers workspace jobs only after owner exits', async () => {
  const f = await fixture()
  const id = crypto.randomUUID()
  const owner = Bun.spawn([process.execPath, '-e', `
    import {acquireRunLock} from ${JSON.stringify(lockModule)};
    import * as store from ${JSON.stringify(storeModule)};
    await acquireRunLock();
    await store.saveJob({detail:{id:${JSON.stringify(id)},name:'fixture.wav',status:'running',phase:'Synthetic',startedAt:new Date().toISOString(),audioAvailable:false},settings:await store.settings(),directory:'unused',inputPath:'unused',audioPath:'unused'});
    console.log('READY');await new Response(Bun.stdin.stream()).text();
  `], { env: { ...process.env, STUDIO_ROOT: f.root }, stdin: 'pipe', stdout: 'pipe', stderr: 'pipe' })
  try {
    const reader = owner.stdout.getReader()
    expect(new TextDecoder().decode((await reader.read()).value)).toContain('READY')
    reader.releaseLock()
    expect(await script(f.root, `const snapshot=await manager.workspaceSnapshot();assert.equal(snapshot.jobs[0].status,'running');assert.equal(snapshot.activeJobId,${JSON.stringify(id)});`)).toEqual({ code: 0, output: '' })
    owner.stdin.end(); await owner.exited
    expect(await script(f.root, `const snapshot=await manager.workspaceSnapshot();assert.equal(snapshot.jobs[0].status,'interrupted');assert.equal(snapshot.activeJobId,null);`)).toEqual({ code: 0, output: '' })
  }
  finally { owner.kill(); await owner.exited; await f.cleanup() }
}, 30_000)
