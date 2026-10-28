// Query bounded calendar months; a failed month must not discard successful months.
export function scheduleKstDate(now = new Date()) {
  return new Date(now.getTime() + 9 * 3600000).toISOString().slice(0, 10);
}
export async function loadSchedule(from, to, fetcher = fetch) {
  const valid = d => /^\d{4}-\d{2}-\d{2}$/.test(d) && Number.isFinite(Date.parse(d)) && new Date(d).toISOString().slice(0,10) === d;
  if (!valid(from) || !valid(to) || from > to || Date.parse(to)-Date.parse(from)>366*86400000) throw Error('Invalid schedule range');
  const ranges=[];
  for(let start=from;start<=to;){
    const day=new Date(start+'T00:00:00Z');
    const end=new Date(Date.UTC(day.getUTCFullYear(),day.getUTCMonth()+1,0)).toISOString().slice(0,10);
    ranges.push({from:start,to:end<to?end:to});
    start=new Date(Date.parse(end+'T00:00:00Z')+86400000).toISOString().slice(0,10);
  }
  const results=await Promise.allSettled(ranges.map(async range=>{
    const params=new URLSearchParams({fields:'basic,schedule,baseball',upperCategoryId:'kbaseball',categoryId:'kbo',fromDate:range.from,toDate:range.to,size:'500'});
    const response=await fetcher('https://api-gw.sports.naver.com/schedule/games?'+params,{headers:{Accept:'application/json'},signal:AbortSignal.timeout(10000)});
    if(!response.ok)throw Error('Schedule unavailable');
    const p=await response.json(), games=p?.result?.games;
    if(p?.success!==true || !Array.isArray(games) || p.result.gameTotalCount>games.length)throw Error('Incomplete schedule');
    if(games.some(g=>!g || typeof g.gameId!=='string' || typeof g.gameDate!=='string' || typeof g.gameDateTime!=='string' || !g.statusCode))throw Error('Invalid game');
    return games.filter(g=>g.gameDate>=range.from && g.gameDate<=range.to);
  }));
  const failedRanges=ranges.filter((_,i)=>results[i].status==='rejected');
  if(failedRanges.length===ranges.length)throw Error('All schedule requests failed');
  const byId=new Map();
  for(const result of results)if(result.status==='fulfilled')for(const g of result.value)if(!byId.has(g.gameId))byId.set(g.gameId,g);
  return {games:[...byId.values()].sort((a,b)=>a.gameDateTime.localeCompare(b.gameDateTime)),stale:failedRanges.length>0,partial:failedRanges.length>0,failedRanges};
}
