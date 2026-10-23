export const PS_ROUNDS = [
  { id: 'wc', name: '와일드카드', code: 'WC', rule: '4위는 1승 또는 1무 · 5위는 2승' },
  { id: 'semi', name: '준플레이오프', code: '준PO', rule: '5전 3선승' },
  { id: 'po', name: '플레이오프', code: 'PO', rule: '5전 3선승' },
  { id: 'ks', name: '한국시리즈', code: 'KS', rule: '7전 4선승' }
];
export function postseasonRound(g) {
  const code = String(g.roundCode || '').toLowerCase(),
    name = String(g.roundName || g.title || '');
  if (/와일드|wild/i.test(name) || /kbo_ps_(wd|wc)$/.test(code)) return 'wc';
  if (/준플레이|준po/i.test(name) || /kbo_ps_(sp|semi|s|j|s_po)$/.test(code)) return 'semi';
  if (/한국시리즈|korean/i.test(name) || /kbo_ps_(ks|k)$/.test(code)) return 'ks';
  if (/플레이오프|playoff/i.test(name) || /kbo_ps_(po|p)$/.test(code)) return 'po';
  return null;
}
export function postseasonState(games, today) {
  const year = today.slice(0, 4),
    ps = games
      .filter((g) => g.gameDate?.startsWith(year) && postseasonRound(g))
      .map((g) => ({ ...g, psRound: postseasonRound(g) }))
      .sort((a, b) => a.gameDateTime.localeCompare(b.gameDateTime));
  const first = ps[0]?.gameDate || (year === '2026' ? '2026-10-14' : null);
  const finals = ps.filter(
      (g) => g.psRound === 'ks' && g.statusCode === 'RESULT' && !g.cancel && !g.suspended
    ),
    wins = {};
  let ended = null;
  for (const g of finals) {
    const winner =
      g.winner === 'HOME' ? g.homeTeamCode : g.winner === 'AWAY' ? g.awayTeamCode : null;
    if (winner) {
      wins[winner] = (wins[winner] || 0) + 1;
      if (wins[winner] >= 4) ended = g.gameDate;
    }
  }
  return {
    games: ps,
    active: !!first && today >= first && (!ended || today <= ended) && today <= year + '-12-15',
    start: first,
    ended,
    today,
    year
  };
}
export async function fetchPostseason(fetcher = fetch, now = new Date()) {
  const today = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Seoul',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(now),
    year = today.slice(0, 4);
  const params = new URLSearchParams({
    fields: 'basic,schedule,baseball',
    upperCategoryId: 'kbaseball',
    categoryId: 'kbo',
    fromDate: year + '-09-01',
    toDate: year + '-12-15',
    size: '500'
  });
  const r = await fetcher('https://api-gw.sports.naver.com/schedule/games?' + params, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(12000)
  });
  if (!r.ok) throw Error('Schedule unavailable');
  const p = await r.json();
  if (
    !p.success ||
    !Array.isArray(p.result?.games) ||
    p.result.gameTotalCount > p.result.games.length
  )
    throw Error('Incomplete postseason schedule');
  return {
    ...postseasonState(p.result.games, today),
    fetchedAt: now.toISOString(),
    stale: false,
    source: '네이버 스포츠',
    rounds: PS_ROUNDS
  };
}
