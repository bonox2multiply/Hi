import vm from 'node:vm';
import test from 'node:test';import assert from 'node:assert/strict';
const fresh=async suffix=>(await import('../dist/server/index.js?'+suffix)).default;
test('all offline shell assets are served with correct content types; APIs are not service-worker cached',async()=>{const w=await fresh('assets');for(const [p,t] of [['/','text/html'],['/styles.css','text/css'],['/app.js','text/javascript'],['/model.js','text/javascript'],['/manifest.webmanifest','application/manifest+json'],['/icon.svg','image/svg+xml'],['/sw.js','text/javascript']]){const r=await w.fetch(new Request('https://example.com'+p));assert.equal(r.status,200);assert.ok(r.headers.get('Content-Type').startsWith(t));assert.ok((await r.text()).length>0)}const head=await w.fetch(new Request('https://example.com/styles.css',{method:'HEAD'}));assert.equal(await head.text(),'');const sw=await (await w.fetch(new Request('https://example.com/sw.js'))).text();assert.match(sw,/pathname.startsWith\('\/api\/'\)/);});
test('simultaneous game requests share one upstream call and return correct 30-day metadata',async()=>{const original=globalThis.fetch;let count=0,release;const gate=new Promise(r=>release=r);globalThis.fetch=async()=>{count++;await gate;return Response.json({success:true,result:{games:[],gameTotalCount:0}})};try{const w=await fresh('coalesce');const a=w.fetch(new Request('https://example.com/api/games?days=30')),b=w.fetch(new Request('https://example.com/api/games?days=30'));await new Promise(r=>setTimeout(r,0));release();const data=await Promise.all([a,b].map(async p=>(await p).json()));assert.equal(count,1);assert.equal(data[0].windowDays,30);assert.equal(data[1].stale,false)}finally{globalThis.fetch=original}});
test('last good edge cache survives fresh worker instance and is marked stale on outage',async()=>{const originalFetch=globalThis.fetch,originalCaches=globalThis.caches;const cache=new Map();const old={today:'2026-01-01',from:'2025-12-25',to:'2026-01-08',windowDays:7,games:[],fetchedAt:'2026-01-01T00:00:00Z',stale:false};cache.set('https://example.com/__internal-cache/games-7',Response.json(old));globalThis.caches={default:{match:async r=>cache.get(r.url)?.clone()}};globalThis.fetch=async()=>{throw Error('offline')};try{const w=await fresh('edgecache');const d=await(await w.fetch(new Request('https://example.com/api/games'))).json();assert.equal(d.stale,true);assert.equal(d.fetchedAt,old.fetchedAt);assert.notEqual(d.today,old.today)}finally{globalThis.fetch=originalFetch;globalThis.caches=originalCaches}});
test('relay endpoint rejects invalid and non-KIA identifiers before fetching',async()=>{const w=await fresh('invalid');for(const id of ['20261012LGKT02026','not-an-id','../../secrets']){const r=await w.fetch(new Request('https://example.com/api/relay?gameId='+encodeURIComponent(id)));assert.equal(r.status,400)}const r=await w.fetch(new Request('https://example.com/api/games',{method:'POST'}));assert.equal(r.status,405)});

test('news outage returns dated cached headlines marked stale, never a fabricated live feed',async()=>{const original=globalThis.fetch;globalThis.fetch=async()=>{throw Error('offline')};try{const w=await fresh('news-outage');const r=await w.fetch(new Request('https://example.com/api/news'));const d=await r.json();assert.equal(r.status,200);assert.equal(d.stale,true);assert.ok(d.fetchedAt);assert.ok(Array.isArray(d.articles));assert.ok(d.articles.every(a=>a.url.startsWith('https://')))}finally{globalThis.fetch=original}});

test('client and offline shell asset URLs receive current-version caching', async () => {
 const w = await fresh('version-cache');
 const origin = 'https://example.com';
 const html = await (await w.fetch(new Request(origin))).text();
 const clientPaths = [...html.matchAll(/(?:src|href)="([^"\s]+)"/g)]
  .map(m => m[1]).filter(path => path.startsWith('/') && path.includes('?v='));
 const app = await (await w.fetch(new Request(origin + '/app.js'))).text();
 clientPaths.push(...[...app.matchAll(/from ['"]([^'"]+)['"]/g)]
  .map(m => m[1]).filter(path => path.includes('?v=')));
 const sw = await (await w.fetch(new Request(origin + '/sw.js'))).text();
 const context = {self: {addEventListener() {}}};
 vm.runInNewContext(sw + '\nglobalThis.shell = SHELL; globalThis.cacheName = CACHE;', context);
 assert.ok(clientPaths.length > 0);
 const versions = new Set(clientPaths.map(path => new URL(path, origin).searchParams.get('v')));
 assert.equal(versions.size, 1, 'all versioned client assets must agree');
 const version = [...versions][0];
 assert.ok(context.cacheName.endsWith('-v' + version));
 for (const path of context.shell) {
  const shellVersion = new URL(path, origin).searchParams.get('v');
  if (shellVersion) assert.equal(shellVersion, version);
 }
 for (const path of new Set([...clientPaths, ...context.shell.filter(path => path.includes('?v='))])) {
  const response = await w.fetch(new Request(origin + path));
  assert.equal(response.status, 200, path);
  assert.match(response.headers.get('Cache-Control'), /immutable/, path);
 }
 for (const path of ['/', '/?v=' + version, '/sw.js', '/sw.js?v=' + version, '/model.js', '/app.js?v=19', '/app.js?v=14']) {
  const response = await w.fetch(new Request(origin + path));
  assert.equal(response.headers.get('Cache-Control'), 'no-cache', path);
 }
});
