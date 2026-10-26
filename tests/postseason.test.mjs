import test from 'node:test';
import assert from 'node:assert/strict';
import { postseasonRound, postseasonState, fetchPostseason } from '../worker/postseason.js';
import { parseNewsFeed, NEWS_SOURCES } from '../worker/news.js';
import { videoRows, fetchVideos } from '../worker/videos.js';
import { getRelay } from '../worker/relay.js';
const game = {
  gameId: '44441014OBLG02026',
  gameDate: '2026-10-14',
  gameDateTime: '2026-10-14T18:30:00',
  homeTeamCode: 'LG',
  awayTeamCode: 'OB',
  homeTeamName: 'LG',
  awayTeamName: '두산',
  statusCode: 'STARTED',
  roundCode: 'kbo_ps_wd'
};
test('provider round codes separate all four rounds from regular-season games', () => {
  for (const [code, id] of [
    ['wd', 'wc'],
    ['sp', 'semi'],
    ['po', 'po'],
    ['ks', 'ks']
  ])
    assert.equal(postseasonRound({ roundCode: 'kbo_ps_' + code }), id);
  assert.equal(postseasonRound({ roundCode: 'kbo_r' }), null);
});
test('automatic mode activates at KST postseason start including rest days and deactivates after final', () => {
  assert.equal(postseasonState([game], '2026-10-13').active, false);
  assert.equal(postseasonState([game], '2026-10-14').active, true);
  assert.equal(postseasonState([game], '2026-10-16').active, true);
  const finals = Array.from({ length: 4 }, (_, i) => ({
    ...game,
    gameDate: '2026-11-0' + (i + 1),
    gameDateTime: '2026-11-0' + (i + 1) + 'T18:30:00',
    roundCode: 'kbo_ps_ks',
    statusCode: 'RESULT',
    winner: 'HOME'
  }));
  assert.equal(postseasonState([game, ...finals], '2026-11-04').active, true);
  assert.equal(postseasonState([game, ...finals], '2026-11-05').active, false);
  assert.equal(postseasonState([game], '2027-03-01').active, false);
});
test('league-wide feed retains non-KIA postseason games and rejects incomplete data', async () => {
  const urls=[];
  const d = await fetchPostseason(async (u) => {
    urls.push(u);
    return Response.json({
      success: true,
      result: { games: [game, { ...game, roundCode: 'kbo_r' }], gameTotalCount: 2 }
    });
  }, new Date('2026-10-13T15:01:00Z'));
  assert.equal(d.today, '2026-10-14');
  assert.equal(d.games.length, 1);
  assert.equal(d.games[0].awayTeamCode, 'OB');
  assert.equal(urls.length,4);
  assert.match(urls[0], /fromDate=2026-09-01/);
  await assert.rejects(
    fetchPostseason(async () =>
      Response.json({ success: true, result: { games: [], gameTotalCount: 10 } })
    )
  );
});
test('postseason news divides KIA and other clubs, excludes unrelated sports and regular news', () => {
  const now = new Date('2026-10-14T11:00:00Z');
  const xml =
    '<rss><channel>' +
    ['KIA 가을야구 준비', 'LG 두산 와일드카드 승부', 'KIA 스프링캠프 소식', '미국 축구 플레이오프']
      .map(
        (title, i) =>
          `<item><title>${title}</title><link>https://www.yna.co.kr/view/${i}</link><pubDate>${now.toUTCString()}</pubDate></item>`
      )
      .join('') +
    '</channel></rss>';
  const rows = parseNewsFeed(xml, NEWS_SOURCES[0], now, true);
  assert.equal(rows.length, 2);
  assert.deepEqual(
    rows.map((r) => r.team),
    ['kia', 'other']
  );
});
test('postseason videos include non-KIA games without changing regular filters', async () => {
  const d = {
    code: 100,
    row: [
      {
        G_ID: '20261014OBLG0',
        URL_LK: '/MediaNews/Highlight/View.aspx?gameId=20261014OBLG0',
        BD_TT: '두산 vs LG'
      }
    ]
  };
  assert.equal(videoRows(d, '2026-10-14').length, 0);
  assert.equal(videoRows(d, '2026-10-14', true).length, 1);
  const empty = await fetchVideos(
    () => {
      throw Error('must not fetch');
    },
    new Date(),
    []
  );
  assert.deepEqual(empty.videos, []);
});
test('postseason relay accepts non-KIA identifiers only through allTeams opt-in', async () => {
  const fetcher = async () =>
    Response.json({
      success: true,
      result: { textRelayData: { gameId: game.gameId, textRelays: [] } }
    });
  await assert.rejects(getRelay(game.gameId, fetcher));
  const r = await getRelay(game.gameId, fetcher, { allTeams: true });
  assert.equal(r.gameId, game.gameId);
});
