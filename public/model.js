export const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const isHome=g=>g.homeTeamCode==='HT';
export const primaryName=g=>isHome(g)?g.homeTeamName:g.awayTeamName;
export const opponent=g=>isHome(g)?g.awayTeamName:g.homeTeamName;
export const side=g=>g.neutralGround?'중립':isHome(g)?'홈':'원정';
export const scores=g=>[isHome(g)?g.homeTeamScore:g.awayTeamScore,isHome(g)?g.awayTeamScore:g.homeTeamScore];
export const isLive=g=>!!g&&!g.cancel&&!g.suspended&&!['RESULT','BEFORE'].includes(g.statusCode);
export function status(g){return g.cancel?'경기 취소':g.suspended?'경기 중단':g.statusCode==='RESULT'?'경기 종료':g.statusCode==='BEFORE'?'경기 예정':g.statusInfo||'진행 확인 중';}
export function outcome(g){if(g.cancel)return '취소';if(g.suspended)return '중단';if(g.statusCode!=='RESULT')return '예정';if(g.winner==='DRAW')return '무';if(!['HOME','AWAY'].includes(g.winner))return '종료';return g.winner===(isHome(g)?'HOME':'AWAY')?'승':'패';}
export const numeric=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v))?Number(v):null;
export const occupied=v=>v!==null&&v!==undefined&&v!==false&&v!==''&&String(v)!=='0';
export function tally(games){const done=games.filter(g=>g.statusCode==='RESULT'&&!g.cancel&&!g.suspended);const known=done.filter(g=>['승','패','무'].includes(outcome(g)));const wins=known.filter(g=>outcome(g)==='승').length,losses=known.filter(g=>outcome(g)==='패').length,draws=known.filter(g=>outcome(g)==='무').length;const scored=done.filter(g=>scores(g).every(v=>numeric(v)!==null));return {done,known,wins,losses,draws,pct:wins+losses?wins/(wins+losses):null,scored:scored.length,runs:scored.reduce((s,g)=>s+Number(scores(g)[0]),0),allowed:scored.reduce((s,g)=>s+Number(scores(g)[1]),0)};}
export function cumulative(score,inningCount){let total=0,valid=true;return Array.from({length:inningCount},(_,i)=>{const n=numeric(score?.[String(i+1)]);if(n===null){valid=false;return null;}if(!valid)return null;return total+=n;});}
export function filterPlays(plays,{inning='all',highlights=false}={}){return plays.filter(p=>(inning==='all'||String(p.inning)===String(inning))&&(!highlights||p.lines.some(l=>/홈런|득점|홈인|적시|끝내기/.test(l.text))));}
export function gameLabel(g){return `${g.gameDate} ${primaryName(g)} vs ${opponent(g)}${g.seriesGameNo>0?' '+g.seriesGameNo+'차전':''}`;}

// Only confirmed final scores are used for the narrative; live scores never become a recap.
export function summarizeGame(game,relay=null){
 if(!game||game.statusCode!=='RESULT'||game.cancel||game.suspended)return {available:false};
 const [rawK,rawO]=scores(game),kia=numeric(rawK),other=numeric(rawO),foe=opponent(game);
 if(kia===null||other===null)return {available:false,reason:'최종 점수를 확인하고 있어요.'};
 const team=primaryName(game);
 const result=kia>other?'승리':kia<other?'패배':'무승부',margin=Math.abs(kia-other),ks=isHome(game)?'home':'away',os=isHome(game)?'away':'home';
 const same=relay?.gameId===game.gameId,rk=numeric(relay?.state?.[ks+'Score']),ro=numeric(relay?.state?.[os+'Score']);
 const synced=same&&(rk===null||rk===kia)&&(ro===null||ro===other);
 const runs=synced?Object.entries(relay.score?.[ks]||{}).map(([inn,n])=>({inning:Number(inn),runs:numeric(n)})).filter(p=>Number.isInteger(p.inning)&&p.inning>0&&p.inning<=50&&p.runs!==null&&p.runs>0).sort((a,b)=>a.inning-b.inning):[];
 const burst=runs.length?runs.reduce((a,b)=>b.runs>a.runs?b:a):null;
 const complete=synced&&Object.values(relay.score?.[ks]||{}).some(v=>numeric(v)!==null)&&Object.values(relay.score?.[ks]||{}).reduce((s,v)=>s+(numeric(v)||0),0)===kia;
 const title=result==='무승부'?`${team}와 ${foe}, ${kia}–${other} 무승부`:`${team}, ${foe} 상대 ${kia}–${other} ${result}`;
 const lead=`${game.gameDate.replaceAll('-','.')} ${game.stadium||'구장 미확인'} 경기에서 ${team}는 ${foe} 상대로 ${kia}점을 올리고 ${other}점을 내주며 ${result==='무승부'?'승부를 가리지 못했어요':margin+'점 차 '+result+'로 경기를 마쳤어요'}.`;
 const bullets=[];
 if(burst)bullets.push(`${complete?team+'의 최다 득점 이닝은':'제공된 이닝 기록에서 '+team+'는'} ${burst.inning}회${isHome(game)?'말':'초'}${complete?'로, '+burst.runs+'점을 기록했어요.':'에 '+burst.runs+'점을 기록했어요.'}`);
 if(kia===0)bullets.push(team+'는 이번 경기에서 득점을 기록하지 못했어요.');else if(other===0)bullets.push(team+'는 상대를 무득점으로 막았어요.');
 if(game.winPitcherName)bullets.push(`승리 투수는 ${game.winPitcherName}${game.losePitcherName?', 패전 투수는 '+game.losePitcherName:''}입니다.${game.savePitcherName?' '+game.savePitcherName+' 선수가 세이브를 기록했어요.':''}`);
 if(synced){const kh=numeric(relay.state?.[ks+'Hit']),oh=numeric(relay.state?.[os+'Hit']);if(kh!==null&&oh!==null)bullets.push(`안타는 ${team} ${kh}개, ${foe} ${oh}개로 기록됐어요.`)}
 const batters=synced?(relay.batters?.[ks]||[]).filter(p=>p.name&&numeric(p.ab)!==null&&numeric(p.hit)!==null&&numeric(p.rbi)!==null&&Number(p.hit)>0).sort((a,b)=>Number(b.rbi)-Number(a.rbi)||Number(b.hit)-Number(a.hit)).slice(0,3):[];
 if(batters.length){const p=batters[0];bullets.splice(burst?1:0,0,`${p.name} 선수는 ${p.ab}타수 ${p.hit}안타${Number(p.hr)>0?', '+p.hr+'홈런':''}, ${p.rbi}타점을 기록했어요.`)}
 const events=synced?(relay.highlights?.length?relay.highlights:(relay.plays||[]).filter(p=>p.lines.some(l=>/득점|홈인|적시|홈런|끝내기/.test(l.text)))).sort((a,b)=>(Number(a.id)||0)-(Number(b.id)||0)).slice(-6):[];
 return {available:true,result,margin,kia,other,title,lead,bullets,burst,runs,events,batters,limited:!complete,stale:!!relay?.stale};
}
