import {test,expect} from './fixtures.mjs';
import fs from 'node:fs/promises';

test('saved news survives search clearing and reload',async({page,scenario})=>{
  await page.goto('/#news');
  const card=page.locator('#newsList .news-card');
  await expect(card).toHaveCount(1);
  await card.locator('[data-save-news]').click();
  await page.locator('[data-news-filter="saved"]').click();
  await expect(card).toContainText(scenario.article.title);
  await page.locator('#newsSearch').fill('검색결과없음');
  await expect(card).toHaveCount(0);
  await page.locator('#newsSearch').fill('');
  await expect(card).toHaveCount(1);
  await page.reload();
  await page.locator('[data-news-filter="saved"]').click();
  await expect(card.locator('[data-save-news]')).toHaveAttribute('aria-pressed','true');
});

test('failed news refresh retains articles and retry clears stale notice',async({page,scenario})=>{
  await page.goto('/#news');
  await expect(page.locator('#newsList .news-card')).toHaveCount(1);
  scenario.failNews=true;scenario.delayNews=200;
  await page.locator('#refreshNews').click();
  await expect(page.locator('#refreshNews')).toBeDisabled();
  await expect(page.locator('#newsNotice')).toContainText('갱신이 지연');
  await expect(page.locator('#newsList .news-card')).toHaveCount(1);
  await expect(page.locator('#refreshNews')).toBeEnabled();
  scenario.failNews=false;scenario.delayNews=0;
  await page.locator('#refreshNews').click();
  await expect(page.locator('#refreshNews')).toBeEnabled();
  await expect(page.locator('#newsNotice')).toBeHidden();
});

async function openDate(page,scenario){
  await page.goto('/#games');
  let day=page.locator(`[data-calendar-date="${scenario.date}"]`);
  // Tomorrow can be in the next calendar month.
  if(scenario.date.slice(0,7)!==scenario.today.slice(0,7))await page.locator('[data-calendar-step="1"]').click();
  await day.focus();await page.keyboard.press('Enter');
  await expect(page.locator('#calendarDetail')).toBeVisible();
  return day;
}
test('calendar closes back to the date with keyboard focus',async({page,scenario})=>{
  const day=await openDate(page,scenario);
  await page.locator('[data-calendar-close]').focus();await page.keyboard.press('Enter');
  await expect(page.locator('#calendarDetail')).toBeHidden();
  await expect(day).toBeFocused();
});

test('download includes the actual start time and leaves date controls usable',async({page,scenario})=>{
  await openDate(page,scenario);
  const button=page.getByRole('button',{name:'일정 파일 다운로드 (.ics)'});
  await expect(button).toBeEnabled();
  await expect(button).toHaveAttribute('aria-describedby',/calendarExportNote/);
  const pending=page.waitForEvent('download');
  await button.focus();await page.keyboard.press('Enter');
  const download=await pending;
  expect(download.suggestedFilename()).toBe(`kia-${scenario.game.gameId}.ics`);
  const content=await fs.readFile(await download.path(),'utf8');
  expect(content).toContain(`DTSTART:${scenario.date.replaceAll('-','')}T093000Z`);
  expect(content).not.toContain('DTEND');
  await expect(page.locator('[data-export-status]')).toContainText('다운로드를 요청');
  await page.locator('[data-calendar-close]').click();
  await expect(page.locator('#calendarDetail')).toBeHidden();
});
for(const condition of ['stale','canceled','unknown-time'])test(`download blocks ${condition}`,async({page,scenario})=>{
  if(condition==='stale')scenario.stale=true;
  if(condition==='canceled')scenario.game.cancel=true;
  if(condition==='unknown-time')scenario.game.timeTbd=true;
  await openDate(page,scenario);
  await expect(page.locator('[data-calendar-export]')).toBeDisabled();
  await expect(page.locator('.calendar-export p').first()).toContainText(condition==='stale'?'새로고침':condition==='canceled'?'취소':'시작 시각');
});

test('offline at download time is reported without producing a file',async({page,scenario})=>{
  await openDate(page,scenario);
  await page.evaluate(()=>Object.defineProperty(navigator,'onLine',{get:()=>false,configurable:true}));
  let downloads=0;page.on('download',()=>downloads++);
  await page.locator('[data-calendar-export]').click();
  await expect(page.locator('[data-export-status]')).toContainText('오프라인');
  expect(downloads).toBe(0);
});

test('download rechecks freshness after the detail was opened',async({page,scenario})=>{
  await openDate(page,scenario);
  await expect(page.locator('[data-calendar-export]')).toBeEnabled();
  await page.evaluate(()=>{const now=Date.now();Date.now=()=>now+6*60000;});
  await page.locator('[data-calendar-export]').click();
  await expect(page.locator('[data-export-status]')).toContainText('새로고침');
});

test('file creation failure is explained and the button permits a retry',async({page,scenario})=>{
  await openDate(page,scenario);
  await page.evaluate(()=>{window.originalCreateURL=URL.createObjectURL;URL.createObjectURL=()=>{throw Error('controlled download failure');};});
  await page.locator('[data-calendar-export]').click();
  await expect(page.locator('[data-export-status]')).toContainText('파일을 받지 못했어요');
  await page.evaluate(()=>{URL.createObjectURL=window.originalCreateURL;});
  const pending=page.waitForEvent('download');
  await page.locator('[data-calendar-export]').click();
  await pending;
  await expect(page.locator('[data-export-status]')).toContainText('다운로드를 요청');
});
