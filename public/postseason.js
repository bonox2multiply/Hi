import { esc, isLive, status, numeric } from '/model.js';
const $ = (id) => document.getElementById(id),
  root = document.createElement('section');
root.id = 'postseasonRoot';
root.hidden = true;
$('main').insertBefore(root, $('gamesPage'));
const rounds = [
  ['wc', '와일드카드', 'WC'],
  ['semi', '준플레이오프', '준PO'],
  ['po', '플레이오프', 'PO'],
  ['ks', '한국시리즈', 'KS']
];
const names = {
  home: '가을야구',
  games: '경기 센터',
  league: '시리즈',
  news: '가을 뉴스',
  videos: '하이라이트',
  settings: '설정'
};
let regularStarted = false;
let data = null,
  news = null,
  videos = null,
  mode = 'auto',
  page = location.hash.slice(1) || 'home',
  round = 'all',
  newsTeam = 'kia',
  gameTeam = window.kiaPreferences?.team === 'kia' ? 'kia' : 'all',
  loading = false,
  newsError = '',
  videoError = '',
  newsTime = 0,
  videoTime = 0;
try {
  mode = localStorage.getItem('kia-season-mode') || 'auto';
} catch {}
if (!['auto', 'postseason', 'regular'].includes(mode)) mode = 'auto';
const modeBox = document.createElement('div');
modeBox.className = 'season-control';
modeBox.innerHTML =
  '<label for="seasonMode">시즌 화면</label><select id="seasonMode"><option value="auto">자동 전환</option><option value="postseason">포스트시즌</option><option value="regular">정규시즌</option></select><span id="seasonStatus" role="status">일정 확인 중</span>';
($('seasonSettings') || $('main')).append(modeBox);
$('seasonMode').value = mode;
const on = () => mode === 'postseason' || (mode === 'auto' && !!data?.active);
const when = (d) =>
  d
    ? new Date(d).toLocaleString('ko-KR', {
        timeZone: 'Asia/Seoul',
        month: 'numeric',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      })
    : '확인 기록 없음';
const rn = (id) => rounds.find((r) => r[0] === id)?.[1] || '포스트시즌';
const blank = (t) => `<div class="ps-empty">${esc(t)}</div>`;
const external = (url, text, cls = 'text-button') =>
  `<a class="${cls}" href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(text)} ↗</a>`;
const gameUrl = (g) => 'https://m.sports.naver.com/game/' + encodeURIComponent(g.gameId) + '/relay';
const team = (g, s) =>
  `<div class="ps-team"><img src="https://sports-phinf.pstatic.net/team/kbo/default/${encodeURIComponent(g[s + 'TeamCode'])}.png" alt="" data-logo="${esc(g[s + 'TeamCode'])}"><strong>${esc(g[s + 'TeamName'] || '미정')}</strong><small>${s === 'home' ? '홈' : '원정'}</small></div>`;
function card(g, hero = false) {
  const scored = g.statusCode !== 'BEFORE' && !g.cancel;
  return `<article class="ps-game ${hero ? 'ps-featured' : ''} ${isLive(g) && !data.stale ? 'ps-live' : ''}"><div class="ps-game-top"><span>${esc(rn(g.psRound))} · ${esc(g.seriesGameNo || g.roundGameNo || '')}차전</span><span class="tag ${isLive(g) && !data.stale ? 'live' : ''}">${data.stale ? '갱신 지연' : isLive(g) ? 'LIVE · ' + esc(status(g)) : esc(status(g))}</span></div><div class="ps-match">${team(g, 'away')}<div class="ps-score"><b>${g.cancel ? '취소' : scored ? `${esc(g.awayTeamScore ?? '–')} <i>:</i> ${esc(g.homeTeamScore ?? '–')}` : esc(g.timeTbd ? '시간 미정' : g.gameDateTime.slice(11, 16))}</b><small>${esc(g.gameDate.slice(5).replace('-', '.'))} · ${esc(g.stadium || '구장 미정')}</small></div>${team(g, 'home')}</div><div class="ps-game-foot"><span>선발 ${esc(g.awayStarterName || '미정')} · ${esc(g.homeStarterName || '미정')}</span><button class="text-button" data-ps-game="${esc(g.gameId)}">${g.statusCode === 'RESULT' ? '종료 요약' : '경기 자세히'} ↗</button></div></article>`;
}
function tabs(attr, value, all = true) {
  return `<div class="ps-tabs ps-round-tabs" aria-label="라운드 선택">${(all ? [['all', '전체', '전체'], ...rounds] : rounds).map(([id, label]) => `<button data-${attr}="${id}" aria-pressed="${id === value}">${label}</button>`).join('')}</div>`;
}
function series() {
  return `<div class="ps-series">${rounds
    .map(([id, name, code], i) => {
      const gs = data?.games?.filter((g) => g.psRound === id) || [],
        done = gs.filter((g) => g.statusCode === 'RESULT' && !g.cancel && !g.suspended),
        teams = [...new Set(gs.flatMap((g) => [g.awayTeamCode, g.homeTeamCode]))],
        latest = [...gs].reverse().find((g) => g.gameDate <= data.today) || gs[0];
      return `<article class="ps-series-card ${gs.some(isLive) ? 'current' : ''}"><div><span class="ps-step">0${i + 1}</span><b>${code}</b></div><h3>${name}</h3><p>${data?.rounds?.find((r) => r.id === id)?.rule || ''}</p>${
        teams.length
          ? teams
              .map((c) => {
                const g = gs.find((g) => g.homeTeamCode === c || g.awayTeamCode === c),
                  side = g.homeTeamCode === c ? 'home' : 'away',
                  wins = done.filter(
                    (g) => g.winner === (g.homeTeamCode === c ? 'HOME' : 'AWAY')
                  ).length;
                const fourth = id === 'wc' && c === gs[0]?.homeTeamCode,
                  target = id === 'ks' ? 4 : id === 'wc' ? (fourth ? 1 : 2) : 3,
                  tied = done.some(
                    (g) =>
                      numeric(g.homeTeamScore) !== null &&
                      numeric(g.homeTeamScore) === numeric(g.awayTeamScore)
                  ),
                  qualified = wins >= target || (fourth && tied),
                  otherQualified = teams.some(
                    (other) =>
                      other !== c &&
                      (done.filter((g) => g.winner === (g.homeTeamCode === other ? 'HOME' : 'AWAY'))
                        .length >=
                        (id === 'wc' ? (other === gs[0]?.homeTeamCode ? 1 : 2) : target) ||
                        (id === 'wc' && other === gs[0]?.homeTeamCode && tied))
                  );
                return `<div class="series-progress ${qualified ? 'qualified' : ''}"><div class="ps-series-team"><strong>${esc(g[side + 'TeamName'])}${id === 'wc' ? ` <small>${fourth ? '4' : '5'}위</small>` : ''}</strong><span>${wins}<small>승 / ${target}승</small></span></div><div class="win-slots" role="img" aria-label="${wins}승, ${qualified ? '진출 확정' : otherQualified ? '시리즈 종료' : Math.max(0, target - wins) + '승 필요'}">${Array.from({ length: target }, (_, i) => `<i class="${i < wins ? 'won' : ''}">${i < wins ? '✓' : i + 1}</i>`).join('')}</div><p class="wins-needed">${qualified ? (id === 'ks' ? '우승 확정' : '다음 라운드 진출') : otherQualified ? '시리즈 종료' : `<b>${Math.max(0, target - wins)}승</b> 더 하면 ${id === 'ks' ? '우승' : '진출'}${fourth ? ' · 1무도 진출' : ''}`}</p></div>`;
              })
              .join('')
          : blank('대진 발표 대기')
      }<small>${id === 'wc' ? '실제 경기 승수 표시 · 4위 진출 조건 별도 적용' : done.length + '경기 종료'}${latest ? ' · ' + esc(latest.gameDate.slice(5)) : ''}</small></article>`;
    })
    .join('')}</div>`;
}
function article(a) {
  return `<article class="news-card"><div class="news-card-top"><span class="news-publisher">${esc(a.publisher)}</span><time class="news-time">${when(a.publishedAt)}</time></div><h3>${external(a.url, a.title, '')}</h3><div class="news-card-foot"><span class="news-category">${a.team === 'kia' ? 'KIA 타이거즈' : '기타 구단 · 리그'}</span></div></article>`;
}
function newsSection(home = false) {
  const items = (news?.articles || []).filter((a) => a.team === newsTeam);
  return `<div class="section-title"><h2>가을야구 뉴스룸</h2>${home ? '<button class="text-button" data-ps-page="news">전체 보기 ↗</button>' : ''}</div><div class="ps-tabs" aria-label="뉴스 구단"><button data-ps-news="kia" aria-pressed="${newsTeam === 'kia'}">KIA 타이거즈</button><button data-ps-news="other" aria-pressed="${newsTeam === 'other'}">기타 구단 · 리그</button></div><p class="small muted">${newsError || news?.stale ? '갱신 지연 · ' + esc(newsError || '마지막 확인 기록') : news?.partial ? '일부 언론사 연결 지연 · 확인된 기사만 표시' : '최근 7일 · 발행 시각 최신순'}${news?.fetchedAt ? ' · ' + when(news.fetchedAt) : ''}</p><div class="news-grid" id="psNewsGrid">${
    items.length
      ? items
          .slice(0, home ? 3 : 40)
          .map(article)
          .join('')
      : blank(
          news
            ? '이 분류에 확인된 가을야구 기사가 없어요.'
            : newsError || '기사를 불러오는 중이에요.'
        )
  }</div>`;
}
function render() {
  const wasActive = document.documentElement.dataset.season === 'postseason',
    active = on();
  document.documentElement.dataset.season = active ? 'postseason' : 'regular';
  root.hidden = !active || page === 'settings';
  if (active) $('settingsPage').hidden = page !== 'settings';
  if (!active) {
    const player = document.getElementById('psPlayer');
    if (player) player.innerHTML = '';
  }
  $('seasonStatus').textContent =
    mode === 'auto'
      ? data?.stale
        ? '자동 · 일정 연결 지연'
        : active
          ? '자동 · 포스트시즌 진행 중'
          : '자동 · 정규시즌 화면'
      : mode === 'postseason'
        ? '포스트시즌 직접 선택'
        : '정규시즌 직접 선택';
  document.querySelectorAll('.side-nav [data-page],.mobile-nav [data-page]').forEach((a) => {
    a.querySelector('span').textContent = active
      ? names[a.dataset.page]
      : {
          home: '대시보드',
          games: '경기 센터',
          league: '리그 순위',
          news: '최신 뉴스',
          videos: '하이라이트',
          settings: '설정'
        }[a.dataset.page];
  });
  document
    .querySelectorAll('.header-team')
    .forEach((e) => (e.textContent = active ? 'KBO POSTSEASON' : 'KIA TIGERS'));
  document
    .querySelectorAll('.date-pill')
    .forEach((e) => (e.textContent = active ? 'POSTSEASON GAME CENTER' : 'TIGERS GAME CENTER'));
  if (!active) {
    document.documentElement.dataset.psPage = '';
    if (wasActive) setTimeout(() => window.dispatchEvent(new HashChangeEvent('hashchange')), 0);
    return;
  }
  if (!names[page]) page = 'home';
  document.documentElement.dataset.psPage = page;
  if (page === 'games') window.kiaGameCenter?.show();
  document.querySelectorAll('[data-page]').forEach((a) => {
    if (a.dataset.page === page) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
  $('pageCrumb').textContent = names[page];
  $('pageEyebrow').textContent = (data?.year || new Date().getFullYear()) + ' / KBO POSTSEASON';
  $('pageTitle').textContent = {
    home: '가을, 모든 승부를 한곳에.',
    games: '오늘의 승부, 다음의 무대.',
    league: '우승까지, 네 개의 무대.',
    news: '가을야구의 모든 이야기.',
    videos: '가을의 장면을 다시.',
    settings: '나에게 맞는 다이아몬드.'
  }[page];
  $('pageDescription').textContent = 'KIA부터 모든 구단까지 · 포스트시즌 게임 센터';
  document.title = names[page] + ' · KIA 다이아몬드';
  const games = data?.games || [],
    live = games.filter(isLive),
    today = games.filter((g) => g.gameDate === data?.today),
    next = games.filter((g) => g.statusCode === 'BEFORE' && !g.cancel && g.gameDate >= data?.today),
    last = games.filter((g) => g.statusCode === 'RESULT').at(-1),
    main = live.length ? live : today.length ? today : next.slice(0, 1);
  let html = `<div class="ps-masthead"><span><i></i> ${data?.year || ''} POSTSEASON</span><span>EVERY GAME. ONE DREAM.</span></div><div class="ps-update" role="status">${data?.stale ? '최신 일정 연결 지연 · 마지막 확인 기록입니다.' : loading ? '업데이트 중…' : '진행 경기 30초 · 그 외 2분마다 갱신'} · ${when(data?.fetchedAt)} <button class="text-button" data-ps-refresh>새로고침 ↻</button></div>`;
  if (page === 'home')
    html += `<div class="ps-home-grid"><div>${
      main.length
        ? [...main]
            .sort((a, b) =>
              window.kiaPreferences?.team === 'kia'
                ? Number([b.homeTeamCode, b.awayTeamCode].includes('HT')) -
                  Number([a.homeTeamCode, a.awayTeamCode].includes('HT'))
                : 0
            )
            .map((g) => card(g, true))
            .join('')
        : blank(
            data?.stale
              ? '경기 정보를 불러오지 못했어요. 새로고침으로 다시 확인해 주세요.'
              : '오늘은 쉬어가는 날. 다음 경기 발표를 기다리고 있어요.'
          )
    }</div><aside class="ps-side-feature"><p class="eyebrow">ROAD TO THE CHAMPIONSHIP</p><h2>마지막 아웃까지,<br>가을은 계속된다.</h2><p>${live.length ? '지금 진행 중인 모든 포스트시즌 경기를 확인하세요.' : '팀에 상관없이, 가을야구의 모든 순간을 함께.'}</p><button class="text-button" data-ps-page="league">시리즈 현황 보기 ↗</button></aside></div><div class="ps-stat-grid"><div><small>진행 경기</small><b>${live.length}</b></div><div><small>종료 경기</small><b>${games.filter((g) => g.statusCode === 'RESULT' && !g.cancel).length}</b></div><div><small>KIA 다음 상대</small><b>${esc((next.find((g) => [g.homeTeamCode, g.awayTeamCode].includes('HT')) || {}).awayTeamName === 'KIA' ? next.find((g) => g.awayTeamCode === 'HT')?.homeTeamName : next.find((g) => g.homeTeamCode === 'HT')?.awayTeamName || '대진 대기')}</b></div></div><div class="section-title"><h2>시리즈 로드맵</h2></div>${series()}${last ? `<div class="section-title"><h2>마지막 경기</h2></div>${card(last)}` : ''}${newsSection(true)}`;
  if (page === 'games')
    html +=
      tabs('ps-round', round) +
      `<div class="ps-tabs"><button data-ps-team="all" aria-pressed="${gameTeam === 'all'}">전체 구단</button><button data-ps-team="kia" aria-pressed="${gameTeam === 'kia'}">KIA만</button></div><p class="small muted">포스트시즌 경기만 표시 · 주자·이닝·문자 중계·종료 요약</p>`;
  if (page === 'league')
    html +=
      series() +
      `<div class="ps-rules panel"><h3>가을야구 보는 법</h3><p>와일드카드: 4위는 1승 또는 1무, 5위는 2승이 필요해요.</p><p>준플레이오프·플레이오프: 3승을 먼저 · 한국시리즈: 4승을 먼저.</p><p>시리즈 카드에는 실제 완료 경기 승수를 표시해요. 대진과 일정은 제공처의 발표에 따라 갱신돼요.</p>${external('https://koreabaseball.com/MediaNews/Notice/View.aspx?bdSe=12183', '2026 KBO 공식 안내')}</div>`;
  if (page === 'news') html += newsSection();
  if (page === 'videos') {
    const items = (videos?.videos || []).filter((v) => round === 'all' || v.psRound === round);
    html +=
      tabs('ps-round', round) +
      `<p class="small muted">시즌 전체 · 공식 KBO 하이라이트 · 경기 종료 후 게시${videos?.stale ? ' · 갱신 지연' : ''}${videos?.partial ? ' · 일부 날짜 연결 지연' : ''}</p><div id="psPlayer"></div><div class="video-grid">${items.length ? items.map((v) => `<article class="video-card">${v.id ? `<button class="ps-video-thumb" data-ps-video="${esc(v.id)}" aria-label="${esc(v.title)} 재생"><img src="https://i.ytimg.com/vi/${encodeURIComponent(v.id)}/hqdefault.jpg" alt="" loading="lazy"><span>▶</span></button>` : ''}<div class="ps-video-copy"><small>${esc(rn(v.psRound))} · ${esc(v.gameDate)}</small><h3>${esc(v.title)}</h3>${external(v.id ? 'https://www.youtube.com/watch?v=' + encodeURIComponent(v.id) : v.sourceUrl, v.id ? 'YouTube에서 보기' : '공식 하이라이트 보기')}</div></article>`).join('') : blank(videoError || (!videos ? '공식 영상을 불러오는 중이에요.' : '이 라운드의 등록된 영상이 아직 없어요. 경기 종료 후 확인해 주세요.'))}</div><p class="small muted">${videos?.fetchedAt ? when(videos.fetchedAt) + ' 확인 · ' : ''}5분마다 갱신 · 게시자 설정에 따라 외부 재생이 필요할 수 있어요.</p>`;
  }
  const player =
    page === 'videos' && document.getElementById('psPlayer')?.querySelector('iframe')
      ? document.getElementById('psPlayer')
      : null;
  if (page === 'videos' && root.dataset.renderedPage === 'videos') {
    const template = document.createElement('template');
    template.innerHTML = html;
    const grid = root.querySelector('.video-grid'),
      next = template.content.querySelector('.video-grid');
    if (grid && next) {
      if (grid.innerHTML !== next.innerHTML) grid.innerHTML = next.innerHTML;
      root
        .querySelectorAll('[data-ps-round]')
        .forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.psRound === round)));
      return;
    }
  }
  const oldTabs = root.querySelector('.ps-round-tabs');
  if (page === 'settings') {
    window.kiaLiquidMount?.();
    return;
  }
  root.innerHTML = html;
  root.dataset.renderedPage = page;
  const newTabs = root.querySelector('.ps-round-tabs');
  if (oldTabs && newTabs) {
    oldTabs
      .querySelectorAll('[data-ps-round]')
      .forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.psRound === round)));
    newTabs.replaceWith(oldTabs);
  }
  window.kiaLiquidMount?.();
  if (player) document.getElementById('psPlayer')?.replaceWith(player);
}
const requests = new Map();
function read(url) {
  if (requests.has(url)) return requests.get(url);
  const task = readFresh(url).finally(() => requests.delete(url));
  requests.set(url, task);
  return task;
}
async function readFresh(url) {
  const r = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(25000) });
  if (!r.ok) throw Error('데이터 연결이 지연되고 있어요. 새로고침으로 다시 확인해 주세요.');
  return r.json();
}
async function extras(force = false) {
  const tasks = [];
  if (['home', 'news'].includes(page) && (force || Date.now() - newsTime > 300000))
    tasks.push(
      read('/api/postseason/news')
        .then((d) => {
          news = d;
          newsTime = Date.now();
          newsError = '';
        })
        .catch((e) => (newsError = e.message))
    );
  if (page === 'videos' && (force || Date.now() - videoTime > 300000))
    tasks.push(
      read('/api/postseason/videos')
        .then((d) => {
          videos = d;
          videoTime = Date.now();
          videoError = '';
        })
        .catch((e) => (videoError = e.message))
    );
  if (tasks.length) {
    await Promise.allSettled(tasks);
    render();
  }
}
async function refresh(force = false) {
  if (loading) return;
  loading = true;
  try {
    data = await read('/api/postseason');
  } catch {
    data = {
      ...data,
      games: data?.games || [],
      active:
        data?.active ??
        (new Date() >= new Date('2026-10-14T00:00:00+09:00') &&
          new Date() < new Date('2026-12-16T00:00:00+09:00')),
      stale: true
    };
  } finally {
    loading = false;
    window.kiaSeasonResolved = true;
  }
  syncCenter();
  render();
  if (on()) {
    regularStarted = false;
    await extras(force);
  } else if (!regularStarted) {
    regularStarted = true;
    window.kiaRegularStart?.();
  }
}
function syncCenter() {
  window.kiaGameCenter?.setPostseason(
    on() && data
      ? {
          ...data,
          games: (data.games || []).filter(
            (g) =>
              (round === 'all' || g.psRound === round) &&
              (gameTeam === 'all' || [g.homeTeamCode, g.awayTeamCode].includes('HT'))
          )
        }
      : null
  );
}
function navigate(p, { scroll = true } = {}) {
  page = names[p] ? p : 'home';
  history.replaceState(null, '', location.pathname + location.search + '#' + page);
  if (page === 'games') syncCenter();
  render();
  extras();
  if (scroll) window.scrollTo({ top: 0, behavior: 'instant' });
}
$('seasonMode').addEventListener('change', () => {
  mode = $('seasonMode').value;
  page = location.hash.slice(1) || 'home';
  try {
    localStorage.setItem('kia-season-mode', mode);
  } catch {}
  syncCenter();
  render();
  if (!on()) {
    regularStarted = true;
    window.kiaRegularStart?.();
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  } else extras();
});
document.addEventListener(
  'click',
  (e) => {
    if (!on()) return;
    const nav = e.target.closest('[data-page]');
    if (nav && !e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey) {
      e.preventDefault();
      e.stopImmediatePropagation();
      navigate(nav.dataset.page);
    }
    if (e.target.closest('#refresh')) {
      e.preventDefault();
      e.stopImmediatePropagation();
      refresh(true);
    }
  },
  true
);
root.addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.psPage) navigate(b.dataset.psPage);
  else if (b.dataset.psRound) {
    round = b.dataset.psRound;
    syncCenter();
    render();
  } else if (b.dataset.psNews) {
    newsTeam = b.dataset.psNews;
    root
      .querySelectorAll('[data-ps-news]')
      .forEach((n) => n.setAttribute('aria-pressed', String(n.dataset.psNews === newsTeam)));
    const items = (news?.articles || []).filter((a) => a.team === newsTeam);
    $('psNewsGrid').innerHTML = items.length
      ? items
          .slice(0, page === 'home' ? 3 : 40)
          .map(article)
          .join('')
      : blank(
          news
            ? '이 분류에 확인된 가을야구 기사가 없어요.'
            : newsError || '기사를 불러오는 중이에요.'
        );
  } else if (b.dataset.psTeam) {
    gameTeam = b.dataset.psTeam;
    syncCenter();
    render();
  } else if (b.dataset.psGame) {
    round = 'all';
    gameTeam = 'all';
    syncCenter();
    navigate('games');
    window.kiaGameCenter?.open(b.dataset.psGame);
    $('relay').scrollIntoView({
      block: 'start',
      behavior: window.kiaPreferences?.motion === 'off' ? 'instant' : 'smooth'
    });
  } else if (b.hasAttribute('data-ps-refresh')) refresh(true);
  else if (b.dataset.psVideo && /^[\w-]{11}$/.test(b.dataset.psVideo)) {
    $('psPlayer').innerHTML =
      `<button class="text-button" data-ps-stop>재생 닫기 ×</button><iframe title="포스트시즌 하이라이트" src="https://www.youtube-nocookie.com/embed/${b.dataset.psVideo}?autoplay=1" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe>`;
    $('psPlayer').scrollIntoView({
      block: 'center',
      behavior: window.kiaPreferences?.motion === 'off' ? 'instant' : 'smooth'
    });
  } else if (b.hasAttribute('data-ps-stop')) $('psPlayer').innerHTML = '';
});
window.kiaPostseasonSync = () => render();
window.kiaPostseasonNavigate = navigate;
window.addEventListener('hashchange', () => {
  page = location.hash.slice(1) || 'home';
  if (on()) {
    render();
    extras();
  }
});
setInterval(() => {
  if (!document.hidden) {
    const due = data?.games?.some(isLive) ? 30000 : 120000;
    if (!data?.fetchedAt || Date.now() - Date.parse(data.fetchedAt) >= due) refresh();
    else if (on()) extras();
  }
}, 30000);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) refresh();
});
window.addEventListener('online', () => refresh(true));
render();
if (mode === 'regular') {
  window.kiaSeasonResolved = true;
  regularStarted = true;
  window.kiaRegularStart?.();
}
refresh();

window.addEventListener('kia-preferences', () => {
  gameTeam = window.kiaPreferences?.team === 'kia' ? 'kia' : 'all';
  syncCenter();
  render();
});
