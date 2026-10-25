import * as recapModel from '../public/model.js';
import {getRelay} from './relay.js';

export function validRecapRequest(id, date) {
  if (!/^\d{8}[A-Z]{4}\d{5}$/.test(id || '') || !/^\d{4}-\d{2}-\d{2}$/.test(date || '')) return false;
  const time = Date.parse(date + 'T00:00:00Z');
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === date;
}

export async function getGameRecap(id, date, fetcher = fetch) {
  if (!validRecapRequest(id, date)) throw Error('Invalid recap request');
  const params = new URLSearchParams({fields:'basic,schedule,baseball',upperCategoryId:'kbaseball',categoryId:'kbo',fromDate:date,toDate:date,size:'500'});
  const response = await fetcher('https://api-gw.sports.naver.com/schedule/games?' + params, {
    headers:{Accept:'application/json'}, signal:AbortSignal.timeout(10000)
  });
  if (!response.ok) throw Error('Schedule unavailable');
  const payload = await response.json(), games = payload?.result?.games;
  if (payload?.success !== true || !Array.isArray(games) || payload.result.gameTotalCount > games.length) throw Error('Incomplete schedule');
  const game = games.find(g => g?.gameId === id && g.gameDate === date);
  if (!game) throw Error('Game not found');
  const base = recapModel.summarizeGame(game);
  if (!base.available) return {gameId:id,gameDate:date,recap:base,fetchedAt:new Date().toISOString(),stale:false,source:'네이버 스포츠'};
  let relay = null;
  try { relay = await getRelay(id, fetcher, {allTeams:true,includeHighlights:true}); } catch {}
  const recap = recapModel.summarizeGame(game, relay);
  return {gameId:id,gameDate:date,recap,fetchedAt:new Date().toISOString(),stale:false,source:'네이버 스포츠'};
}
