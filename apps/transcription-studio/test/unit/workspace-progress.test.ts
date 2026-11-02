import { expect, test } from 'bun:test'
import { fixture, script } from './workspace-fixture'

test('workspace metadata exposes validated live progress without transcript content', async () => {
  const f = await fixture()
  try {
    expect(await script(f.root, `
      const release=await acquireRunLock();
      try {
        const id=crypto.randomUUID(),directory=join(root,'.local','work',id);await mkdir(directory,{recursive:true});
        const record={detail:{id,name:'synthetic.wav',status:'running',phase:'Transcribing and identifying speakers',startedAt:new Date().toISOString(),audioAvailable:false},
          settings:await store.settings(),directory,inputPath:join(directory,'source.wav'),audioPath:join(directory,'input.wav')};
        await store.saveJob(record);
        const progressPath=join(directory,'progress.json');
        await writeFile(progressPath,JSON.stringify({stage:'Transcribing audio',percent:42,updatedAt:new Date().toISOString()}));
        const snapshot=await manager.workspaceSnapshot();
        assert.equal(snapshot.activeJobId,id);assert.equal(snapshot.jobs[0].progress.percent,42);assert.equal(snapshot.jobs[0].result,undefined);
        const detail=await manager.transcriptionDetail(id);assert.equal(detail.progress.stage,'Transcribing audio');
        await writeFile(progressPath,JSON.stringify({stage:'Untrusted',percent:101,updatedAt:'x'}));
        assert.equal(await progress.jobProgress(record),undefined);
        await symlink(progressPath,join(directory,'progress-link.json'));
        await unlink(progressPath);await rename(join(directory,'progress-link.json'),progressPath);
        assert.equal(await progress.jobProgress(record),undefined);
      } finally { await release() }
    `)).toEqual({ code: 0, output: '' })
  }
  finally { await f.cleanup() }
}, 30_000)
