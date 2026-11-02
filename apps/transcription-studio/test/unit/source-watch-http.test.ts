import { expect, test } from 'bun:test'
import { fixture, script } from './workspace-fixture'

const route = JSON.stringify(new URL('../../server/api/source-files/watch.get.ts', import.meta.url).href)

test('SSE sends initial and filesystem invalidations and reconnects with a fresh initial event', async () => {
  const f = await fixture()
  try {
    expect(await script(f.root, `
      import {createApp, toNodeListener} from 'h3';
      import {createServer} from 'node:http';
      import {once} from 'node:events';
      import watchRoute from ${route};
      const source=join(root,'..','source'); await mkdir(source);
      await store.saveSettings({...await store.settings(),sourceDirectory:source});
      const app=createApp();app.use('/api/source-files/watch',watchRoute);
      const server=createServer(toNodeListener(app));server.listen(0,'127.0.0.1');await once(server,'listening');
      const url='http://127.0.0.1:'+server.address().port+'/api/source-files/watch';
      const controller=new AbortController();
      const timeout=setTimeout(()=>controller.abort(),5000);
      try {
        const response=await fetch(url,{signal:controller.signal});
        assert.equal(response.status,200);
        assert.match(response.headers.get('content-type'),/text\\/event-stream/);
        const reader=response.body.getReader();
        const first=new TextDecoder().decode((await reader.read()).value);
        assert.match(first,/event: source-change/);assert.match(first,/{"type":"change"}/);
        await writeFile(join(source,'added.wav'),'audio');
        assert.match(new TextDecoder().decode((await reader.read()).value),/event: source-change/);
        await reader.cancel();
        const reconnect=await fetch(url,{signal:controller.signal});
        const next=reconnect.body.getReader();
        assert.match(new TextDecoder().decode((await next.read()).value),/event: source-change/);
        await next.cancel();
      }
      finally {clearTimeout(timeout);controller.abort();server.closeAllConnections();await new Promise(resolve=>server.close(resolve))}
    `)).toEqual({ code: 0, output: '' })
  }
  finally { await f.cleanup() }
}, 10_000)
