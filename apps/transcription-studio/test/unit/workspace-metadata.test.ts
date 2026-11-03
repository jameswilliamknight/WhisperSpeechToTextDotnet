import { expect, test } from 'bun:test'
import { fixture, script } from './workspace-fixture'

const setup = `
  import { Database } from 'bun:sqlite';
  import { chmod } from 'node:fs/promises';
  const settings=await store.settings();
  await mkdir(settings.outputDirectory,{recursive:true});
  const id='11111111-1111-4111-8111-111111111111';
  const result={segments:[{start:0,end:1,text:'Synthetic.',speaker:'S1'}],turns:[{start:0,end:1,speaker:'S1'}],stages:{},metadata:{runtime:'test',models:[],backend:'synthetic'},warnings:[]};
  const record={settings,directory:join(root,'.local/work',id),inputPath:'unchanged-input',audioPath:'unchanged-audio',detail:{id,name:'test.wav',status:'succeeded',phase:'Complete',startedAt:'2026-01-01',result,speakerNames:{S1:'Legacy'}}};
  const db=new Database(join(root,'.local/workspace.sqlite'));
  const raw=()=>JSON.parse(db.query('SELECT value FROM jobs WHERE id=?').get(id).value);
  const seed=()=>db.query('INSERT OR REPLACE INTO jobs (id,value) VALUES (?,?)').run(id,JSON.stringify(record));
  const sidecar=join(settings.outputDirectory,id+'.metadata.json');
  const labelled=join(settings.outputDirectory,id+'.speakers.txt');
  seed();
`

test('migration is durable across restart, idempotent and never restored by stale saves', async () => {
  const f = await fixture()
  try {
    expect(await script(f.root, setup + `
      const report=await store.migrateSpeakerMetadata();assert.equal(report.migrated,1);assert.deepEqual(report.failed,[]);
      assert.equal(raw().detail.speakerNames,undefined);
      assert.equal((await lstat(sidecar)).mode&0o777,0o600);
      assert.equal(await readFile(labelled,'utf8'),'Legacy: Synthetic.\\n');
      assert.equal((await store.migrateSpeakerMetadata()).migrated,0);
      await store.saveJob(record);assert.equal(raw().detail.speakerNames,undefined);
      assert.deepEqual((await store.job(id)).detail.speakerNames,{S1:'Legacy'});
      assert.deepEqual(raw().detail.result,result);assert.equal(raw().audioPath,'unchanged-audio');
      db.close();
    `)).toEqual({ code: 0, output: '' })
    expect(await script(f.root, `
      const jobs=await store.jobs();assert.deepEqual(jobs[0].detail.speakerNames,{S1:'Legacy'});
      const report=await store.migrateSpeakerMetadata();assert.equal(report.migrated,0);assert.deepEqual(report.failed,[]);
    `)).toEqual({ code: 0, output: '' })
  }
  finally { await f.cleanup() }
})

test('existing sidecar wins, rename refreshes missing legacy export in recorded directory, stale finalization cannot restore names', async () => {
  const f = await fixture()
  try {
    expect(await script(f.root, setup + `
      await writeFile(sidecar,JSON.stringify({version:1,id,speakerNames:{S1:'Portable'}}));
      await store.saveSettings({...settings,outputDirectory:join(root,'.local/other')});
      assert.deepEqual((await store.job(id)).detail.speakerNames,{S1:'Portable'});
      assert.equal(raw().detail.speakerNames,undefined);
      await unlink(labelled);
      await manager.updateSpeakerNames(id,{S1:' Updated '});
      assert.equal(await readFile(labelled,'utf8'),'Updated: Synthetic.\\n');
      assert.deepEqual(JSON.parse(await readFile(sidecar,'utf8')).speakerNames,{S1:'Updated'});
      await store.saveJob(record);
      assert.equal(await store.commitSucceeded(record,new AbortController().signal),true);
      assert.equal(raw().detail.speakerNames,undefined);
      assert.deepEqual((await store.job(id)).detail.speakerNames,{S1:'Updated'});
      await Promise.all([manager.updateSpeakerNames(id,{S1:'First'}),store.saveJob(record),manager.updateSpeakerNames(id,{S1:'Last'})]);
      const names=(await store.job(id)).detail.speakerNames;
      assert.equal(await readFile(labelled,'utf8'),names.S1+': Synthetic.\\n');
      assert.equal(raw().detail.speakerNames,undefined);db.close();
    `)).toEqual({ code: 0, output: '' })
  }
  finally { await f.cleanup() }
})

for (const failure of ['corrupt', 'symlink', 'missing-directory', 'unwritable', 'export-symlink', 'directory-symlink', 'nonregular']) {
  test(`migration retains legacy names on ${failure} and retries safely`, async () => {
    const f = await fixture()
    try {
      expect(await script(f.root, setup + `
        const failure=${JSON.stringify(failure)};
        const outside=join(root,'outside');await writeFile(outside,'untouched');
        if(failure==='corrupt')await writeFile(sidecar,'{invalid');
        if(failure==='symlink')await symlink(outside,sidecar);
        if(failure==='export-symlink')await symlink(outside,labelled);
        if(failure==='missing-directory')await rename(settings.outputDirectory,settings.outputDirectory+'.offline');
        if(failure==='directory-symlink'){await rename(settings.outputDirectory,settings.outputDirectory+'.offline');await symlink(settings.outputDirectory+'.offline',settings.outputDirectory);}
        if(failure==='nonregular')await mkdir(sidecar);
        if(failure==='unwritable')await chmod(settings.outputDirectory,0o500);
        let report=await store.migrateSpeakerMetadata();
        assert.deepEqual(report.failed,[id]);assert.equal(report.migrated,0);
        assert.deepEqual(raw().detail.speakerNames,{S1:'Legacy'});
        await store.saveJob({...record,detail:{...record.detail,speakerNames:{S1:'Stale'}}});
        assert.deepEqual(raw().detail.speakerNames,{S1:'Legacy'});
        await assert.rejects(manager.updateSpeakerNames(id,{S1:'New'}));
        assert.equal(await readFile(outside,'utf8'),'untouched');
        if(failure==='corrupt'||failure==='symlink')await unlink(sidecar);
        if(failure==='export-symlink')await unlink(labelled);
        if(failure==='missing-directory')await rename(settings.outputDirectory+'.offline',settings.outputDirectory);
        if(failure==='directory-symlink'){await unlink(settings.outputDirectory);await rename(settings.outputDirectory+'.offline',settings.outputDirectory);}
        if(failure==='nonregular'){const {rmdir}=await import('node:fs/promises');await rmdir(sidecar);}
        if(failure==='unwritable')await chmod(settings.outputDirectory,0o700);
        report=await store.migrateSpeakerMetadata();assert.deepEqual(report.failed,[]);assert.equal(report.migrated,1);
        assert.equal(raw().detail.speakerNames,undefined);
        assert.deepEqual((await store.job(id)).detail.speakerNames,{S1:'Legacy'});
        db.close();
      `)).toEqual({ code: 0, output: '' })
    }
    finally { await f.cleanup() }
  })
}

test('absent sidecar initializes empty mapping; corrupt portable metadata never silently resets', async () => {
  const f = await fixture()
  try {
    expect(await script(f.root, setup + `
      delete record.detail.speakerNames;seed();
      assert.deepEqual((await store.job(id)).detail.speakerNames,{});
      await writeFile(sidecar,'{broken');
      await assert.rejects(store.job(id));await assert.rejects(manager.updateSpeakerNames(id,{S1:'New'}));
      assert.equal(raw().detail.speakerNames,undefined);db.close();
    `)).toEqual({ code: 0, output: '' })
  }
  finally { await f.cleanup() }
})
