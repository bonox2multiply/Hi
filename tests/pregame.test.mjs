import test from 'node:test';import assert from 'node:assert/strict';
import {parseBreadPrediction,parseLineupPrediction,recentLineup} from '../worker/pregame.js';
const g={gameId:'20261018LGHT02026',gameDate:'2026-10-18',awayTeamCode:'LG',homeTeamCode:'HT',awayStarterName:'A',homeStarterName:'B'};
const html='<h1>LG 트윈스 vs KIA 타이거즈</h1>일시:</strong> 2026-10-18 <div>선발: A</div><div>선발: B</div>예측 결과<span class="fw-bold">LG 48.2%</span><span class="fw-bold">KIA 51.8%</span>핵심 요인';
test('source probability requires matching date, teams, percentages and starting pitchers',()=>{assert.equal(parseBreadPrediction(html,g,'https://baseball.soundbread.com').home,51.8);assert.throws(()=>parseBreadPrediction(html,{...g,gameDate:'2026-10-19'},''));assert.throws(()=>parseBreadPrediction(html,{...g,homeStarterName:'Changed'},''));assert.throws(()=>parseBreadPrediction(html.replace('51.8%','99%'),g,''))});
test('confirmed-lineup model never exposes probability before readiness or for a wrong game',()=>{const p={gameId:g.gameId.slice(0,13),gameDate:'20261018',homeTeamId:'HT',awayTeamId:'LG',status:'ready',lineupConfirmed:true,homeWinProbability:.58,awayWinProbability:.42};const d={date:'20261018',modelStatus:'ready',probabilityBasis:'decisive_nine_innings',predictions:[p]};assert.equal(parseLineupPrediction(d,g).home,58);assert.equal(parseLineupPrediction({...d,predictions:[{...p,lineupConfirmed:false}]},g).home,null);assert.throws(()=>parseLineupPrediction({...d,date:'20261019'},g));assert.throws(()=>parseLineupPrediction({...d,predictions:[p,p]},g))});
test('projected lineup retains one starting batter per slot, excludes substitutes',()=>{const d={success:true,result:{textRelayData:{gameId:g.gameId,homeLineup:{batter:[{name:'starter',batOrder:1,seqno:1,cin:null},{name:'sub',batOrder:1,seqno:2,cin:4}]}}}};assert.deepEqual(recentLineup(d,g.gameId,'home'),[{name:'starter',order:1}])});
test('postseason IDs are matched by schedule date, not their synthetic year prefix',async()=>{
 const {fetchPregame}=await import('../worker/pregame.js');const game={...g,gameId:'33331018LGHT02026',statusCode:'BEFORE'};
 const d=await fetchPregame(game.gameId,async url=>{
  if(url.includes('/schedule/games?')){assert.match(url,/toDate=2026-10-18/);return Response.json({success:true,result:{games:[game],gameTotalCount:1}})}
  if(url.includes('soundbread'))return new Response(html);
  return Response.json({date:'20261018',modelStatus:'ready',probabilityBasis:'decisive_nine_innings',predictions:[{gameId:'20261018LGHT0',gameDate:'20261018',homeTeamId:'HT',awayTeamId:'LG',homeStarter:'B',awayStarter:'A',lineupConfirmed:true,status:'ready',homeWinProbability:.56,awayWinProbability:.44}]});
 },new Date('2026-10-17T09:30:00Z'));assert.equal(d.status,'ready');assert.equal(d.primary,'KBO 승부 예측');assert.equal(d.sources.length,2);
});
test('in-progress games retrieve external pregame outlook and reject unavailable providers',async()=>{
 const {fetchPregame}=await import('../worker/pregame.js');
 const game={...g,statusCode:'STARTED'};
 const provider=async url=>url.includes('/schedule/games?')?Response.json({success:true,result:{games:[game],gameTotalCount:1}}):url.includes('soundbread')?new Response(html):new Response('',{status:503});
 const d=await fetchPregame(game.gameId,provider,new Date('2026-10-18T10:00:00Z'));
 assert.equal(d.primary,'오늘야구');assert.equal(d.sources.find(s=>s.available).home,51.8);
 const missing=await fetchPregame(game.gameId,async url=>url.includes('/schedule/games?')?provider(url):new Response('',{status:503}));
 assert.equal(missing.status,'pending');assert.equal(missing.primary,null);
});
