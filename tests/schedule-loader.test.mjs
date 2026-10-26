import test from 'node:test';
import assert from 'node:assert/strict';
import {loadSchedule,scheduleKstDate} from '../worker/schedule.js';
const game={gameId:'20261025LGHT02026',gameDate:'2026-10-25',gameDateTime:'2026-10-25T18:30:00',statusCode:'BEFORE'};
test('month queries cover the full range once, including leap year',async()=>{
 const seen=[];
 const d=await loadSchedule('2024-02-27','2024-03-02',async url=>{const u=new URL(url);seen.push([u.searchParams.get('fromDate'),u.searchParams.get('toDate')]);return Response.json({success:true,result:{games:[]}})});
 assert.deepEqual(seen,[['2024-02-27','2024-02-29'],['2024-03-01','2024-03-02']]);assert.equal(d.stale,false);
 assert.equal(scheduleKstDate(new Date('2026-12-31T15:00:00Z')),'2027-01-01');
});
test('one failed month preserves successful games and labels missing dates',async()=>{
 const d=await loadSchedule('2026-09-01','2026-10-31',async url=>{
 if(new URL(url).searchParams.get('fromDate').startsWith('2026-09'))throw Error('timeout');
 return Response.json({success:true,result:{games:[game,game]}});
 });
 assert.equal(d.games.length,1);assert.equal(d.partial,true);assert.equal(d.stale,true);assert.deepEqual(d.failedRanges,[{from:'2026-09-01',to:'2026-09-30'}]);
});
test('all failures and invalid dates never become a successful empty schedule',async()=>{
 await assert.rejects(loadSchedule('2026-02-30','2026-03-01'));
 await assert.rejects(loadSchedule('2026-09-01','2026-10-31',async()=>Response.json({success:false})));
});
