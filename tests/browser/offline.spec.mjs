import {test,expect} from '@playwright/test';

test.use({serviceWorkers:'allow'});

async function controlledPage(page){
  await page.goto('/');
  await page.evaluate(async()=>{
    await navigator.serviceWorker.register('/sw.js');
    await navigator.serviceWorker.ready;
    if(!navigator.serviceWorker.controller)await new Promise(resolve=>navigator.serviceWorker.addEventListener('controllerchange',resolve,{once:true}));
  });
}

test('installed shell opens offline without caching API responses',async({page,context})=>{
  await controlledPage(page);
  const title=await page.title();
  await page.evaluate(()=>fetch('/api/games').catch(()=>{}));
  const keys=await page.evaluate(async()=>{
    const names=await caches.keys();
    return (await Promise.all(names.map(async name=>(await (await caches.open(name)).keys()).map(r=>new URL(r.url).pathname)))).flat();
  });
  expect(keys).toContain('/');
  expect(keys.some(path=>path.startsWith('/api/'))).toBe(false);
  await context.setOffline(true);
  await page.reload();
  await expect(page).toHaveTitle(title);
  await expect(page.locator('#main')).toBeVisible();
  await expect(page.locator('#pageTitle')).toBeVisible();
  expect(await page.evaluate(()=>navigator.onLine)).toBe(false);
});

test('new worker replaces the previous shell cache and preserves unrelated caches',async({page,context})=>{
  await page.goto('/robots.txt');
  await page.evaluate(async()=>{
    await caches.open('unrelated-test-cache');
    await navigator.serviceWorker.register('/sw.js?test-previous=1');
    await navigator.serviceWorker.ready;
    if(!navigator.serviceWorker.controller)await new Promise(resolve=>navigator.serviceWorker.addEventListener('controllerchange',resolve,{once:true}));
  });
  await expect.poll(()=>page.evaluate(()=>caches.keys())).toContain('kia-diamond-shell-test-previous');
  await page.evaluate(()=>navigator.serviceWorker.register('/sw.js'));
  await expect.poll(()=>page.evaluate(()=>caches.keys())).not.toContain('kia-diamond-shell-test-previous');
  const names=await page.evaluate(()=>caches.keys());
  expect(names).toContain('unrelated-test-cache');
  expect(names.filter(n=>n.startsWith('kia-diamond-shell-'))).toHaveLength(1);
  const expected=await (await page.request.get('/app.js')).text();
  const cached=await page.evaluate(async()=>{
    const name=(await caches.keys()).find(n=>n.startsWith('kia-diamond-shell-'));
    const cache=await caches.open(name);
    const request=(await cache.keys()).find(r=>new URL(r.url).pathname==='/app.js');
    return (await cache.match(request)).text();
  });
  expect(cached).toBe(expected);
  await context.setOffline(true);
  await page.goto('/');
  await expect(page.locator('#main')).toBeVisible();
});
