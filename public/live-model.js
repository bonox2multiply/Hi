import {numeric,isLive,isHome,primaryName,opponent,occupied} from './model.js';
export function liveState(g,d,now=Date.now()){
 if(!isLive(g)||d?.gameId!==g.gameId)return null;
 const s=d.state||{},home=numeric(s.homeScore),away=numeric(s.awayScore),inning=numeric(d.inning),out=numeric(s.out);
 if(home===null||away===null||home<0||away<0||!Number.isInteger(inning)||inning<1||!['초','말'].includes(d.half))return null;
 return {home,away,inning,half:d.half,out,stale:!!d.stale||!Number.isFinite(Date.parse(d.fetchedAt))||now-Date.parse(d.fetchedAt)>120000};
}
export function liveSummary(g,d,now=Date.now()){
 const s=liveState(g,d,now);if(!s)return null;
 const a=isHome(g)?s.home:s.away,b=isHome(g)?s.away:s.home;
 const events=(d.highlights?.length?d.highlights:d.plays||[]).filter(p=>p.lines?.some(l=>/득점|홈인|적시|홈런|끝내기/.test(l.text))).slice().sort((a,b)=>Number(b.id)-Number(a.id)).slice(0,5);
 return {...s,title:`${primaryName(g)} ${a}–${b} ${opponent(g)}`,lead:`${s.inning}회 ${s.half} 현재 ${a===b?'동점':a>b?`${a-b}점 차로 앞서고 있어요`:`${b-a}점 차로 뒤지고 있어요`}.`,events};
}
// Transparent heuristic, not calibrated on historical KBO results. Ties excluded.
export function winEstimate(g,d,now=Date.now()){
 const s=liveState(g,d,now);if(!s||s.stale||!Number.isInteger(s.out)||s.out<0||s.out>3)return null;
 const remaining=Math.max(.2,9-s.inning+(s.half==='초'?1:.5)-s.out/6);
 const runners=[1,2,3].reduce((n,b)=>n+(occupied(d.state['base'+b])?[.22,.38,.55][b-1]:0),0)*(3-s.out)/3;
 const edge=s.home-s.away+(s.half==='말'?1:-1)*runners+.12;
 const home=Math.min(99,Math.max(1,Math.round(100/(1+Math.exp(-1.25*edge/Math.sqrt(remaining))))));
 return {...s,home,away:100-home};
}

// Numeric pregame probabilities must come from verified game-specific sources.
export function pregameEstimate(g,evidence){
 if(!g||(g.statusCode!=='BEFORE'&&!isLive(g))||g.cancel||g.suspended||evidence?.gameId!==g.gameId||evidence.stale||!Number.isFinite(Date.parse(evidence.fetchedAt))||Date.parse(evidence.fetchedAt)>Date.now()+60000||Date.now()-Date.parse(evidence.fetchedAt)>600000)return null;
 const p=evidence.sources?.find(s=>s.source===evidence.primary&&s.available);
 return p&&Number.isFinite(p.home)&&Number.isFinite(p.away)&&p.home>0&&p.home<100&&p.away>0&&p.away<100&&Math.abs(p.home+p.away-100)<.2?{home:p.home,away:p.away}:null;
}
