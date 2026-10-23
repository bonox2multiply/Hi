export function dateWindow(now = new Date(), days = 7) {
  days = days === 30 ? 30 : 7;
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(now);
  const shift = (n) =>
    new Date(Date.parse(today + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);
  return {
    today,
    from: shift(-days),
    to: shift(days),
    windowDays: days,
    yesterday: shift(-1),
    tomorrow: shift(1)
  };
}
export function normalize(payload, window) {
  const r = payload?.result;
  if (payload.success !== true || !Array.isArray(r?.games))
    throw Error('Invalid provider response');
  if (r.gameTotalCount > r.games.length) throw Error('Incomplete provider response');
  const seen = new Set();
  return r.games
    .filter((g) => {
      if (!g.gameId || !g.gameDate || !g.gameDateTime || !g.statusCode)
        throw Error('Missing game fields');
      if (seen.has(g.gameId)) return false;
      seen.add(g.gameId);
      return (
        (g.homeTeamCode === 'HT' || g.awayTeamCode === 'HT') &&
        g.gameDate >= window.from &&
        g.gameDate <= window.to
      );
    })
    .sort((a, b) => a.gameDateTime.localeCompare(b.gameDateTime));
}
export async function getGames(now, fetcher = fetch, days = 7) {
  const window = dateWindow(now, days);
  const params = new URLSearchParams({
    fields: 'basic,schedule,baseball',
    upperCategoryId: 'kbaseball',
    categoryId: 'kbo',
    fromDate: window.from,
    toDate: window.to,
    size: '500'
  });
  const response = await fetcher('https://api-gw.sports.naver.com/schedule/games?' + params, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(10000)
  });
  if (!response.ok) throw Error('Provider unavailable');
  return {
    ...window,
    games: normalize(await response.json(), window),
    fetchedAt: new Date().toISOString(),
    stale: false,
    source: '네이버 스포츠'
  };
}
