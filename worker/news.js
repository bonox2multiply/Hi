export const NEWS_SOURCES=[
 {name:'연합뉴스',url:'https://www.yna.co.kr/rss/sports.xml',hosts:['yna.co.kr']},
 {name:'동아일보',url:'https://rss.donga.com/sports.xml',hosts:['donga.com']},
 {name:'스포츠동아',url:'https://rss.donga.com/sportsdonga/baseball.xml',hosts:['donga.com']},
 {name:'스포츠조선',url:'https://www.sportschosun.com/rss/index_all.htm',hosts:['sportschosun.com']}
];
export function newsText(value){return String(value||'').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,'$1').replace(/<[^>]+>/g,'').replace(/&#(x[0-9a-f]+|\d+);/gi,(_,n)=>{const code=n[0].toLowerCase()==='x'?parseInt(n.slice(1),16):Number(n);return code>0&&code<=0x10ffff?String.fromCodePoint(code):''}).replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&apos;|&#39;/g,"'").replace(/&amp;/g,'&').replace(/&nbsp;/g,' ').replace(/\s+/g,' ').trim();}
export function newsCategory(title){return /부상|복귀|재활|엔트리|트레이드|계약|FA\b|영입|선발|라인업/.test(title)?'team':/승리|패배|꺾|제압|역전|결승|끝내기|준PO|준플레이오프|한국시리즈|순위|승부/.test(title)?'game':'club';}
export function parseNewsFeed(xml,source,now=new Date(),postseason=false){
 if(!/<(?:rss|feed)\b/i.test(xml))throw Error('Invalid news feed');
 const tag=(block,name)=>{const m=block.match(new RegExp('<'+name+'(?:\\s[^>]*)?>([\\s\\S]*?)<\\/'+name+'>','i'));return m?newsText(m[1]):''};
 const seen=new Set(),items=[];
 for(const match of xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)){
  const b=match[1],title=tag(b,'title'),raw=tag(b,'link'),date=tag(b,'pubDate')||tag(b,'dc:date');let u;try{u=new URL(raw)}catch{continue}
  if(u.protocol!=='https:'||!source.hosts.some(h=>u.hostname===h||u.hostname.endsWith('.'+h)))continue;
  const text=title+' '+tag(b,'description');
  if(postseason?!(/포스트시즌|가을야구|와일드카드|준플레이오프|플레이오프|한국시리즈|준PO|\bPO\b/i.test(text)&&/KBO|야구|KIA|기아|LG|두산|삼성|한화|SSG|키움|롯데|KT|NC|타이거즈|트윈스|베어스/i.test(text)):!/\bKIA\b|타이거즈|기아(?!자동차|차)/i.test(text))continue;
  u.hash='';if(!title||title.length>500||seen.has(u.href))continue;
  const ts=Date.parse(date);if(!Number.isFinite(ts)||ts>now.getTime()+300000||now.getTime()-ts>7*86400000)continue;
  u.hash='';seen.add(u.href);items.push({id:u.href,title,url:u.href,publisher:source.name,publishedAt:new Date(ts).toISOString(),category:newsCategory(title),team:/\bKIA\b|타이거즈|기아(?!자동차|차)/i.test(text)?'kia':'other'});
 }
 return items.sort((a,b)=>b.publishedAt.localeCompare(a.publishedAt));
}
export async function fetchNews(fetcher=fetch,now=new Date(),postseason=false){
 const results=await Promise.allSettled(NEWS_SOURCES.map(async source=>{const r=await fetcher(source.url,{headers:{Accept:'application/rss+xml, application/xml, text/xml'},signal:AbortSignal.timeout(12000)});if(!r.ok)throw Error('Feed unavailable');const data=await r.arrayBuffer();if(data.byteLength>3*1024*1024)throw Error('Feed too large');const charset=r.headers.get('content-type')?.match(/charset=([^;\s]+)/i)?.[1]||'utf-8';const xml=new TextDecoder(charset).decode(data);return {source:source.name,items:parseNewsFeed(xml,source,now,postseason)}}));
 const good=results.filter(r=>r.status==='fulfilled').map(r=>r.value);if(!good.length)throw Error('All news feeds unavailable');
 const seen=new Set();const articles=good.flatMap(r=>r.items).sort((a,b)=>b.publishedAt.localeCompare(a.publishedAt)).filter(a=>{const key=a.url;if(seen.has(key))return false;seen.add(key);return true});
 const selected=postseason?[...articles.filter(a=>a.team==='kia').slice(0,40),...articles.filter(a=>a.team==='other').slice(0,40)].sort((a,b)=>b.publishedAt.localeCompare(a.publishedAt)):articles.slice(0,40);
 return {articles:selected,fetchedAt:now.toISOString(),stale:false,partial:good.length<NEWS_SOURCES.length,sources:good.map(r=>r.source),windowDays:7};
}
