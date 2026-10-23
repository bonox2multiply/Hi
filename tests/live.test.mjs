import test from 'node:test';
import assert from 'node:assert/strict';
import { liveSummary, winEstimate, pregameEstimate } from '../public/live-model.js';
import { normalizeClips } from '../worker/clips.js';
const now = Date.now(),
  g = {
    gameId: '20261012LGHT02026',
    statusCode: 'STARTED',
    homeTeamCode: 'HT',
    homeTeamName: 'KIA',
    awayTeamName: 'LG'
  },
  d = {
    gameId: g.gameId,
    inning: 8,
    half: '말',
    state: { homeScore: 5, awayScore: 2, out: 1, base1: 0, base2: 0, base3: 0 },
    fetchedAt: new Date(now).toISOString(),
    plays: []
  };
test('live summary uses relay scores, not stale schedule scores or final language', () => {
  assert.match(liveSummary(g, d, now).lead, /3점 차/);
  assert.doesNotMatch(liveSummary(g, d, now).lead, /승리|종료/);
  assert.equal(liveSummary({ ...g, statusCode: 'BEFORE' }, d, now), null);
  assert.equal(liveSummary(g, { ...d, gameId: 'other' }, now), null);
});
test('estimate responds to score and suppresses missing, ended, stale states', () => {
  const p = winEstimate(g, d, now);
  assert.equal(p.home + p.away, 100);
  assert.ok(p.home > 50);
  assert.ok(winEstimate(g, { ...d, state: { ...d.state, homeScore: 1 } }, now).home < p.home);
  for (const patch of [
    { stale: true },
    { fetchedAt: new Date(now - 180000).toISOString() },
    { state: { homeScore: null, awayScore: 2 } }
  ])
    assert.equal(winEstimate(g, { ...d, ...patch }, now), null);
  assert.equal(winEstimate({ ...g, statusCode: 'RESULT' }, d, now), null);
});
test('clip catalogue filters wrong games and disabled items, deduplicates and uses safe player URLs', () => {
  const v = { gameId: g.gameId, sportsVideoId: 123, title: '홈런', clipNo: '456' };
  const r = normalizeClips(
    {
      success: true,
      result: {
        vodList: [
          v,
          v,
          { ...v, sportsVideoId: 2, gameId: 'other' },
          { ...v, sportsVideoId: 3, enable: false },
          { ...v, sportsVideoId: 4, clipNo: 'javascript:bad' }
        ]
      }
    },
    g.gameId
  );
  assert.equal(r.clips.length, 2);
  assert.equal(r.clips[0].embedUrl, 'https://tv.naver.com/embed/456');
  assert.equal(r.clips[1].embedUrl, null);
  assert.throws(() => normalizeClips({ success: false }, g.gameId));
});

test('pregame estimate never manufactures numbers without matching fresh evidence', () => {
  const scheduled = { ...g, statusCode: 'BEFORE', awayTeamCode: 'LG' };
  assert.equal(pregameEstimate(scheduled), null);
  const e = {
    gameId: g.gameId,
    fetchedAt: new Date().toISOString(),
    primary: 'test',
    sources: [{ source: 'test', available: true, home: 57, away: 43 }]
  };
  assert.deepEqual(pregameEstimate(scheduled, e), { home: 57, away: 43 });
  for (const patch of [{ stale: true }, { gameId: 'wrong' }, { fetchedAt: '2020-01-01' }])
    assert.equal(pregameEstimate(scheduled, { ...e, ...patch }), null);
});
test('live external outlook preserves provider values and rejects invalid timestamps or totals', () => {
  const e = {
    gameId: g.gameId,
    fetchedAt: new Date().toISOString(),
    primary: 'source',
    sources: [{ source: 'source', available: true, home: 57, away: 43 }]
  };
  assert.deepEqual(pregameEstimate(g, e), { home: 57, away: 43 });
  assert.equal(pregameEstimate(g, { ...e, fetchedAt: 'invalid' }), null);
  assert.equal(pregameEstimate(g, { ...e, sources: [{ ...e.sources[0], home: 90 }] }), null);
  assert.equal(pregameEstimate({ ...g, statusCode: 'RESULT' }, e), null);
});
