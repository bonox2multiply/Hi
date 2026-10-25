import {fetchPregame} from './pregame.js';
import {fetchGameClips} from './clips.js';
import {dateWindow,getGames} from './api.js';
import {getRelay} from './relay.js';
import {fetchVideos,videoDays} from './videos.js';
import {fetchNews} from './news.js';
import {getGameRecap,validRecapRequest} from './recap.js';
import {fetchStandings} from './standings.js';
// The build embeds validated static assets and fallback snapshots here.
const pending=new Map(),memory=new Map();
const common={'X-Content-Type-Options':'nosniff','Referrer-Policy':'strict-origin-when-cross-origin'};
const validId=id=>/^\d{8}[A-Z]{4}\d{5}$/.test(id)&&[id.slice(8,10),id.slice(10,12)].includes('HT');
function json(data,status=200){return Response.json(data,{status,headers:{...common,'Cache-Control':'no-store'}})}
async function remembered(key,request){if(memory.has(key))return memory.get(key);try{if(typeof caches!=='undefined'){const response=await caches.default.match(new Request(new URL('/__internal-cache/'+key,request.url)));if(response){const data=await response.json();memory.set(key,data);return data}}}catch{}return null}
function remember(key,data,request,ctx){if(memory.size>70)memory.delete(memory.keys().next().value);memory.set(key,data);try{if(typeof caches!=='undefined'){const write=caches.default.put(new Request(new URL('/__internal-cache/'+key,request.url)),new Response(JSON.stringify(data),{headers:{'Content-Type':'application/json','Cache-Control':'public,max-age=604800'}})).catch(()=>{});if(ctx?.waitUntil)ctx.waitUntil(write)}}catch{}}
async function coalesce(key,fn){if(pending.has(key))return pending.get(key);const promise=fn().finally(()=>pending.delete(key));pending.set(key,promise);return promise}
export default {async fetch(request,env,ctx){
 const url=new URL(request.url);if(!['GET','HEAD'].includes(request.method))return new Response('Method not allowed',{status:405,headers:{...common,Allow:'GET, HEAD'}});
 if(url.pathname==='/api/recap'){
  const id=url.searchParams.get('gameId'),date=url.searchParams.get('date');
  if(!validRecapRequest(id,date))return json({error:'경기와 날짜를 확인해 주세요.'},400);
  const key='recap-v1-'+id+'-'+date,cached=await remembered(key,request);
  if(cached&&Date.now()-Date.parse(cached.fetchedAt)<60000)return json(cached);
  try{const d=await coalesce(key,()=>getGameRecap(id,date));if(d.recap.available)remember(key,d,request,ctx);return json(d)}catch{return cached?json({...cached,stale:true,recap:{...cached.recap,stale:true}}):json({error:'경기 요약 연결이 지연되고 있어요.'},503)}
 }
 if(url.pathname==='/api/pregame'){
  const id=url.searchParams.get('gameId')||'';
  if(!/^\d{8}[A-Z]{4}\d{5}$/.test(id))return json({error:'잘못된 경기입니다.'},400);
  const key='pregame-v20-'+id,cached=await remembered(key,request);
  if(cached&&Date.now()-Date.parse(cached.fetchedAt)<300000)return json(cached);
  try{const d=await coalesce(key,()=>fetchPregame(id));remember(key,d,request,ctx);return json(d)}catch{return cached?json({...cached,stale:true}):json({error:'사전 분석 자료 연결 지연'},503)}
 }
 if(url.pathname==='/api/game-clips'){
  const id=url.searchParams.get('gameId')||'';
  if(!/^\d{8}[A-Z]{4}\d{5}$/.test(id))return json({error:'잘못된 경기입니다.'},400);
  const key='clips-'+id,cached=await remembered(key,request);
  if(cached&&Date.now()-Date.parse(cached.fetchedAt)<60000)return json(cached);
  try{const d=await coalesce(key,()=>fetchGameClips(id));remember(key,d,request,ctx);return json(d)}catch{return cached?json({...cached,stale:true}):json({error:'주요 영상 연결 지연'},503)}
 }
 if(url.pathname==='/api/postseason/relay'){
  const id=url.searchParams.get('gameId')||'';
  if(!/^\d{8}[A-Z]{4}\d{5}$/.test(id))return json({error:'잘못된 경기입니다.'},400);
  const key='ps-relay-'+id,cached=await remembered(key,request);
  if(cached&&Date.now()-Date.parse(cached.fetchedAt)<20000)return json(cached);
  try{const d=await coalesce(key,()=>getRelay(id,fetch,{allTeams:true,includeHighlights:true}));remember(key,d,request,ctx);return json(d)}catch{return cached?json({...cached,stale:true}):json({error:'문자 중계 연결 지연'},503)}
 }
 if(url.pathname==='/api/postseason'){
  const now=new Date(),today=dateWindow(now).today,key='postseason',cached=await remembered(key,request);
  if(cached&&cached.today===today&&Date.now()-Date.parse(cached.fetchedAt)<20000)return json(cached);
  try{const d=await coalesce(key,()=>fetchPostseason());remember(key,d,request,ctx);return json(d)}catch{return json({...postseasonState(cached?.games||[],today),rounds:PS_ROUNDS,fetchedAt:cached?.fetchedAt||null,stale:true})}
 }
 if(url.pathname==='/api/postseason/news'||url.pathname==='/api/postseason/videos'){
  const video=url.pathname.endsWith('/videos'),key=video?'ps-videos':'ps-news',cached=await remembered(key,request);
  if(cached&&Date.now()-Date.parse(cached.fetchedAt)<300000)return json(cached);
  try{const d=await coalesce(key,async()=>video?fetchVideos(fetch,new Date(),(await (async()=>{const ps=await remembered('postseason',request);if(ps&&ps.today===dateWindow().today&&Date.now()-Date.parse(ps.fetchedAt)<120000)return ps;const fresh=await coalesce('postseason',()=>fetchPostseason());remember('postseason',fresh,request,ctx);return fresh})()).games):fetchNews(fetch,new Date(),true));remember(key,d,request,ctx);return json(d)}catch{return cached?json({...cached,stale:true}):json({error:'연결이 지연되고 있어요. 잠시 후 다시 확인해 주세요.'},503)}
 }
 if(url.pathname==='/api/games'){
  const days=url.searchParams.get('days')==='30'?30:7,now=new Date(),w=dateWindow(now,days),key='games-'+days,cached=await remembered(key,request);
  if(cached&&cached.today===w.today&&Date.now()-Date.parse(cached.fetchedAt)<20000)return json(cached);
  try{const d=await coalesce(key,()=>getGames(now,fetch,days));remember(key,d,request,ctx);return json(d)}catch{const fallback=cached||snapshot;return json({...fallback,...w,games:fallback.games.filter(g=>g.gameDate>=w.from&&g.gameDate<=w.to),stale:true})}
 }
 if(url.pathname==='/api/relay'){
  const id=url.searchParams.get('gameId')||'';if(!validId(id))return json({error:'잘못된 경기입니다.'},400);
  const includeHighlights=url.searchParams.get('highlights')==='1';const key='relay-'+id+(includeHighlights?'-recap':''),cached=await remembered(key,request);if(cached&&Date.now()-Date.parse(cached.fetchedAt)<20000)return json(cached);
  try{const d=await coalesce(key,()=>getRelay(id,fetch,{includeHighlights}));remember(key,d,request,ctx);return json(d)}catch{return cached?json({...cached,stale:true}):json({error:'문자 중계 정보를 불러오지 못했습니다.'},503)}
 }
 if(url.pathname==='/api/videos'){
  const cached=await remembered('videos',request),days=videoDays();if(cached&&cached.days?.[0]===days[0]&&Date.now()-Date.parse(cached.fetchedAt)<300000)return json(cached);
  try{const d=await coalesce('videos',()=>fetchVideos());remember('videos',d,request,ctx);return json(d)}catch{const old=cached||videosSnapshot;return old?json({...old,days,videos:old.videos.filter(v=>days.includes(v.gameDate)),stale:true}):json({error:'하이라이트를 불러오지 못했습니다.'},503)}
 }
 if(url.pathname==='/api/news'){
  const cached=await remembered('news',request);if(cached&&Date.now()-Date.parse(cached.fetchedAt)<300000)return json(cached);
  try{const d=await coalesce('news',()=>fetchNews());remember('news',d,request,ctx);return json(d)}catch{const old=cached||newsSnapshot;return old?json({...old,stale:true}):json({error:'뉴스를 불러오지 못했습니다.'},503)}
 }
 if(url.pathname==='/api/standings'){
  const cached=await remembered('standings',request);if(cached&&Date.now()-Date.parse(cached.fetchedAt)<300000)return json(cached);
  try{const d=await coalesce('standings',()=>fetchStandings(cached||rankSnapshot));remember('standings',d,request,ctx);return json(d)}catch{return json({...cached||rankSnapshot,stale:true})}
 }
 const asset=assets[url.pathname];if(asset)return new Response(request.method==='HEAD'?null:asset.body,{headers:{...common,'Content-Type':asset.type,'Cache-Control':url.searchParams.get('v')==='26'&&!['/','/sw.js'].includes(url.pathname)?'public,max-age=31536000,immutable':'no-cache',...(url.pathname==='/sw.js'?{'Service-Worker-Allowed':'/'}:{})}});
 return new Response('Not found',{status:404,headers:common});
}};
