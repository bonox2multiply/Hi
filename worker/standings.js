const KBO_URL='https://www.koreabaseball.com/Record/TeamRank/TeamRankDaily.aspx';
const TEAM_CODES={KIA:'HT',KT:'KT',LG:'LG',SSG:'SK',삼성:'SS',두산:'OB',한화:'HH',롯데:'LT',NC:'NC',키움:'WO'};
const unescapeHtml=s=>s.replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;|&apos;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&nbsp;/g,' ');
export function parseStandings(html){
 const date=html.match(/lblSearchDateTitle[^>]*>\s*(\d{4})\.(\d{2})\.(\d{2})/);
 if(!date)throw Error('Standings date missing');
 const asOf=date.slice(1).join('-');
 const table=html.match(/<table\b[^>]*class="tData"[^>]*>[\s\S]*?<\/table>/i)?.[0];
 if(!table)throw Error('Standings table missing');
 const teams=[];
 for(const row of table.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)){
  const cells=[...row[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map(x=>unescapeHtml(x[1].replace(/<[^>]*>/g,'')).trim());
  if(cells.length<10)continue;
  const [rank,name,games,wins,losses,draws,pct,behind,,streak]=cells;
  if(!TEAM_CODES[name])throw Error('Unknown team');
  const team={code:TEAM_CODES[name],name,rank:Number(rank),games:Number(games),wins:Number(wins),losses:Number(losses),draws:Number(draws),pct:Number(pct),behind:Number(behind),streak};
  if(!Number.isInteger(team.rank)||team.rank<1||team.rank>10||!Number.isFinite(team.pct)||team.pct<0||team.pct>1||team.games!==team.wins+team.losses+team.draws)throw Error('Invalid standings');
  teams.push(team);
 }
 if(teams.length!==10||new Set(teams.map(t=>t.code)).size!==10)throw Error('Incomplete standings');
 return {asOf,teams:teams.sort((a,b)=>a.rank-b.rank)};
}
export function historyForm(html,date){
 const form=new URLSearchParams();
 for(const tag of html.matchAll(/<input\b[^>]*>/gi)){
  const attrs=Object.fromEntries([...tag[0].matchAll(/([\w$]+)="([^"]*)"/g)].map(a=>[a[1],unescapeHtml(a[2])]));
  if(attrs.type==='hidden'&&attrs.name)form.set(attrs.name,attrs.value||'');
 }
 const prefix='ctl00$ctl00$ctl00$cphContents$cphContents$cphContents$';
 form.set('__EVENTTARGET',prefix+'btnCalendarSelect');form.set('__EVENTARGUMENT','');
 form.set(prefix+'hfSearchDate',date.replaceAll('-',''));form.set(prefix+'txtCanlendar',date.replaceAll('-',''));form.set(prefix+'ddlSeries','0');
 return form;
}
export function rankDates(asOf){return Array.from({length:14},(_,i)=>new Date(Date.parse(asOf+'T12:00:00Z')-(13-i)*86400000).toISOString().slice(0,10));}
export async function fetchStandings(previous,fetcher=fetch){
 const fetchPage=async options=>{const r=await fetcher(KBO_URL,{...options,signal:AbortSignal.timeout(10000)});if(!r.ok)throw Error('KBO unavailable');return r.text();};
 const html=await fetchPage();const current=parseStandings(html);
 const saved=new Map((previous?.history||[]).filter(p=>p.ranks&&p.date!==current.asOf).map(p=>[p.date,p]));
 const dates=rankDates(current.asOf);const history=new Array(dates.length);let cursor=0;
 await Promise.all(Array.from({length:3},async()=>{while(cursor<dates.length){const i=cursor++;const date=dates[i];if(date===current.asOf){history[i]={date,ranks:Object.fromEntries(current.teams.map(t=>[t.code,t.rank]))};continue;}if(saved.has(date)){history[i]=saved.get(date);continue;}
  try{const page=await fetchPage({method:'POST',body:historyForm(html,date)});const d=parseStandings(page);if(d.asOf>date||!d.asOf.startsWith(date.slice(0,4)))throw Error('Date mismatch');history[i]={date,asOf:d.asOf,ranks:Object.fromEntries(d.teams.map(t=>[t.code,t.rank]))};}catch{history[i]={date,ranks:null};}
 }}));
 return {...current,history,fetchedAt:new Date().toISOString(),stale:false,source:'KBO 공식 기록'};
}
