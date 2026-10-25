import {test,expect} from './fixtures.mjs';

function finish(scenario){Object.assign(scenario.game,{statusCode:'RESULT',homeTeamScore:3,awayTeamScore:1});}
function response(scenario){return {gameId:scenario.game.gameId,gameDate:scenario.game.gameDate,stale:false,fetchedAt:new Date().toISOString(),recap:{available:true,kia:3,other:1,title:'서버에서 확인한 KIA 승리',lead:'확인된 최종 기록: KIA 3점, LG 1점.',bullets:['서버 요약 응답을 표시합니다.'],result:'승리',margin:2,burst:null,limited:true}};}

test('finished game summary displays the server API response in home and game detail',async({page,scenario})=>{
 finish(scenario);let calls=0;
 await page.route('**/api/recap?*',async route=>{calls++;await route.fulfill({json:response(scenario)});});
 await page.goto('/#home');
 await expect(page.locator('#featuredRecap')).toContainText('서버에서 확인한 KIA 승리');
 await page.locator('#featuredRecap [data-game]').click();
 await page.locator('[data-tab="summary"]').click();
 await expect(page.locator('#summaryContent')).toContainText('서버 API가 확인된 경기 기록');
 await expect(page.locator('#summaryContent h3').first()).toContainText('서버에서 확인한 KIA 승리');
 expect(calls).toBe(1);
});

test('API outage keeps labeled record fallback and manual refresh retries',async({page,scenario})=>{
 finish(scenario);let failed=true;
 await page.route('**/api/recap?*',route=>route.fulfill(failed?{status:503,json:{error:'controlled outage'}}:{json:response(scenario)}));
 await page.goto('/#home');
 await expect(page.locator('#featuredRecap')).toContainText('서버 요약 연결 지연');
 await expect(page.locator('#featuredRecap')).toContainText('승리');
 failed=false;
 await page.locator('#refresh').click();
 await expect(page.locator('#featuredRecap')).toContainText('서버에서 확인한 KIA 승리');
});

test('mismatched API scores are not presented as a confirmed summary',async({page,scenario})=>{
 finish(scenario);
 await page.route('**/api/recap?*',route=>{const d=response(scenario);d.recap.kia=99;return route.fulfill({json:d});});
 await page.goto('/#home');
 await expect(page.locator('#featuredRecap')).toContainText('서버 요약 연결 지연');
 await expect(page.locator('#featuredRecap')).not.toContainText('서버에서 확인한');
});
