import { expect, test } from 'bun:test'
import { fixture, script, syntheticSetup } from './workspace-fixture'

test('settings/preferences persist across processes, source is opt-in, database is private', async () => {
  const f = await fixture()
  try {
    expect(await script(f.root, `
      assert.equal((await store.settings()).sourceDirectory,'');
      assert.deepEqual(await locations.sourceFiles(await store.settings()),[]);
      await manager.updatePreferences({selectedJobId:null,copyWithSpeakers:false});
      await manager.updateSettings(await store.settings());
      const defaults=await store.settings();
      const quoted=await manager.updateSettings({...defaults,workingDirectory:'  "'+defaults.workingDirectory+'"  '});
      assert.equal(quoted.workingDirectory,defaults.workingDirectory);
      assert.equal((await lstat(join(root,'.local/workspace.sqlite'))).mode & 0o777,0o600);
      assert.equal((await lstat(join(root,'.local'))).mode & 0o777,0o700);
    `)).toEqual({ code: 0, output: '' })
    expect(await script(f.root, `assert.equal((await store.preferences()).copyWithSpeakers,false);assert.equal((await store.settings()).sourceDirectory,'');`)).toEqual({ code: 0, output: '' })
  }
  finally { await f.cleanup() }
})

test('rejects unsafe locations, overlaps, unsupported/traversal names and symlinked source files', async () => {
  const f = await fixture()
  try {
    expect(await script(f.root, `
      const settings = await store.settings();
      for (const path of ['relative','/',root,join(root,'tracked')]) await assert.rejects(locations.validateSettings({...settings,workingDirectory:path}));
      await assert.rejects(locations.validateSettings({...settings,sourceDirectory:root}));
      const source = join(root,'..','originals');await mkdir(source);
      await symlink(source,join(root,'link'));
      await assert.rejects(locations.validateSettings({...settings,sourceDirectory:join(root,'link')}));
      for (const name of ['../test.wav','a/b.mp3','a\\\\b.wav','no.txt','bad\\n.wav']) assert.throws(()=>locations.sourceName(name));
      await writeFile(join(source,'valid.wav'),'synthetic');await writeFile(join(source,'ignored.txt'),'synthetic');
      await symlink(join(source,'valid.wav'),join(source,'linked.wav'));
      assert.deepEqual((await locations.sourceFiles({...settings,sourceDirectory:source})).map(f=>f.name),['valid.wav']);
      const external = {...settings,workingDirectory:join(root,'..','user-work'),outputDirectory:join(root,'..','user-out')};
      assert.deepEqual(await locations.validateSettings(external),external);
    `)).toEqual({ code: 0, output: '' })
  }
  finally { await f.cleanup() }
})

test('exclusive private input copy never modifies original and uploads reject empty/oversize streams', async () => {
  const f = await fixture()
  try {
    expect(await script(f.root, `
      const source=join(root,'..','original.wav'); await writeFile(source,'synthetic',{mode:0o640});
      const before=await lstat(source);const record={inputPath:join(root,'copy.wav')};
      await copySource(record,source);assert.equal(await readFile(record.inputPath,'utf8'),'synthetic');
      assert.equal((await lstat(source)).mode,before.mode);assert.equal((await lstat(source)).mtimeMs,before.mtimeMs);
      await assert.rejects(copySource(record,source));
      await assert.rejects(streamInput(join(root,'empty.wav'),Readable.from([])),/empty/);
      await assert.rejects(streamInput(join(root,'large.wav'),Readable.from(['123','456']),undefined,undefined,5),/size limit/);
    `)).toEqual({ code: 0, output: '' })
  }
  finally { await f.cleanup() }
}, 30_000)

test('case aliases of existing ancestors cannot place work or output inside the actual source tree', async () => {
  const f = await fixture()
  try {
    expect(await script(f.root, `
      const actual=join(root,'..','originals');await mkdir(actual,{recursive:true});
      await writeFile(join(actual,'keep.wav'),'synthetic',{mode:0o640});
      const upper=join(root,'..','ORIGINALS');
      let caseAliases=false;try{caseAliases=(await lstat(upper)).ino===(await lstat(actual)).ino}catch{}
      const source=caseAliases?upper:actual;
      const settings={...await store.settings(),sourceDirectory:source};
      for(const role of ['workingDirectory','outputDirectory']){
        for(const base of caseAliases?[actual,upper]:[actual]){
          await assert.rejects(manager.updateSettings({...settings,[role]:join(base,'missing','nested')}),/separate/);
        }
        await assert.rejects(lstat(join(actual,'missing')),/ENOENT/);
      }
      const saved=await manager.updateSettings(settings);
      assert.equal(saved.sourceDirectory,actual);
      assert.deepEqual(await readdir(actual),['keep.wav']);assert.equal(await readFile(join(actual,'keep.wav'),'utf8'),'synthetic');
      assert.equal((await lstat(join(actual,'keep.wav'))).mode&0o777,0o640);
    `)).toEqual({ code: 0, output: '' })
  }
  finally { await f.cleanup() }
})

test('synthetic worker exports grouped text, preserves originals and captures per-job locations', async () => {
  const f = await fixture()
  try {
    expect(await script(f.root, `
      const workerBody=''; ${syntheticSetup}
      assert.equal((await manager.engineReadiness()).available,true);
      const before=await lstat(join(source,'synthetic.wav'));
      const started=await manager.startTranscription('synthetic.wav');
      await assert.rejects(manager.updateSettings(settings),/already running/);
      await assert.rejects(acquireRunLock(),/already running/);
      let detail;do{await Bun.sleep(25);detail=await manager.transcriptionDetail(started.id)}while(detail.status==='running');
      assert.equal(detail.status,'succeeded',detail.error);
      assert.equal(await readFile(detail.outputPath,'utf8'),'Synthetic fixture.\\n');
      assert.equal(await readFile(detail.outputPath.replace('.txt','.speakers.txt'),'utf8'),'Speaker 1: Synthetic fixture.\\n');
      assert.equal((await lstat(join(source,'synthetic.wav'))).mtimeMs,before.mtimeMs);
      assert.equal((await lstat(join(source,'synthetic.wav'))).mode,before.mode);
      const path=await manager.audioFile(started.id);assert.equal((await lstat(path)).mode&0o777,0o400);
      const changed={...settings,workingDirectory:join(root,'.local','different-work'),outputDirectory:join(root,'.local','different-out')};
      await manager.updateSettings(changed);assert.equal(await manager.audioFile(started.id),path);
      const snapshot=await manager.workspaceSnapshot();assert.equal(snapshot.jobs[0].result,undefined);assert.equal(snapshot.activeJobId,null);
      assert.equal((await store.jobs()).length,1);
    `)).toEqual({ code: 0, output: '' })
    expect(await script(f.root, `const snapshot=await manager.workspaceSnapshot();assert.equal(snapshot.jobs.length,1);assert.equal(snapshot.jobs[0].status,'succeeded');`)).toEqual({ code: 0, output: '' })
  }
  finally { await f.cleanup() }
}, 30_000)
