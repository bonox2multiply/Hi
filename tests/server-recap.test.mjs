import test from 'node:test';
import assert from 'node:assert/strict';
import {getGameRecap,validRecapRequest} from '../worker/recap.js';
const game={gameId:'20261025LGHT02026',gameDate:'2026-10-25',gameDateTime:'2026-10-25T18:30:00',statusCode:'RESULT',homeTeamCode:'HT',awayTeamCode:'LG',homeTeamName:'KIA',awayTeamName:'LG',homeTeamScore:3,awayTeamScore:1,stadium:'광주'};
const provider=(g=game,relayFails=false)=>async url=>{
 if(url.includes('/relay')){if(relayFails)throw Error('relay down');return Response.json({success:true,result:{textRelayData:{gameId:g.gameId,currentGameState:{homeScore:3,awayScore:1},inningScore:{home:{1:0,2:3},away:{1:1,2:0}},textRelays:[]}}});}
 return Response.json({success:true,result:{games:[g],gameTotalCount:1}});
};
test('recap validates identifiers and calendar dates including leap days',()=>{
 assert.ok(validRecapRequest(game.gameId,game.gameDate));assert.ok(validRecapRequest(game.gameId,'2024-02-29'));
 for(const date of ['2026-02-29','2026-13-01','bad',null])assert.equal(validRecapRequest(game.gameId,date),false);
 assert.equal(validRecapRequest('../../x',game.gameDate),false);
});
test('server builds a factual summary from matching provider schedule and relay',async()=>{
 const d=await getGameRecap(game.gameId,game.gameDate,provider());
 assert.equal(d.recap.result,'승리');assert.equal(d.recap.kia,3);assert.equal(d.recap.burst.inning,2);assert.equal(d.stale,false);
});
test('relay outage retains only confirmed final schedule facts',async()=>{
 const d=await getGameRecap(game.gameId,game.gameDate,provider(game,true));assert.ok(d.recap.available);assert.equal(d.recap.burst,null);assert.equal(d.recap.limited,true);
});
test('canceled suspended live and missing-score games never produce final recaps',async()=>{
 for(const change of [{cancel:true},{suspended:true},{statusCode:'STARTED'},{statusCode:'BEFORE'},{homeTeamScore:null}]){
  let relayCalls=0;const fetcher=provider({...game,...change});
  const d=await getGameRecap(game.gameId,game.gameDate,async url=>{if(url.includes('/relay'))relayCalls++;return fetcher(url)});
  assert.equal(d.recap.available,false);assert.equal(relayCalls,0);
 }
});
test('synthetic postseason IDs use supplied verified date rather than ID year',async()=>{
 const g={...game,gameId:'55551025OBLG02026',homeTeamCode:'LG',awayTeamCode:'OB',homeTeamName:'LG',awayTeamName:'두산'};let requested;
 const d=await getGameRecap(g.gameId,g.gameDate,async url=>{if(!url.includes('/relay'))requested=new URL(url);return provider(g)(url)});
 assert.equal(requested.searchParams.get('fromDate'),g.gameDate);assert.ok(d.recap.available);
});
test('missing mismatched and incomplete schedules fail rather than fabricate recaps',async()=>{
 for(const payload of [{success:false},{success:true,result:{games:[],gameTotalCount:0}},{success:true,result:{games:[game],gameTotalCount:2}},{success:true,result:{games:[{...game,gameDate:'2026-10-24'}],gameTotalCount:1}}])
  await assert.rejects(getGameRecap(game.gameId,game.gameDate,async()=>Response.json(payload)));
});
test('recap endpoint validates early, coalesces requests and labels outage cache',async()=>{
 const original=globalThis.fetch;let calls=0;
 globalThis.fetch=async url=>{calls++;return provider()(url)};
 try{
  const {default:w}=await import('../dist/server/index.js?recap='+Date.now());
  assert.equal((await w.fetch(new Request('https://example.com/api/recap?gameId=bad&date=2026-10-25'))).status,400);assert.equal(calls,0);
  const request=()=>new Request('https://example.com/api/recap?gameId='+game.gameId+'&date='+game.gameDate);
  const responses=await Promise.all([w.fetch(request()),w.fetch(request())]);
  assert.equal(calls,3);assert.ok((await responses[0].json()).recap.available);
  const oldNow=Date.now;Date.now=()=>oldNow()+120000;globalThis.fetch=async()=>{throw Error('offline')};
  try{const stale=await(await w.fetch(request())).json();assert.equal(stale.stale,true);assert.equal(stale.recap.stale,true);}finally{Date.now=oldNow;}
 }finally{globalThis.fetch=original;}
});
