import {test,expect} from './fixtures.mjs';
test('postseason refresh retains existing games when the server has no outage cache',async({page,scenario})=>{
 let failed=false;
 await page.route('**/api/postseason',route=>route.fulfill({json:{active:true,year:scenario.today.slice(0,4),today:scenario.today,start:scenario.today,rounds:[],games:failed?[]:[{...scenario.game,psRound:'ks'}],stale:failed,fetchedAt:failed?null:new Date().toISOString()}}));
 await page.goto('/#home');
 await expect(page.locator('.ps-game').first()).toContainText('LG');
 failed=true;
 await page.locator('[data-ps-refresh]').click();
 await expect(page.locator('.ps-update')).toContainText('최신 일정 연결 지연');
 await expect(page.locator('.ps-game').first()).toContainText('LG');
 failed=false;
 await page.locator('[data-ps-refresh]').click();
 await expect(page.locator('.ps-update')).not.toContainText('최신 일정 연결 지연');
});
