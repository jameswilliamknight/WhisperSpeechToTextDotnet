import { expect, test } from 'bun:test'
import { fixture, script } from './workspace-fixture'

const finalizer = new URL('../../harness/workspace/finalize.ts', import.meta.url).href
const integrity = new URL('../../harness/source/integrity.ts', import.meta.url).href
const setup = `
  import {finalizeTranscript} from ${JSON.stringify(finalizer)};
  import {fingerprint} from ${JSON.stringify(integrity)};
  import {rename, unlink} from 'node:fs/promises';
  const settings=await store.settings();await mkdir(settings.outputDirectory,{recursive:true});
  const original=join(root,'..','synthetic.wav');await writeFile(original,'synthetic original',{mode:0o640});
  const before=await fingerprint(original);
  const record={detail:{id:crypto.randomUUID(),name:'synthetic.wav',status:'running',phase:'Finalizing',startedAt:new Date().toISOString(),audioAvailable:false,
    result:{segments:[{start:0,end:1,text:'Synthetic.',speaker:'id'}],turns:[{start:0,end:1,speaker:'id'}],stages:{},metadata:{runtime:'test',models:[],backend:'test'},warnings:[]}},
    settings,directory:root,inputPath:'unused',audioPath:'unused',original:{path:original,fingerprint:before}};
  await store.saveJob(record);const controller=new AbortController();
`

test('a source mutation during export rolls back both exclusive outputs and clears outputPath', async () => {
  const f = await fixture()
  try {
    expect(await script(f.root, setup + `
      let exported=0;
      await assert.rejects(finalizeTranscript(record,controller,performance.now(),{afterExport:async(path,index)=>{
        exported++;if(index===1)await writeFile(original,'changed externally');
      }}),/integrity/);
      assert.equal(exported,2);assert.deepEqual(await readdir(settings.outputDirectory),[]);
      assert.equal(record.detail.outputPath,undefined);assert.notEqual((await store.job(record.detail.id)).detail.status,'succeeded');
      assert.equal((await lstat(original)).mode,before.mode);
    `)).toEqual({ code: 0, output: '' })
  }
  finally { await f.cleanup() }
})

test('local cancellation after either export rolls back outputs without modifying original', async () => {
  const f = await fixture()
  try {
    expect(await script(f.root, setup + `
      for(const cancelAfter of [0,1]){
        const controller=new AbortController();
        await assert.rejects(finalizeTranscript(record,controller,performance.now(),{afterExport:async(path,index)=>{if(index===cancelAfter)controller.abort()}}));
        assert.deepEqual(await readdir(settings.outputDirectory),[]);assert.equal(record.detail.outputPath,undefined);
        assert.deepEqual(await fingerprint(original),before);
        assert.notEqual((await store.job(record.detail.id)).detail.status,'succeeded');
      }
    `)).toEqual({ code: 0, output: '' })
  }
  finally { await f.cleanup() }
})

test('durable cancellation wins final SQLite commit even without the periodic cancellation poll', async () => {
  const f = await fixture()
  try {
    expect(await script(f.root, setup + `
      let acknowledged=false;
      await assert.rejects(finalizeTranscript(record,controller,performance.now(),{beforeCommit:async()=>{
        acknowledged=await store.requestCancel(record.detail.id);
      }}));
      assert.equal(acknowledged,true);assert.equal(controller.signal.aborted,true);
      assert.deepEqual(await readdir(settings.outputDirectory),[]);assert.equal(record.detail.outputPath,undefined);
      assert.equal((await store.job(record.detail.id)).detail.status,'running');
      // Also cover the atomic store guard itself, independent of the finalizer's earlier checkpoint.
      record.detail.status='succeeded';
      assert.equal(await store.commitSucceeded(record,new AbortController().signal),false);
      assert.notEqual((await store.job(record.detail.id)).detail.status,'succeeded');
    `)).toEqual({ code: 0, output: '' })
  }
  finally { await f.cleanup() }
})

test('rollback preserves replacement inodes and pre-existing collisions', async () => {
  const f = await fixture()
  try {
    expect(await script(f.root, setup + `
      const plain=join(settings.outputDirectory,record.detail.id+'.txt');
      const labelled=join(settings.outputDirectory,record.detail.id+'.speakers.txt');
      await writeFile(labelled,'existing',{flag:'wx'});
      await assert.rejects(finalizeTranscript(record,controller,performance.now()));
      assert.equal(await readFile(labelled,'utf8'),'existing');await assert.rejects(lstat(plain),/ENOENT/);
      await unlink(labelled);
      await assert.rejects(finalizeTranscript(record,controller,performance.now(),{afterExport:async(path,index)=>{
        if(index!==0)return;
        // Keep the original inode allocated so replacement inode identity cannot be reused by the filesystem.
        await rename(path,path+'.moved');await writeFile(path,'replacement',{flag:'wx'});controller.abort();
      }}));
      assert.equal(await readFile(plain,'utf8'),'replacement');assert.equal(record.detail.outputPath,undefined);
      assert.deepEqual(await fingerprint(original),before);
    `)).toEqual({ code: 0, output: '' })
  }
  finally { await f.cleanup() }
})

test('successful completion commits exports and makes a later cancellation unacknowledged', async () => {
  const f = await fixture()
  try {
    expect(await script(f.root, setup + `
      await finalizeTranscript(record,controller,performance.now());
      assert.equal((await store.job(record.detail.id)).detail.status,'succeeded');
      assert.equal(await store.requestCancel(record.detail.id),false);
      assert.equal(await readFile(record.detail.outputPath,'utf8'),'Synthetic.\\n');
      assert.deepEqual(await fingerprint(original),before);
    `)).toEqual({ code: 0, output: '' })
  }
  finally { await f.cleanup() }
})
