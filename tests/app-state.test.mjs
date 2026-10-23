import * as liveModel from '../public/live-model.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import * as model from '../public/model.js';
// A minimal element adapter exercises application state and generated markup without a browser.
function harness(managed = false, storedNews = null) {
  const requests = [],
    storageWrites = [];
  const elements = new Map();
  class El {
    constructor(id) {
      this.id = id;
      this.dataset = {};
      this.value = id === 'rankTeam' ? 'HT' : '';
      this.hidden = false;
      this.innerHTML = '';
      this.textContent = '';
      this.classList = {
        add() {},
        remove() {},
        toggle() {},
        contains() {
          return false;
        },
      };
      this.attributes = {};
      this.listeners = {};
    }
    addEventListener(k, f) {
      this.listeners[k] = f;
    }
    setAttribute(k, v) {
      this.attributes[k] = v;
    }
    removeAttribute(k) {
      delete this.attributes[k];
    }
    querySelectorAll() {
      return [];
    }
    getBoundingClientRect() {
      return { top: 100, bottom: 300, width: 500 };
    }
    scrollIntoView() {}
    focus() {}
  }
  const el = (id) => {
    if (!elements.has(id)) elements.set(id, new El(id));
    return elements.get(id);
  };
  const now = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  const game = {
    gameId: '20261012LGHT02026',
    gameDate: now,
    gameDateTime: now + 'T18:30:00',
    statusCode: 'STARTED',
    statusInfo: '3회초',
    homeTeamCode: 'HT',
    homeTeamName: 'KIA',
    awayTeamCode: 'LG',
    awayTeamName: 'LG',
    homeTeamScore: 2,
    awayTeamScore: 1,
    stadium: '광주',
  };
  const data = {
    today: now,
    from: now,
    to: now,
    windowDays: 7,
    games: [game],
    fetchedAt: new Date().toISOString(),
    stale: false,
  };
  const ranks = JSON.parse(fs.readFileSync('worker/standings-snapshot.json'));
  const relay = {
    gameId: game.gameId,
    inning: 3,
    half: '초',
    state: {
      homeScore: 2,
      awayScore: 1,
      ball: 2,
      strike: 1,
      out: 1,
      base1: '42',
      base2: 0,
      base3: 0,
    },
    score: { home: { 1: 0, 2: 2 }, away: { 1: 0, 2: 1 } },
    plays: [
      {
        id: 1,
        inning: 2,
        half: '말',
        title: '안타',
        lines: [{ text: '적시타, 주자 득점' }],
      },
    ],
    fetchedAt: new Date().toISOString(),
  };
  const c = {
    ...model,
    ...liveModel,
    Intl,
    Date,
    URL,
    URLSearchParams,
    Map,
    Set,
    Array,
    Number,
    JSON,
    Math,
    Promise,
    Object,
    String,
    AbortSignal,
    Response,
    setTimeout,
    clearTimeout,
    setInterval() {},
    scrollY: 0,
    matchMedia: () => ({ matches: false }),
    localStorage: {
      getItem(key) {
        return key === 'kia-saved-news' ? storedNews : null;
      },
      setItem(key, value) {
        storageWrites.push([key, value]);
      },
    },
    navigator: { onLine: true },
    location: new URL('https://example.com/'),
    history: { replaceState() {} },
    HTMLImageElement: class {},
    requestAnimationFrame: (f) => f(),
    fetch: async (url) => (
      requests.push(url),
      Response.json(
        url.startsWith('/api/games')
          ? data
          : url.startsWith('/api/standings')
            ? ranks
            : url.startsWith('/api/news')
              ? {
                  articles: [
                    {
                      id: 'https://www.yna.co.kr/view/test',
                      url: 'https://www.yna.co.kr/view/test',
                      title: 'KIA 최신 기사',
                      publisher: '연합뉴스',
                      category: 'game',
                      publishedAt: new Date().toISOString(),
                    },
                  ],
                  fetchedAt: new Date().toISOString(),
                  stale: false,
                }
              : relay,
      )
    ),
    document: {
      getElementById: el,
      querySelectorAll() {
        return [];
      },
      addEventListener() {},
      documentElement: { dataset: { theme: 'light' } },
    },
    window: { kiaSeasonManaged: managed, addEventListener() {}, scrollTo() {} },
    console,
  };
  vm.createContext(c);
  let code = fs
    .readFileSync('public/app.js', 'utf8')
    .replace(/^import .*;\n/gm, '');
  code +=
    '\nglobalThis.inspect=()=>({lastData,relayData,gamesFailed,relayFailed,rankFailed,newsFailed,currentPage});globalThis.controls={chooseGame,setTab,renderLog,renderGames,refreshRelay,refreshGames,refreshAll,renderRelayEmpty,setView,renderSummary,refreshNews,refreshVideos,playVideo};globalThis.setData=(x)=>{lastData=x;renderGames()};globalThis.setRelay=(x)=>{relayData=x;renderSituation();renderSummary();renderLog()};';
  vm.runInContext(code, c);
  return { c, el, data, relay, game, requests, storageWrites };
}
test('application initializes all three data streams and generates meaningful visual markup', async () => {
  const { c, el } = harness();
  await c.controls.refreshAll();
  const s = c.inspect();
  assert.equal(s.gamesFailed, false);
  assert.equal(s.rankFailed, false);
  assert.equal(s.relayFailed, false);
  assert.equal(s.newsFailed, false);
  assert.match(el('newsList').innerHTML, /KIA 최신 기사/);
  assert.match(el('today').innerHTML, /LIVE/);
  assert.match(el('situationContent').innerHTML, /field-svg/);
  assert.match(el('situationContent').innerHTML, /1루 주자/);
  assert.match(el('situationContent').innerHTML, /polyline/);
  assert.match(el('standingsTable').innerHTML, /pct-bar/);
  assert.match(el('relayLog').innerHTML, /적시타/);
});
test('stale game state removes LIVE badge and changes the primary scoreboard warning', async () => {
  const { c, el, data } = harness();
  await c.controls.refreshAll();
  c.setData({ ...data, stale: true });
  assert.doesNotMatch(el('today').innerHTML, /LIVE/);
  assert.match(el('today').innerHTML, /갱신 지연/);
  assert.equal(el('notice').hidden, false);
});
test('missing base information is explicitly unknown, not an empty diamond claim', async () => {
  const { c, el, relay } = harness();
  await c.controls.refreshAll();
  c.setRelay({ ...relay, state: {} });
  assert.match(el('situationContent').innerHTML, /현재 주자 정보 없음/);
  assert.doesNotMatch(el('situationContent').innerHTML, /주자 없음/);
});
test('new commentary waits for consent while the reader is on the log tab', async () => {
  const { c, el, relay } = harness();
  await c.controls.refreshAll();
  c.controls.setTab('log');
  const old = el('relayLog').innerHTML;
  c.fetch = async () =>
    Response.json({
      ...relay,
      plays: [
        {
          id: 2,
          inning: 3,
          half: '초',
          title: '새 타석',
          lines: [{ text: '홈런' }],
        },
        ...relay.plays,
      ],
    });
  await c.controls.refreshRelay(true);
  assert.equal(el('relayLog').innerHTML, old);
  assert.equal(el('newPlays').hidden, false);
  assert.match(el('newPlays').textContent, /새 중계 1개/);
  el('newPlays').listeners.click();
  assert.match(el('relayLog').innerHTML, /홈런/);
});

test('navigation switches real panels, and selecting a finished game opens its automatic recap', async () => {
  const { c, el, data, game } = harness();
  await c.controls.refreshAll();
  c.controls.setView('news');
  assert.equal(c.inspect().currentPage, 'news');
  assert.equal(el('newsPage').hidden, false);
  assert.equal(el('homePage').hidden, true);
  assert.equal(el('miniScore').hidden, true);
  c.setData({
    ...data,
    games: [{ ...game, statusCode: 'RESULT', winner: 'HOME' }],
  });
  c.controls.chooseGame(game.gameId);
  assert.equal(c.inspect().currentPage, 'games');
  assert.equal(el('summaryPanel').hidden, false);
  assert.match(el('summaryContent').innerHTML, /기록 기반 자동 요약/);
  assert.match(el('summaryContent').innerHTML, /2–1 승리/);
  assert.match(el('featuredRecap').innerHTML, /종료 요약 읽기/);
});

test('video page loads dated cards, embeds verified IDs on click, and stops playback when leaving', async () => {
  const { c, el } = harness();
  await c.controls.refreshAll();
  const date = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  c.fetch = async () =>
    Response.json({
      videos: [
        {
          id: '3lp-50c1LPM',
          gameDate: date,
          title: 'LG vs KIA · 경기 하이라이트',
        },
      ],
      checkedDays: [date],
      fetchedAt: new Date().toISOString(),
    });
  c.controls.setView('videos');
  await c.controls.refreshVideos();
  assert.equal(el('videosPage').hidden, false);
  assert.match(el('videoList').innerHTML, /3lp-50c1LPM/);
  assert.doesNotMatch(el('videoPlayer').innerHTML, /iframe/);
  c.controls.playVideo('3lp-50c1LPM');
  assert.match(
    el('videoPlayer').innerHTML,
    /youtube-nocookie.com\/embed\/3lp-50c1LPM/,
  );
  c.controls.setView('home');
  assert.equal(el('videoPlayer').hidden, true);
  assert.equal(el('videoPlayer').innerHTML, '');
});

test('postseason bridge reuses native situation, innings, commentary and recap with actual non-KIA teams', async () => {
  const { c, el, data, relay } = harness();
  await c.controls.refreshAll();
  const game = {
    gameId: '44441014OBLG02026',
    gameDate: data.today,
    gameDateTime: data.today + 'T18:30:00',
    statusCode: 'STARTED',
    statusInfo: '7회초',
    homeTeamCode: 'LG',
    homeTeamName: 'LG',
    awayTeamCode: 'OB',
    awayTeamName: '두산',
    homeTeamScore: 2,
    awayTeamScore: 1,
    psRound: 'wc',
  };
  const d = {
    ...relay,
    gameId: game.gameId,
    inning: 7,
    state: { ...relay.state, homeScore: 2, awayScore: 1 },
  };
  const urls = [];
  c.fetch = async (u) => {
    urls.push(u);
    return Response.json(d);
  };
  c.window.kiaGameCenter.setPostseason({
    ...data,
    active: true,
    start: data.today,
    games: [game],
  });
  await c.controls.refreshRelay(true);
  assert.match(el('relayGame').innerHTML, /두산 vs LG/);
  assert.match(el('centerScore').innerHTML, /두산/);
  assert.match(el('centerScore').innerHTML, /LG/);
  assert.match(el('centerScore').innerHTML, /score-numbers/);
  assert.doesNotMatch(el('centerScore').innerHTML, /KIA/);
  assert.doesNotMatch(el('relayGame').innerHTML, /KIA/);
  assert.match(el('situationContent').innerHTML, /field-svg/);
  assert.match(el('situationContent').innerHTML, /inning-table/);
  assert.doesNotMatch(el('situationContent').innerHTML, /KIA/);
  assert.match(el('relayLog').innerHTML, /적시타/);
  assert.ok(urls.some((u) => u.startsWith('/api/postseason/relay?')));
  c.window.kiaGameCenter.setPostseason({
    ...data,
    start: data.today,
    games: [{ ...game, statusCode: 'RESULT', winner: 'HOME' }],
  });
  await c.controls.refreshRelay(true);
  assert.match(el('summaryContent').innerHTML, /두산, LG 상대/);
  assert.doesNotMatch(el('summaryContent').innerHTML, /KIA/);
  assert.match(el('recentPanel').innerHTML, /두산 · LG/);
  assert.equal(el('recentTitle').textContent, '포스트시즌 결과');
  assert.doesNotMatch(el('recentPanel').innerHTML, /form-summary/);
});
test('regular-season refresh cannot overwrite active postseason center', async () => {
  const { c, data } = harness();
  await c.controls.refreshAll();
  c.window.kiaGameCenter.setPostseason({
    ...data,
    start: data.today,
    games: [],
  });
  let called = false;
  c.fetch = async () => {
    called = true;
    return Response.json(data);
  };
  await c.controls.refreshGames(true);
  assert.equal(called, false);
  assert.equal(c.inspect().lastData.games.length, 0);
});

test('game-center scoreboard follows game selection, updates scores and removes live badge when stale', async () => {
  const { c, el, data, game } = harness();
  await c.controls.refreshAll();
  assert.match(el('centerScore').innerHTML, /LIVE/);
  const other = {
    ...game,
    gameId: '20261013SSHT02026',
    awayTeamCode: 'SS',
    awayTeamName: '삼성',
    awayTeamScore: 5,
    homeTeamScore: 6,
  };
  c.setData({ ...data, games: [game, other] });
  c.controls.chooseGame(other.gameId, { scroll: false });
  assert.match(el('centerScore').innerHTML, /삼성/);
  assert.match(el('centerScore').innerHTML, />6<\/span>/);
  c.setData({ ...data, stale: true, games: [{ ...other, homeTeamScore: 7 }] });
  assert.match(el('centerScore').innerHTML, />7<\/span>/);
  assert.match(el('centerScore').innerHTML, /갱신 지연/);
  assert.doesNotMatch(el('centerScore').innerHTML, /LIVE/);
});

test('center recovers missing schedule scores from matching relay including zero', async () => {
  const { c, el, data, game, relay } = harness();
  await c.controls.refreshAll();
  c.setData({
    ...data,
    games: [{ ...game, homeTeamScore: null, awayTeamScore: null }],
  });
  c.fetch = async () =>
    Response.json({ ...relay, state: { homeScore: 0, awayScore: 3 } });
  await c.controls.refreshRelay(true);
  assert.match(el('centerScore').innerHTML, />0<\/span>/);
  assert.match(el('centerScore').innerHTML, />3<\/span>/);
});
test('settings is a native route and does not leave game panels visible', async () => {
  const { c, el } = harness();
  await c.controls.refreshAll();
  c.controls.setView('settings');
  assert.equal(c.inspect().currentPage, 'settings');
  assert.equal(el('settingsPage').hidden, false);
  assert.equal(el('gamesPage').hidden, true);
  assert.equal(el('homePage').hidden, true);
  assert.match(el('pageTitle').innerHTML, /다이아몬드/);
});

test('season-managed startup does not request regular data before season resolution', async () => {
  const { c, requests } = harness(true);
  await Promise.resolve();
  assert.deepEqual(requests, []);
  await c.window.kiaRegularStart();
  assert.ok(requests.some((u) => u.startsWith('/api/games')));
  assert.ok(requests.some((u) => u === '/api/standings'));
});

test('win probability stays below center scoreboard across tabs and finished or scheduled games', async () => {
  const { c, el, data, game } = harness();
  await c.controls.refreshAll();
  assert.match(el('centerScore').innerHTML, /외부 사이트 승리 예측/);
  assert.doesNotMatch(el('centerScore').innerHTML, /win-meter/);
  assert.match(el('centerScore').innerHTML, /실시간 승률이 아닙니다/);
  c.controls.setTab('log');
  assert.match(el('centerScore').innerHTML, /외부 사이트 승리 예측/);
  c.setData({
    ...data,
    games: [{ ...game, statusCode: 'RESULT', winner: 'HOME' }],
  });
  assert.match(el('centerScore').innerHTML, /최종 결과/);
  assert.match(el('centerScore').innerHTML, /KIA 승리/);
  assert.doesNotMatch(el('centerScore').innerHTML, /win-meter/);
  c.setData({ ...data, games: [{ ...game, statusCode: 'BEFORE' }] });
  assert.match(el('centerScore').innerHTML, /경기 전 승리 예측/);
  assert.doesNotMatch(el('centerScore').innerHTML, /51%/);
  assert.match(el('centerScore').innerHTML, /자료 확인 중/);
});
test('finished away win displays the winning team score first', async () => {
  const { c, el, data, game } = harness();
  await c.controls.refreshAll();
  const awayWin = {
    ...game,
    statusCode: 'RESULT',
    winner: 'AWAY',
    homeTeamCode: 'LG',
    homeTeamName: 'LG',
    homeTeamScore: 1,
    awayTeamCode: 'HT',
    awayTeamName: 'KIA',
    awayTeamScore: 13,
  };
  c.setData({ ...data, games: [awayWin] });
  assert.match(el('centerScore').innerHTML, /KIA 승리 · 13–1 경기 종료/);
  assert.doesNotMatch(el('centerScore').innerHTML, /KIA 승리 · 1–13/);
});

test('invalid saved-news entries do not break fresh or saved news and valid bookmarks survive', async () => {
  const article = {
    id: 'https://www.yna.co.kr/view/test',
    url: 'https://www.yna.co.kr/view/test',
    title: 'KIA 최신 기사',
    publisher: '연합뉴스',
    category: 'game',
    publishedAt: new Date().toISOString(),
  };
  const stored = JSON.stringify([
    null,
    {},
    17,
    { ...article, id: 'unsafe', url: 'javascript:alert(1)' },
    article,
  ]);
  const { c, el, storageWrites } = harness(true, stored);
  await c.controls.refreshNews();
  assert.equal(c.inspect().newsFailed, false);
  assert.match(el('newsList').innerHTML, /KIA 최신 기사/);
  assert.match(el('newsList').innerHTML, /aria-pressed="true"/);
  assert.match(el('homeNews').innerHTML, /KIA 최신 기사/);
  vm.runInContext("newsFilter='saved';renderNews()", c);
  assert.equal((el('newsList').innerHTML.match(/<article /g) || []).length, 1);
  assert.doesNotMatch(el('newsList').innerHTML, /javascript:|unsafe/);
  assert.equal(
    storageWrites.some(([key]) => key === 'kia-saved-news'),
    false,
  );
});

test('saved-news search distinguishes no matches from no bookmarks', () => {
  const article = {
    id: 'https://www.yna.co.kr/view/search-test',
    url: 'https://www.yna.co.kr/view/search-test',
    title: 'KIA 검색 테스트', publisher: '연합뉴스', category: 'game',
    publishedAt: new Date().toISOString(),
  };
  const { c, el, storageWrites } = harness(true, JSON.stringify([article]));
  vm.runInContext("newsFilter='saved';newsQuery='일치하지않음';renderNews()", c);
  assert.match(el('newsList').innerHTML, /검색어와 일치하는 기사가 없어요/);
  assert.doesNotMatch(el('newsList').innerHTML, /저장한 기사가 없어요/);
  vm.runInContext("newsQuery='';renderNews()", c);
  assert.match(el('newsList').innerHTML, /KIA 검색 테스트/);
  vm.runInContext("savedNews=[];renderNews()", c);
  assert.match(el('newsList').innerHTML, /저장한 기사가 없어요/);
  assert.equal(storageWrites.some(([key]) => key === 'kia-saved-news'), false);
});
