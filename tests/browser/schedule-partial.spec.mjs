import {test,expect} from './fixtures.mjs';
test('partial postseason schedule remains visible and recovers on refresh',async({page,scenario})=>{
 let partial=true;
 await page.route('**/api/postseason',r=>r.fulfill({json:{active:true,year:scenario.today.slice(0,4),today:scenario.today,games:[{...scenario.game,psRound:'ks'}],rounds:[],stale:partial,partial,fetchedAt:new Date().toISOString()}}));
 await page.goto('/#home');
 await expect(page.locator('.ps-game').first()).toContainText('LG');
 await expect(page.locator('.ps-update')).toContainText('일부 기간');
 partial=false;await page.locator('[data-ps-refresh]').click();
 await expect(page.locator('.ps-update')).not.toContainText('일부 기간');
 await expect(page.locator('.ps-game').first()).toContainText('LG');
});
