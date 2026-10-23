const PREDICT_ORIGIN = 'https://kbo-predictor.vercel.app';
const BREAD_ORIGIN = 'https://baseball.soundbread.com';
const PREGAME_TEAMS = {
  HT: ['KIA', 'kia'],
  LG: ['LG', 'lg'],
  OB: ['두산', 'doosan'],
  SS: ['삼성', 'samsung'],
  SK: ['SSG', 'ssg'],
  HH: ['한화', 'hanwha'],
  LT: ['롯데', 'lotte'],
  NC: ['NC', 'nc'],
  KT: ['KT', 'kt'],
  WO: ['키움', 'kiwoom']
};
const preText = (s) =>
  String(s || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
const preNumber = (n) =>
  n !== null && n !== '' && n !== undefined && Number.isFinite(Number(n)) ? Number(n) : null;
const preName = (v) => (typeof v === 'string' ? v : v?.name || v?.playerName || '');
export function parseLineupPrediction(payload, g) {
  const date = g.gameDate.replaceAll('-', '');
  if (payload.date !== date || !Array.isArray(payload.predictions))
    throw Error('Prediction date mismatch');
  const matches = payload.predictions.filter(
    (p) =>
      p.gameDate === date &&
      p.homeTeamId === g.homeTeamCode &&
      p.awayTeamId === g.awayTeamCode &&
      (!p.gameId || p.gameId === date + g.gameId.slice(8, 13))
  );
  if (matches.length !== 1) throw Error('Prediction game mismatch');
  const p = matches[0];
  const h = preNumber(p.homeWinProbability),
    a = preNumber(p.awayWinProbability);
  const ready =
    p.status === 'ready' &&
    p.lineupConfirmed === true &&
    payload.modelStatus === 'ready' &&
    payload.probabilityBasis === 'decisive_nine_innings' &&
    h !== null &&
    a !== null &&
    h > 0 &&
    h < 1 &&
    a > 0 &&
    a < 1 &&
    Math.abs(h + a - 1) < 0.001;
  for (const side of ['home', 'away']) {
    const starter = preName(p[side + 'Starter']);
    if (g[side + 'StarterName'] && starter && g[side + 'StarterName'] !== starter)
      throw Error('Starting pitcher changed');
  }
  const lineup = (side) =>
    (p[side + 'Lineup'] || [])
      .slice(0, 9)
      .map((x, i) => ({
        name: preName(x),
        order: Number(x.order || x.batOrder || i + 1),
        ops: preNumber(x.ops)
      }))
      .filter((x) => x.name);
  const diag = p.modelInputs?.diagnostics || p.diagnostics;
  return {
    source: 'KBO 승부 예측',
    url: PREDICT_ORIGIN + '/?date=' + date,
    available: ready,
    home: ready ? Math.round(h * 1000) / 10 : null,
    away: ready ? Math.round(a * 1000) / 10 : null,
    basis: '9이닝 동점 제외 조건부 확률',
    reason: ready ? null : '확정 라인업 또는 경기별 모델 예측이 아직 제공되지 않았어요.',
    starters: { home: preName(p.homeStarter), away: preName(p.awayStarter) },
    lineups: { home: lineup('home'), away: lineup('away') },
    lineupConfirmed: !!p.lineupConfirmed,
    asOf: payload.asOfTimestamp || null,
    metrics: diag
      ? ['home', 'away'].map((side) => ({
          side,
          lineupOps: preNumber(diag[side]?.lineupOps),
          starterFip: preNumber(diag[side]?.starter?.fip),
          bullpenFip: preNumber(diag[side]?.bullpen?.fip)
        }))
      : []
  };
}
export function parseBreadPrediction(html, g, url) {
  const h = PREGAME_TEAMS[g.homeTeamCode]?.[0],
    a = PREGAME_TEAMS[g.awayTeamCode]?.[0];
  const title = preText(html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/)?.[1]);
  if (
    !h ||
    !a ||
    !title.startsWith(a + ' ') ||
    !title.includes('vs ' + h + ' ') ||
    !new RegExp('일시:</strong>\\s*' + g.gameDate).test(html)
  )
    throw Error('Prediction matchup mismatch');
  const block = html.split('예측 결과')[1]?.split('핵심 요인')[0] || '';
  const values = [
    ...block.matchAll(/<span[^>]*class="fw-bold"[^>]*>\s*([^<]+?)\s+(\d+(?:\.\d+)?)%\s*<\/span>/g)
  ].map((m) => ({ team: m[1], p: Number(m[2]) }));
  const hp = values.find((v) => v.team === h)?.p,
    ap = values.find((v) => v.team === a)?.p;
  if (
    !Number.isFinite(hp) ||
    !Number.isFinite(ap) ||
    hp <= 0 ||
    hp >= 100 ||
    Math.abs(hp + ap - 100) > 0.2
  )
    throw Error('Invalid probability');
  const starters = [...html.matchAll(/선발:\s*([^<]+)</g)].map((m) => preText(m[1]));
  if (starters.length !== 2) throw Error('Missing prediction starters');
  for (const [i, side] of [
    [0, 'away'],
    [1, 'home']
  ])
    if (g[side + 'StarterName'] && g[side + 'StarterName'] !== starters[i])
      throw Error('Starting pitcher changed');
  const categories = [
    ...new Set([...html.matchAll(/category-badge cat-[^"]+">([^<]+)</g)].map((m) => preText(m[1])))
  ];
  return {
    source: '오늘야구',
    url,
    available: true,
    home: hp,
    away: ap,
    basis: '제공처 승리예측 · 무승부 처리 기준 미공개',
    starters: { away: starters[0], home: starters[1] },
    factors: categories,
    lineupConfirmed: false,
    asOf: null
  };
}
export function recentLineup(raw, gameId, side) {
  const t = raw?.result?.textRelayData;
  if (raw.success !== true || t?.gameId !== gameId) throw Error('Wrong lineup game');
  const seen = new Set();
  return (t[side + 'Lineup']?.batter || [])
    .filter((p) => Number(p.batOrder) >= 1 && Number(p.batOrder) <= 9 && !p.cin)
    .sort((a, b) => Number(a.seqno) - Number(b.seqno))
    .filter((p) => {
      if (seen.has(p.batOrder)) return false;
      seen.add(p.batOrder);
      return true;
    })
    .map((p) => ({ name: String(p.name), order: Number(p.batOrder) }))
    .sort((a, b) => a.order - b.order);
}
export async function fetchPregame(gameId, fetcher = fetch, now = new Date()) {
  const read = async (url, json = true) => {
    const r = await fetcher(url, {
      headers: { Accept: json ? 'application/json' : 'text/html' },
      signal: AbortSignal.timeout(14000)
    });
    if (!r.ok) throw Error('Source unavailable');
    return json ? r.json() : r.text();
  };
  const scheduleYear = /20\d{2}$/.test(gameId)
    ? gameId.slice(-4)
    : /^20\d{2}/.test(gameId)
      ? gameId.slice(0, 4)
      : String(now.getUTCFullYear());
  const date = scheduleYear + '-' + gameId.slice(4, 6) + '-' + gameId.slice(6, 8),
    from = new Date(Date.parse(date + 'T12:00:00Z') - 14 * 86400000).toISOString().slice(0, 10);
  const schedule = await read(
    'https://api-gw.sports.naver.com/schedule/games?' +
      new URLSearchParams({
        fields: 'basic,schedule,baseball',
        upperCategoryId: 'kbaseball',
        categoryId: 'kbo',
        fromDate: from,
        toDate: date,
        size: '500'
      })
  );
  if (
    schedule.success !== true ||
    !Array.isArray(schedule.result?.games) ||
    schedule.result.gameTotalCount > schedule.result.games.length
  )
    throw Error('Invalid schedule');
  const games = schedule.result.games,
    g = games.find((x) => x.gameId === gameId);
  if (!g || g.gameDate !== date) throw Error('Unknown game');
  const base = {
    gameId,
    gameDate: date,
    fetchedAt: now.toISOString(),
    stale: false,
    sources: [],
    expectedLineups: {},
    starters: { home: g.homeStarterName || '', away: g.awayStarterName || '' }
  };
  if (!['BEFORE', 'STARTED', 'PLAYING'].includes(g.statusCode) || g.cancel || g.suspended)
    return { ...base, status: 'not_pregame' };
  const pairCount = games.filter(
    (x) =>
      x.gameDate === date && x.homeTeamCode === g.homeTeamCode && x.awayTeamCode === g.awayTeamCode
  ).length;
  const breadUrl =
    BREAD_ORIGIN +
    '/game/' +
    date +
    '/' +
    PREGAME_TEAMS[g.awayTeamCode]?.[1] +
    '-vs-' +
    PREGAME_TEAMS[g.homeTeamCode]?.[1];
  const tasks = [
    (async () =>
      parseLineupPrediction(
        await read(
          PREDICT_ORIGIN +
            '/api/predictions/gameday?' +
            new URLSearchParams({ date: date.replaceAll('-', ''), includeFinished: 'true' })
        ),
        g
      ))(),
    (async () => {
      if (pairCount !== 1) throw Error('Ambiguous doubleheader');
      return parseBreadPrediction(await read(breadUrl, false), g, breadUrl);
    })()
  ];
  const expected = ['home', 'away'].map(async (side) => {
    const code = g[side + 'TeamCode'];
    const prev = games
      .filter(
        (x) =>
          x.gameDate < date &&
          x.statusCode === 'RESULT' &&
          !x.cancel &&
          [x.homeTeamCode, x.awayTeamCode].includes(code)
      )
      .sort((a, b) => b.gameDateTime.localeCompare(a.gameDateTime))[0];
    if (!prev) return [side, null];
    const roster = recentLineup(
      await read('https://api-gw.sports.naver.com/schedule/games/' + prev.gameId + '/relay'),
      prev.gameId,
      prev.homeTeamCode === code ? 'home' : 'away'
    );
    return [
      side,
      {
        players: roster,
        date: prev.gameDate,
        url: 'https://m.sports.naver.com/game/' + prev.gameId + '/record',
        status: '직전 경기 선발 타순 기반 예상 · 출전 미확정'
      }
    ];
  });
  const [sources, lineups] = await Promise.all([
    Promise.allSettled(tasks),
    Promise.allSettled(expected)
  ]);
  base.sources = sources.map((r, i) =>
    r.status === 'fulfilled'
      ? r.value
      : {
          source: i ? '오늘야구' : 'KBO 승부 예측',
          url: i ? breadUrl : PREDICT_ORIGIN,
          available: false,
          reason: '해당 경기 예측을 확인하지 못했어요.'
        }
  );
  for (const r of lineups)
    if (r.status === 'fulfilled' && r.value[1]) base.expectedLineups[r.value[0]] = r.value[1];
  const primary =
    base.sources.find((s) => s.available && s.lineupConfirmed) ||
    base.sources.find((s) => s.available);
  return { ...base, status: primary ? 'ready' : 'pending', primary: primary?.source || null };
}
