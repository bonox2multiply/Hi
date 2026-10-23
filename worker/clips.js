export function normalizeClips(payload,gameId,now=new Date()){
 if(payload?.success!==true||!Array.isArray(payload.result?.vodList))throw Error('Invalid game video catalogue');
 const seen=new Set();const clips=[...(payload.result.topVodList||[]),...payload.result.vodList].flatMap(v=>{
  if(v.gameId!==gameId||v.enable===false||v.mobileEnable===false||!v.title)return [];
  const id=String(v.sportsVideoId||v.serviceVid||'');if(!/^\d+$/.test(id)||seen.has(id))return [];seen.add(id);
  const clip=String(v.clipNo||v.naverTv?.clipNo||'');
  return [{id,title:String(v.title).slice(0,250),source:String(v.naverTvChannel?.channelName||v.seasonName||'네이버 스포츠'),url:'https://m.sports.naver.com/video/'+id,embedUrl:/^\d+$/.test(clip)?'https://tv.naver.com/embed/'+clip:null,thumbnail:typeof v.thumbnail==='string'&&/^https:\/\/[^/]+\.pstatic.net\//.test(v.thumbnail)?v.thumbnail:null}];
 }).slice(0,40);
 return {gameId,clips,fetchedAt:now.toISOString(),stale:false};
}
export async function fetchGameClips(gameId,fetcher=fetch){
 const r=await fetcher('https://api-gw.sports.naver.com/video/game/'+encodeURIComponent(gameId),{headers:{Accept:'application/json'},signal:AbortSignal.timeout(10000)});
 if(!r.ok)throw Error('Game videos unavailable');return normalizeClips(await r.json(),gameId);
}
