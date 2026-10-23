// Read the same public KBO highlight catalogue used by its official highlights page.
export function videoDays(now = new Date()) {
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(now);
  return Array.from({ length: 7 }, (_, i) =>
    new Date(Date.parse(today + 'T12:00:00Z') - i * 86400000).toISOString().slice(0, 10)
  );
}
export function videoRows(data, date, allTeams = false) {
  if (!Array.isArray(data?.row) || String(data.code) !== '100')
    throw Error('Invalid highlight catalogue');
  const compact = date.replaceAll('-', '');
  return data.row
    .filter(
      (r) =>
        /^\d{8}[A-Z]{4}\d$/.test(r.G_ID) &&
        r.G_ID.startsWith(compact) &&
        (allTeams || [r.G_ID.slice(8, 10), r.G_ID.slice(10, 12)].includes('HT'))
    )
    .flatMap((r) => {
      let u;
      try {
        u = new URL(r.URL_LK, 'https://www.koreabaseball.com');
      } catch {
        return [];
      }
      if (
        u.origin !== 'https://www.koreabaseball.com' ||
        u.pathname !== '/MediaNews/Highlight/View.aspx' ||
        u.searchParams.get('gameId') !== r.G_ID
      )
        return [];
      return [
        {
          gameId: r.G_ID,
          gameDate: date,
          title: String(r.BD_TT).slice(0, 160) + ' · 경기 하이라이트',
          sourceUrl: u.href,
          source: 'KBO 공식 하이라이트'
        }
      ];
    });
}
export function youtubeVideoId(html) {
  return (
    html.match(
      /https:\/\/(?:www\.)?youtube(?:-nocookie)?\.com\/embed\/([a-zA-Z0-9_-]{11})(?=[?"'\s<])/i
    )?.[1] || null
  );
}
export async function fetchVideos(fetcher = fetch, now = new Date(), postseasonGames = null) {
  const days = postseasonGames
      ? [
          ...new Set(
            postseasonGames
              .filter((g) => g.statusCode === 'RESULT' && !g.cancel)
              .map((g) => g.gameDate)
          )
        ]
          .sort()
          .reverse()
      : videoDays(now),
    headers = {
      'User-Agent': 'Mozilla/5.0',
      'Referer': 'https://www.koreabaseball.com/MediaNews/Highlight/List.aspx',
      'X-Requested-With': 'XMLHttpRequest'
    };
  const read = async (url) => {
    const r = await fetcher(url, { headers, signal: AbortSignal.timeout(10000) });
    if (!r.ok) throw Error('Highlights unavailable');
    const text = await r.text();
    if (text.length > 1500000) throw Error('Unexpected highlight size');
    return text;
  };
  const results = await Promise.allSettled(
    days.map(async (date) => {
      const raw = await read(
        'https://www.koreabaseball.com/ws/KboTv.asmx/GetHighlight?' +
          new URLSearchParams({ bdSc: '1', leId: '1', gameDate: date.replaceAll('-', '') })
      );
      return {
        date,
        rows: videoRows(JSON.parse(raw.replace(/^\uFEFF/, '')), date, !!postseasonGames)
      };
    })
  );
  if (!days.length)
    return {
      videos: [],
      days: [],
      checkedDays: [],
      fetchedAt: now.toISOString(),
      stale: false,
      partial: false
    };
  const good = results.filter((r) => r.status === 'fulfilled').map((r) => r.value);
  if (!good.length) throw Error('Highlight catalogue unavailable');
  const videos = await Promise.allSettled(
    good
      .flatMap((d) => d.rows)
      .filter(
        (v) =>
          !postseasonGames ||
          postseasonGames.some(
            (g) =>
              g.gameDate === v.gameDate &&
              g.awayTeamCode === v.gameId.slice(8, 10) &&
              g.homeTeamCode === v.gameId.slice(10, 12)
          )
      )
      .slice(0, 40)
      .map(async (v) => {
        const id = youtubeVideoId(await read(v.sourceUrl));
        return {
          ...v,
          psRound: postseasonGames?.find(
            (g) =>
              g.gameDate === v.gameDate &&
              g.awayTeamCode === v.gameId.slice(8, 10) &&
              g.homeTeamCode === v.gameId.slice(10, 12)
          )?.psRound,
          id,
          availability: id ? 'ready' : 'unavailable'
        };
      })
  );
  const entries = videos.filter((v) => v.status === 'fulfilled').map((v) => v.value),
    seen = new Set();
  return {
    videos: entries
      .filter((v) => {
        const key = v.gameId + ':' + v.id;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort((a, b) => b.gameDate.localeCompare(a.gameDate)),
    days,
    checkedDays: good.map((g) => g.date),
    fetchedAt: now.toISOString(),
    stale: false,
    partial: good.length < days.length || videos.some((v) => v.status === 'rejected'),
    windowDays: 7
  };
}
