import { expect, test } from 'bun:test'
import { fixture, script, syntheticSetup } from './workspace-fixture'

const route = (path: string) => JSON.stringify(new URL(`../../server/${path}`, import.meta.url).href)

test('same-origin raw upload starts a persisted job; private WAV playback supports bounded byte ranges', async () => {
  const f = await fixture()
  try {
    expect(await script(f.root, `
      import {createApp, createRouter, toNodeListener} from 'h3';
      import {createServer} from 'node:http';
      import {once} from 'node:events';
      import localOnly from ${route('middleware/local-only.ts')};
      import upload from ${route('api/transcriptions/upload.post.ts')};
      import audio from ${route('api/transcriptions/[id]/audio.get.ts')};
      import detailRoute from ${route('api/transcriptions/[id].get.ts')};
      import speakersRoute from ${route('api/transcriptions/[id]/speakers.put.ts')};
      import startRoute from ${route('api/transcriptions.post.ts')};
      import snapshotRoute from ${route('api/workspace.get.ts')};
      const workerBody='';${syntheticSetup}
      const app=createApp();app.use(localOnly);
      const router=createRouter();router.post('/api/transcriptions/upload',upload);
      router.post('/api/transcriptions',startRoute);
      router.get('/api/transcriptions/:id/audio',audio);router.get('/api/transcriptions/:id',detailRoute);
      router.put('/api/transcriptions/:id/speakers',speakersRoute);
      router.get('/api/workspace',snapshotRoute);app.use(router);
      const server=createServer(toNodeListener(app));server.listen(0,'127.0.0.1');await once(server,'listening');
      const base='http://127.0.0.1:'+server.address().port;
      const headers={'origin':base,'content-type':'application/octet-stream'};
      try {
        assert.equal((await fetch(base+'/api/transcriptions/upload?name=synthetic.wav',{method:'POST',headers:{...headers,origin:'http://evil.invalid'},body:wav})).status,403);
        assert.equal((await fetch(base+'/api/transcriptions',{method:'POST',headers,body:wav})).status,403);
        assert.equal((await fetch(base+'/api/transcriptions/upload?name=synthetic.wav',{method:'POST',headers:{...headers,'content-type':'text/plain'},body:wav})).status,403);
        assert.equal((await fetch(base+'/api/transcriptions/upload?name=synthetic.wav',{method:'POST',headers:{...headers,'content-type':'application/json'},body:'{}'})).status,415);
        const response=await fetch(base+'/api/transcriptions/upload?name=uploaded.wav',{method:'POST',headers,body:wav});
        assert.equal(response.status,200);const started=await response.json();assert.equal(started.name,'uploaded.wav');
        let detail;do{await Bun.sleep(10);detail=await (await fetch(base+'/api/transcriptions/'+started.id)).json()}while(detail.status==='running');
        assert.equal(detail.status,'succeeded',detail.error);
        const speakerHeaders={'origin':base,'content-type':'application/json'};
        const renamed=await fetch(base+'/api/transcriptions/'+started.id+'/speakers',{method:'PUT',headers:speakerHeaders,body:JSON.stringify({speakerNames:{S1:'Alice'}})});
        assert.equal(renamed.status,200);assert.deepEqual(await renamed.json(),{S1:'Alice'});
        detail=await (await fetch(base+'/api/transcriptions/'+started.id)).json();assert.deepEqual(detail.speakerNames,{S1:'Alice'});
        const unknownSpeaker=await fetch(base+'/api/transcriptions/'+started.id+'/speakers',{method:'PUT',headers:speakerHeaders,body:JSON.stringify({speakerNames:{nope:'Alice'}})});
        assert.equal(unknownSpeaker.status,400);
        const url=base+'/api/transcriptions/'+started.id+'/audio?path=/etc/passwd';
        const full=await fetch(url);assert.equal(full.status,200);assert.equal(full.headers.get('accept-ranges'),'bytes');
        const bytes=Buffer.from(await full.arrayBuffer());assert.equal(bytes.subarray(0,4).toString(),'RIFF');
        const partial=await fetch(url,{headers:{range:'bytes=0-15'}});assert.equal(partial.status,206);
        assert.equal(partial.headers.get('content-range'),'bytes 0-15/'+bytes.length);assert.equal((await partial.arrayBuffer()).byteLength,16);
        const suffix=await fetch(url,{headers:{range:'bytes=-8'}});assert.equal(suffix.status,206);assert.equal((await suffix.arrayBuffer()).byteLength,8);
        assert.equal((await fetch(url,{headers:{range:'bytes=999999999-'}})).status,416);
        assert.equal((await fetch(url,{headers:{range:'bytes=0-2,4-6'}})).status,416);
        const snapshot=await (await fetch(base+'/api/workspace')).json();assert.equal(snapshot.jobs[0].result,undefined);
        assert.equal((await store.job(started.id)).original,undefined);
      }
      finally { server.closeAllConnections();await new Promise(resolve=>server.close(resolve)) }
    `)).toEqual({ code: 0, output: '' })
  }
  finally { await f.cleanup() }
}, 30_000)
