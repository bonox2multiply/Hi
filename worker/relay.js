export function normalizeRelay(payload,gameId){
 const t=payload?.result?.textRelayData;if(payload?.success!==true||!t||t.gameId!==gameId)throw Error('Invalid relay response');
 const players=[t.homeLineup,t.awayLineup,t.homeEntry,t.awayEntry].flatMap(team=>[...(team?.batter||[]),...(team?.pitcher||[])]),s=t.currentGameState||{};
 const batting=team=>(team?.batter||[]).map(p=>({id:p.pcode,name:p.name,ab:p.ab,hit:p.hit,hr:p.hr,rbi:p.rbi,run:p.run}));
 return {gameId,inning:t.inn,half:String(t.homeOrAway)==='0'?'초':'말',score:t.inningScore||{home:{},away:{}},state:s,pitcher:players.find(p=>p.pcode===s.pitcher)?.name||null,batter:players.find(p=>p.pcode===s.batter)?.name||null,batters:{home:batting(t.homeLineup),away:batting(t.awayLineup)},plays:(t.textRelays||[]).map(p=>({id:p.no,inning:p.inn,half:String(p.homeOrAway)==='0'?'초':'말',title:p.title,lines:(p.textOptions||[]).filter(l=>typeof l.text==='string').map(l=>({id:l.seqno,text:l.text.trim(),speed:l.speed,stuff:l.stuff}))})).sort((a,b)=>b.id-a.id),fetchedAt:new Date().toISOString(),stale:false};
}
export async function getRelay(gameId,fetcher=fetch,{includeHighlights=false,allTeams=false}={}){
 if(!/^\d{8}[A-Z]{4}\d{5}$/.test(gameId)||(!allTeams&&![gameId.slice(8,10),gameId.slice(10,12)].includes('HT')))throw Error('Invalid game id');
 const base='https://api-gw.sports.naver.com/schedule/games/'+encodeURIComponent(gameId)+'/relay';
 const read=async suffix=>{const r=await fetcher(base+suffix,{headers:{Accept:'application/json'},signal:AbortSignal.timeout(10000)});if(!r.ok)throw Error('Relay unavailable');return normalizeRelay(await r.json(),gameId)};
 if(!includeHighlights)return read('');
 const [main,highlights]=await Promise.allSettled([read(''),read('/highLight')]);if(main.status==='rejected')throw main.reason;
 return {...main.value,highlights:highlights.status==='fulfilled'?highlights.value.plays:[],highlightsPartial:highlights.status==='rejected'};
}
