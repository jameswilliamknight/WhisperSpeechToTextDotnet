import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

export const workspaceModule = new URL('../../harness/workspace/manager.ts', import.meta.url).href
export const storeModule = new URL('../../harness/workspace/store.ts', import.meta.url).href
export const locationsModule = new URL('../../harness/workspace/locations.ts', import.meta.url).href
export const lockModule = new URL('../../harness/runs/store.ts', import.meta.url).href
export const inputModule = new URL('../../harness/workspace/input.ts', import.meta.url).href
export const progressModule = new URL('../../harness/workspace/progress.ts', import.meta.url).href

export async function fixture() {
  const parent = await realpath(await mkdtemp(join(tmpdir(), 'workspace-test-')))
  return { parent, root: join(parent, 'app'), cleanup: () => rm(parent, { recursive: true, force: true }) }
}

export async function script(root: string, body: string) {
  const prelude = `
    import { strict as assert } from 'node:assert';
    import { mkdir, writeFile, readFile, lstat, symlink, readdir, unlink, rename } from 'node:fs/promises';
    import { join } from 'node:path';
    import * as manager from ${JSON.stringify(workspaceModule)};
    import * as store from ${JSON.stringify(storeModule)};
    import * as locations from ${JSON.stringify(locationsModule)};
    import { acquireRunLock } from ${JSON.stringify(lockModule)};
    import { copySource, streamInput } from ${JSON.stringify(inputModule)};
    import * as progress from ${JSON.stringify(progressModule)};
    import { Readable } from 'node:stream';
    await mkdir(process.env.STUDIO_ROOT, {recursive:true});
    const root = process.env.STUDIO_ROOT;
  `
  const child = Bun.spawn([process.execPath, '-e', prelude + body], { env: { ...process.env, STUDIO_ROOT: root }, stdout: 'pipe', stderr: 'pipe' })
  const [code, output, error] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()])
  return { code, output: output + error }
}

export const syntheticSetup = `
  const source = join(root, '..', 'originals');
  await mkdir(source, {recursive:true});
  const wav = Buffer.alloc(32044); wav.write('RIFF'); wav.writeUInt32LE(32036,4); wav.write('WAVEfmt ',8);
  wav.writeUInt32LE(16,16); wav.writeUInt16LE(1,20); wav.writeUInt16LE(1,22); wav.writeUInt32LE(16000,24);
  wav.writeUInt32LE(32000,28); wav.writeUInt16LE(2,32); wav.writeUInt16LE(16,34); wav.write('data',36); wav.writeUInt32LE(32000,40);
  await writeFile(join(source,'synthetic.wav'),wav,{mode:0o640});
  const settings = {...await store.settings(), sourceDirectory:source};
  await manager.updateSettings(settings);
  const result = {segments:[{start:0,end:0.5,text:'Synthetic',speaker:'S1'},{start:0.5,end:1,text:'fixture.',speaker:'S1'}],turns:[{start:0,end:1,speaker:'S1'}],stages:{},metadata:{runtime:'test',models:[],backend:'synthetic'},warnings:[]};
  const worker = join(root,'.local','synthetic-worker.js');
  await writeFile(worker, 'const fs=require("fs");const output=process.argv[process.argv.indexOf("--output")+1];'+workerBody+'fs.writeFileSync(output,'+JSON.stringify(JSON.stringify(result))+');');
  await writeFile(join(root,'.local','adapters.json'),JSON.stringify({whisper:{command:[process.execPath,worker],cwd:root}}),{mode:0o600});
`
