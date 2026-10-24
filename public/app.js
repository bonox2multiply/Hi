import { liveSummary, pregameEstimate } from '/live-model.js?v=23';
// prettier-ignore
import {esc,primaryName,isHome,opponent,side,scores,isLive,status,outcome,numeric,occupied,tally,cumulative,filterPlays,gameLabel,summarizeGame} from '/model.js';
const pregameCache = new Map(),
  pregamePending = new Set(),
  pregameAttempt = new Map();
let clipGame = '',
  clipData = null,
  clipFetched = 0,
  clipPending = '',
  clipSeq = 0;
const $ = (id) => document.getElementById(id),
  q = (s) => document.querySelectorAll(s);
const short = (d) => d?.slice(5).replace('-', '.') || '–';
const weekday = (d) =>
  new Intl.DateTimeFormat('ko-KR', { weekday: 'short', timeZone: 'Asia/Seoul' }).format(
    new Date(d + 'T12:00:00+09:00')
  );
const stamp = (d) =>
  d && Number.isFinite(Date.parse(d))
    ? new Intl.DateTimeFormat('ko-KR', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
        timeZone: 'Asia/Seoul'
      }).format(new Date(d))
    : '확인 불가';
const todayKST = () =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date());
const shift = (d, n) =>
  new Date(Date.parse(d + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);
const time = (g) => (g.timeTbd ? '시간 미정' : g.gameDateTime?.slice(11, 16) || '시간 미정');
const cls = (g) => ({ '승': 'win', '패': 'loss', '무': 'draw' })[outcome(g)] || '';
const val = (v) => esc(v ?? '–');
const logo = (code, large = false) =>
  `<img class="${large ? 'team-logo' : ''}" src="https://sports-phinf.pstatic.net/team/kbo/default/${encodeURIComponent(code)}.png" alt="" ${large ? '' : 'loading="lazy"'} referrerpolicy="no-referrer" data-logo="${esc(code)}">`;
const smooth = () =>
  document.documentElement.dataset.motion === 'off'
    ? 'instant'
    : matchMedia('(prefers-reduced-motion: reduce)').matches
      ? 'instant'
      : 'smooth';
const sourceLink = (g) => `https://m.sports.naver.com/game/${encodeURIComponent(g.gameId)}/relay`;
const empty = (text, sub = '') =>
  `<div class="empty">${text}${sub ? `<small>${sub}</small>` : ''}</div>`;
function readStore(k) {
  try {
    return JSON.parse(localStorage.getItem(k));
  } catch {
    return null;
  }
}
function writeStore(k, v) {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch {}
}
let postseasonCenter = false;
let lastData = null,
  rankData = null,
  relayData = null,
  pendingRelay = null,
  relayId = '',
  manualGame = false,
  windowDays = 30,
  locationFilter = 'all',
  dateFilter = '',
  activeTab = 'situation',
  logLimit = 12,
  highlight = false,
  inning = 'all',
  selectedRankIndex = 13;
let gamesPending = null,
  rankPending = null,
  relayPending = null,
  relaySeq = 0,
  toastTimer,
  gamesFailed = false,
  rankFailed = false,
  relayFailed = false;
let gamesFetched = 0,
  relayFetched = 0,
  rankFetched = 0;
let requestedGame = new URLSearchParams(location.search).get('game') || '';
function toast(message) {
  $('toast').textContent = message;
  $('toast').hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => ($('toast').hidden = true), 3000);
}
$('themeToggle').addEventListener('click', () => setView('settings'));
$('themeToggle').setAttribute('aria-label', '설정 열기');
$('themeIcon').textContent = '⚙';
document.addEventListener(
  'error',
  (e) => {
    if (e.target instanceof HTMLImageElement && e.target.dataset.logo) {
      const badge = document.createElement('span');
      badge.className =
        'logo-fallback ' + (e.target.classList.contains('team-logo') ? 'team-logo' : '');
      badge.textContent = e.target.dataset.logo === 'HT' ? 'KIA' : e.target.dataset.logo;
      badge.setAttribute('aria-hidden', 'true');
      e.target.replaceWith(badge);
    }
  },
  true
);
function dateHeader() {
  $('todayDate').textContent =
    new Intl.DateTimeFormat('ko-KR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      weekday: 'long',
      timeZone: 'Asia/Seoul'
    }).format(new Date()) + ' · 한국 시간 기준';
}
dateHeader();
function formStrip(games) {
  return `<div class="form-strip" aria-label="최근 경기 승패, 왼쪽부터 오래된 경기">${games.map((g) => `<span class="form-dot ${cls(g)}" title="${esc(gameLabel(g))} · ${outcome(g)}">${outcome(g)}</span>`).join('')}</div>`;
}
function overview() {
  const kia = rankData?.teams.find((t) => t.code === 'HT');
  const recent =
    lastData?.games.filter(
      (g) => g.gameDate >= shift(lastData.today, -6) && g.gameDate <= lastData.today
    ) || [];
  const stats = tally(recent);
  const next = lastData?.games.find(
    (g) => g.gameDate >= lastData.today && g.statusCode === 'BEFORE' && !g.cancel
  );
  const delta =
    kia && rankData.history?.at(-2)?.ranks?.HT ? rankData.history.at(-2).ranks.HT - kia.rank : null;
  const n = stats.scored;
  const warning = lastData?.stale ? ' · 마지막 확인 기록' : '';
  $('overview').innerHTML =
    `<div class="metric"><div class="metric-label">정규시즌 순위 <span class="rank-badge">${rankData?.stale ? '갱신 지연' : delta === null ? 'KBO' : delta > 0 ? '▲ ' + delta : delta < 0 ? '▼ ' + Math.abs(delta) : '변동 없음'}</span></div><div class="metric-value">${kia ? kia.rank : '–'}<small>위</small></div><div class="metric-detail">${kia ? `${kia.wins}승 ${kia.losses}패 ${kia.draws}무 · ${esc(kia.streak || '')}` : '시즌 기록 확인 중'}</div></div><div class="metric"><div class="metric-label">최근 7일 흐름<span>${stats.known.length}경기</span></div><div class="metric-value">${stats.known.length ? stats.wins : '–'}<small>승 ${stats.known.length ? stats.losses : '–'}패${stats.draws ? ' ' + stats.draws + '무' : ''}</small></div>${stats.known.length ? formStrip(stats.known.slice(-5)) : `<div class="metric-detail">${lastData?.stale ? '연결 확인 필요' : '완료된 경기가 없어요'}</div>`}</div><div class="metric"><div class="metric-label">최근 7일 경기당 득점<span>실점</span></div><div class="metric-value">${n ? (stats.runs / n).toFixed(1) : '–'}<small> / ${n ? (stats.allowed / n).toFixed(1) : '–'}</small></div><div class="metric-detail">${n ? `${n}경기 · 득실차 ${stats.runs - stats.allowed > 0 ? '+' : ''}${stats.runs - stats.allowed}` : '확인된 점수가 없어요'}${warning}</div></div><div class="metric"><div class="metric-label">다음 경기<span>${next ? side(next) : 'KIA'}</span></div><div class="metric-value">${next ? esc(opponent(next)) : '–'}<small>${next ? '전' : ''}</small></div><div class="metric-detail">${next ? `${short(next.gameDate)} (${weekday(next.gameDate)}) · ${time(next)}` : lastData?.stale ? '일정 연결 확인 필요' : `앞으로 ${windowDays}일 내 일정 없음`}</div></div>`;
}
function board(g, label) {
  const stale = lastData.stale,
    [kia, opp] = scores(g),
    scored = g.statusCode !== 'BEFORE' && !g.cancel,
    hasScore = numeric(kia) !== null && numeric(opp) !== null;
  const live = isLive(g) && !stale;
  const labelState = stale ? '갱신 지연' : status(g);
  return `<article class="scoreboard"><div class="board-top"><div class="board-top-title">${esc(label)} <span class="tag ${stale ? 'stale' : live ? 'live' : ''}">${live ? 'LIVE · ' : ''}${esc(labelState)}</span></div><span class="board-meta">${short(g.gameDate)} (${weekday(g.gameDate)}) · ${esc(g.stadium || '구장 미정')}${g.seriesGameNo > 0 ? ' · ' + g.seriesGameNo + '차전' : ''}${g.roundName ? ' · ' + esc(g.roundName) : ''}</span></div><div class="matchup"><div>${logo(isHome(g) ? g.homeTeamCode : g.awayTeamCode, true)}<div class="team-name">${esc(primaryName(g))}${primaryName(g) === 'KIA' ? ' 타이거즈' : ''}</div><div class="team-role">${side(g)} · ${esc(isHome(g) ? g.homeTeamCode : g.awayTeamCode)}</div></div><div><div class="score-numbers ${scored ? '' : 'time'}">${scored ? `<span class="${hasScore && Number(kia) > Number(opp) ? 'winning' : ''}">${val(kia)}</span><span class="colon">:</span><span>${val(opp)}</span>` : esc(g.cancel ? '취소' : time(g))}</div><div class="game-status">${stale ? '마지막 확인 ' + stamp(lastData.fetchedAt) : esc(status(g))}</div><div class="game-sub">${scored ? esc(primaryName(g)) + ' : ' + esc(opponent(g)) : 'FIRST PITCH'}</div></div><div>${logo(isHome(g) ? g.awayTeamCode : g.homeTeamCode, true)}<div class="team-name">${esc(opponent(g))}</div><div class="team-role">${g.neutralGround ? '중립' : isHome(g) ? '원정' : '홈'} · OPPONENT</div></div></div><div class="board-bottom"><span>선발 <strong>${esc((isHome(g) ? g.homeStarterName : g.awayStarterName) || '미정')}</strong> <span class="muted">vs</span> <strong>${esc((isHome(g) ? g.awayStarterName : g.homeStarterName) || '미정')}</strong>${g.broadChannel ? ' · ' + esc(g.broadChannel) : ''}</span><button class="board-action" data-game="${esc(g.gameId)}">${g.statusCode === 'RESULT' ? '경기 기록 보기' : '경기 센터 열기'} ↗</button></div></article>`;
}
function renderGames() {
  if (!lastData) return;
  const d = lastData;
  dateHeader();
  const current = d.games.filter((g) => g.gameDate === d.today);
  const next = d.games.find((g) => g.gameDate > d.today && !g.cancel);
  $('today').innerHTML = current.length
    ? `<div class="board-stack">${current.map((g) => board(g, '오늘의 매치업')).join('')}</div>`
    : next
      ? board(next, '오늘은 휴식 · 다음 매치업')
      : `<div class="scoreboard"><div class="empty-board"><span class="tag ${d.stale ? 'stale' : ''}">${d.stale ? '연결 확인 필요' : 'REST DAY'}</span><strong>${d.stale ? '최신 경기 정보를 기다리고 있어요' : '오늘은 등록된 KIA 경기가 없어요'}</strong><small>${d.stale ? '마지막으로 확인한 기록은 아래에서 볼 수 있어요.' : '최근 결과와 시즌 순위를 확인해 보세요.'}</small></div></div>`;
  $('notice').hidden = !d.stale;
  $('notice').textContent = d.stale
    ? `최신 경기 데이터에 연결하지 못했습니다. ${stamp(d.fetchedAt)} 확인 기록이며 현재 상황과 다를 수 있습니다.`
    : '';
  $('updated').textContent = (d.stale ? '마지막 확인 ' : '조회 ') + stamp(d.fetchedAt);
  $('connection').innerHTML =
    `<i class="status-dot" style="${d.stale ? 'background:#b78b38' : ''}"></i>${d.stale ? '갱신 지연' : d.games.some(isLive) ? '진행 경기 · 30초마다 갱신' : '예정·종료 경기 · 2분마다 갱신'}`;
  overview();
  renderCalendar();
  renderLists();
  syncRelay();
  updateMini();
  renderFeaturedRecap();
}
function filteredGames() {
  return (lastData?.games || []).filter(
    (g) =>
      (locationFilter === 'all' ||
        (locationFilter === 'home' ? side(g) === '홈' : side(g) === '원정')) &&
      (!dateFilter || g.gameDate === dateFilter)
  );
}
function row(g) {
  const isPast = g.gameDate <= lastData.today && g.statusCode !== 'BEFORE';
  const [kia, opp] = scores(g);
  const r = postseasonCenter ? status(g) : outcome(g);
  return `<button class="row" type="button" data-game="${esc(g.gameId)}" aria-label="${esc(gameLabel(g))}, ${esc(status(g))}, 상세 보기"><span class="row-date">${short(g.gameDate)}<small>${weekday(g.gameDate)}요일</small></span><span class="row-main"><span class="opponent">${logo(isHome(g) ? g.awayTeamCode : g.homeTeamCode)}${postseasonCenter ? esc(primaryName(g)) + ' · ' : ''}${esc(opponent(g))}<span class="home-tag">${side(g)}</span></span><span class="row-sub">${esc(g.stadium || '구장 미정')}${g.seriesGameNo > 0 ? ' · ' + g.seriesGameNo + '차전' : ''}${g.broadChannel ? ' · ' + esc(g.broadChannel) : ''}</span></span>${isPast && !g.cancel ? `<span class="row-score">${val(kia)}<small>:</small>${val(opp)}</span>` : `<span class="row-time">${g.cancel ? '취소' : esc(time(g))}</span>`}${isPast ? `<span class="result ${postseasonCenter ? '' : cls(g)}">${isLive(g) ? '진행' : r}</span>` : ''}</button>`;
}
function renderLists() {
  if (!lastData) return;
  const d = lastData;
  const games = filteredGames(),
    past = games
      .filter(
        (g) =>
          (postseasonCenter || g.gameDate >= shift(d.today, 1 - windowDays)) &&
          (g.gameDate < d.today || (g.gameDate === d.today && g.statusCode === 'RESULT'))
      )
      .sort((a, b) => b.gameDateTime.localeCompare(a.gameDateTime)),
    future = games.filter(
      (g) => g.gameDate > d.today || (g.gameDate === d.today && g.statusCode !== 'RESULT')
    );
  const s = tally(past);
  $('recentTitle').textContent = postseasonCenter ? '포스트시즌 결과' : `최근 ${windowDays}일 결과`;
  $('upcomingTitle').textContent = postseasonCenter
    ? '포스트시즌 일정'
    : `앞으로 ${windowDays}일 일정`;
  $('recentRange').textContent =
    short(postseasonCenter ? d.from : shift(d.today, 1 - windowDays)) + ' – ' + short(d.today);
  $('nextRange').textContent = short(d.today) + ' – ' + short(d.to);
  $('recentPanel').innerHTML =
    (!postseasonCenter && s.known.length
      ? `<div class="form-summary"><div class="form-summary-header"><span><strong>${s.wins}</strong>승 <b>${s.losses}</b>패 ${s.draws}무</span><span class="muted small">승률 ${s.pct === null ? '–' : (s.pct * 100).toFixed(0) + '%'}</span></div>${formStrip([...s.known].reverse().slice(-10))}<div class="result-bar" role="img" aria-label="${s.wins}승 ${s.losses}패 ${s.draws}무">${[
          ['win', s.wins],
          ['loss', s.losses],
          ['draw', s.draws]
        ]
          .map(([c, n]) => (n ? `<span class="${c}" style="flex:${n}"></span>` : ''))
          .join('')}</div></div>`
      : '') +
    (past.length
      ? past.map(row).join('')
      : empty(d.stale ? '최근 기록을 확인할 수 없어요' : '조건에 맞는 완료 경기가 없어요')) +
    `<p class="panel-foot">${postseasonCenter ? '점수는 표시된 두 구단 순서' : '점수는 KIA : 상대팀 순서'} · 오늘 종료 경기 포함 · 경기를 누르면 상세 기록으로 이동합니다.</p>`;
  $('nextPanel').innerHTML =
    (future.length
      ? future.map(row).join('')
      : empty(
          d.stale ? '예정된 경기를 확인할 수 없어요' : '조건에 맞는 예정 경기가 없어요',
          !postseasonCenter && windowDays === 7 ? '30일 범위에서도 확인할 수 있어요.' : ''
        )) +
    `<p class="panel-foot">오늘 예정·진행 경기 포함 · 우천 및 리그 사정에 따라 변경될 수 있습니다.</p>`;
  $('clearDate').hidden = !dateFilter;
  $('filterHint').textContent = dateFilter
    ? `${short(dateFilter)} (${weekday(dateFilter)}) 선택됨`
    : '';
}
function renderCalendar() {
  if (!lastData) return;
  window.kiaCalendar?.render(lastData, row);
  const d = lastData;
  $('weekStrip').innerHTML = Array.from({ length: 7 }, (_, i) => {
    const date = shift(d.today, i - 2),
      games = d.games.filter((g) => g.gameDate === date),
      g = games[0];
    return `<button class="day-card ${date === d.today ? 'today' : ''}" data-date="${date}" aria-pressed="${dateFilter === date}" aria-label="${date}, ${games.length ? games.map((g) => primaryName(g) + ' 대 ' + opponent(g)).join(', ') : '등록 경기 없음'}"><small>${date === d.today ? '오늘' : weekday(date)}</small><b>${Number(date.slice(-2))}</b><span class="${games.length ? 'day-game' : ''}">${g ? esc(opponent(g)) + (games.length > 1 ? ' ×' + games.length : '') : d.stale ? '확인 필요' : '휴식'}</span><span>${g ? (g.cancel ? '취소' : g.statusCode === 'RESULT' ? outcome(g) : time(g)) : d.stale ? '미확인' : '—'}</span></button>`;
  }).join('');
}
function renderCenterScore() {
  let g = selectedGame();
  if (g && (g.statusCode === 'BEFORE' || isLive(g)) && !g.cancel && !g.suspended) refreshPregame(g);
  if (g && relayData?.gameId === g.gameId && !g.cancel && g.statusCode !== 'BEFORE') {
    const state = relayData.state || {},
      scheduleTime = Date.parse(lastData.fetchedAt),
      relayTime = Date.parse(relayData.fetchedAt);
    const useLive = isLive(g) && !relayData.stale && relayTime >= scheduleTime;
    g = { ...g };
    for (const side of ['home', 'away']) {
      const value = state[side + 'Score'];
      if (numeric(value) !== null && (useLive || numeric(g[side + 'TeamScore']) === null))
        g[side + 'TeamScore'] = value;
    }
  }
  $('centerScore').innerHTML = g
    ? board(g, postseasonCenter ? '포스트시즌 · 선택한 경기' : '선택한 경기') +
      probabilityMarkup(g, relayData)
    : `<div class="scoreboard"><div class="empty-board"><strong>표시할 경기가 없어요.</strong><small>경기 필터 또는 일정을 확인해 주세요.</small></div></div>`;
}
function selectedGame() {
  return lastData?.games.find((g) => g.gameId === relayId);
}
function chooseGame(id, { scroll = true, manual = true } = {}) {
  if (!lastData?.games.some((g) => g.gameId === id)) return;
  const changed = id !== relayId;
  relayId = id;
  renderCenterScore();
  manualGame = manual;
  requestedGame = '';
  $('relayGame').value = id;
  if (changed) {
    stopGameClip();
    clipGame = '';
    relaySeq++;
    relayData = null;
    pendingRelay = null;
    logLimit = 12;
    inning = 'all';
    $('inningFilter').value = 'all';
    $('newPlays').hidden = true;
    $('situationContent').innerHTML = empty('경기 기록을 불러오는 중이에요.');
    $('summaryContent').innerHTML = empty('기록을 확인하고 있어요.');
    $('relayLog').innerHTML = empty('중계를 확인하고 있어요.');
    const u = new URL(location.href);
    u.searchParams.set('game', id);
    history.replaceState(null, '', u.pathname + u.search + u.hash);
  }
  if (manual) setTab(selectedGame()?.statusCode === 'RESULT' ? 'summary' : 'situation');
  renderSummary();
  refreshRelay(true);
  if (scroll) {
    setView('games', { scroll: false });
    $('relay').scrollIntoView({ behavior: smooth(), block: 'start' });
  }
}
function syncRelay() {
  const games = [...lastData.games].sort((a, b) => b.gameDateTime.localeCompare(a.gameDateTime));
  const existing = selectedGame();
  const active =
    games.find((g) => g.gameDate === lastData.today && isLive(g)) ||
    games.find((g) => g.gameDate === lastData.today && !g.cancel) ||
    games.find((g) => g.statusCode === 'RESULT') ||
    [...games].reverse().find((g) => !g.cancel);
  const requested = games.find((g) => g.gameId === requestedGame);
  const target = requested || (manualGame && existing ? existing : active);
  $('relayGame').innerHTML = games.length
    ? games
        .map(
          (g) =>
            `<option value="${esc(g.gameId)}">${short(g.gameDate)} · ${esc(primaryName(g))} vs ${esc(opponent(g))}${g.seriesGameNo > 0 ? ' · ' + g.seriesGameNo + '차전' : ''} · ${esc(status(g))}</option>`
        )
        .join('')
    : '<option value="">등록된 경기 없음</option>';
  $('relayGame').disabled = !games.length;
  if (target && target.gameId !== relayId)
    chooseGame(target.gameId, { scroll: false, manual: !!requested || manualGame });
  else {
    $('relayGame').value = relayId;
    if (!target) {
      relayId = '';
      relayData = null;
      pendingRelay = null;
      relaySeq++;
      renderRelayEmpty('표시할 경기가 없어요.');
    } else if (relayData) {
      renderSituation();
      renderSummary();
    }
  }
  renderCenterScore();
}
function renderRelayEmpty(message) {
  relayFailed = false;
  $('relayStatus').textContent = message;
  $('relayStatus').classList.remove('error');
  $('situationContent').innerHTML = empty(message);
  $('summaryContent').innerHTML = empty(message);
  $('relayLog').innerHTML = empty(message);
  $('relayMore').hidden = true;
  $('newPlays').hidden = true;
}
function counts(label, key, n, color, s) {
  const v = numeric(s[key]);
  return `<div class="count-row" aria-label="${label} ${v ?? '미확인'}"><b>${label}</b>${Array.from({ length: n }, (_, i) => `<i class="count-dot ${v !== null && i < v ? 'on ' : ''}${color}" aria-hidden="true"></i>`).join('')}<span class="count-num">${v ?? '–'}</span></div>`;
}
function diamond(s, live) {
  const known = [1, 2, 3].some((i) => Object.hasOwn(s, 'base' + i));
  const bases = [1, 2, 3].filter((i) => occupied(s['base' + i]));
  return `<div><svg class="field-svg" viewBox="0 0 160 160" role="img" aria-label="${live && known ? (bases.length ? bases.join(', ') + '루 주자 있음' : '주자 없음') : '경기장 다이아몬드, 현재 주자 정보 없음'}"><path class="field" d="M80 139 13 72 Q19 19 80 14 Q141 19 147 72Z"/><path class="field-lines" d="m80 130-52-52 52-52 52 52Z M80 130V84 M28 78h104"/><path d="m80 120 7 7-7 7-7-7Z" fill="#fff" stroke="#9baea4"/><circle cx="80" cy="80" r="9" fill="#dbc5a5"/><path class="base ${live && bases.includes(1) ? 'on' : ''}" d="m128 70 8 8-8 8-8-8Z"/><path class="base ${live && bases.includes(2) ? 'on' : ''}" d="m80 24 8 8-8 8-8-8Z"/><path class="base ${live && bases.includes(3) ? 'on' : ''}" d="m32 70 8 8-8 8-8-8Z"/><text x="143" y="81" text-anchor="middle">1</text><text x="80" y="17" text-anchor="middle">2</text><text x="17" y="81" text-anchor="middle">3</text></svg><div class="field-caption">${live && known ? (bases.length ? bases.join(' · ') + '루 주자' : '주자 없음') : '현재 주자 정보 없음'}</div></div>`;
}
function flowChart(d, g) {
  const n = Math.min(
    50,
    Math.max(
      9,
      Number(d.inning) || 0,
      ...Object.keys(d.score?.home || {})
        .map(Number)
        .filter(Number.isFinite),
      ...Object.keys(d.score?.away || {})
        .map(Number)
        .filter(Number.isFinite)
    )
  );
  const kia = cumulative(d.score[isHome(g) ? 'home' : 'away'], n),
    opp = cumulative(d.score[isHome(g) ? 'away' : 'home'], n);
  if (!kia.some((v) => v !== null) && !opp.some((v) => v !== null))
    return '<div class="chart-empty">이닝 점수가 제공되면 득점 흐름이 표시됩니다.</div>';
  const w = 440,
    h = 150,
    left = 26,
    right = 14,
    top = 15,
    bottom = 26,
    max = Math.max(1, ...kia.filter((v) => v !== null), ...opp.filter((v) => v !== null));
  const x = (i) => left + (i * (w - left - right)) / n,
    y = (v) => h - bottom - (v * (h - top - bottom)) / max;
  const line = (values, c, dash = '') => {
    const pts = [[0, 0], ...values.map((v, i) => [i + 1, v]).filter((p) => p[1] !== null)];
    return `<polyline points="${pts.map((p) => x(p[0]) + ',' + y(p[1])).join(' ')}" fill="none" stroke="${c}" stroke-width="2.5" ${dash ? 'stroke-dasharray="5 4"' : ''} stroke-linejoin="round"/>${pts
      .slice(1)
      .map(
        (p) =>
          `<circle cx="${x(p[0])}" cy="${y(p[1])}" r="3" fill="${c}"><title>${p[0]}회 누적 ${p[1]}점</title></circle>`
      )
      .join('')}`;
  };
  return `<svg class="flow-chart" viewBox="0 0 ${w} ${h}" role="img" aria-label="이닝별 누적 득점, 빨간 실선 ${esc(primaryName(g))}, 파란 점선 ${esc(opponent(g))}. 정확한 점수는 아래 이닝 표에서 확인할 수 있습니다.">${[
    0,
    Math.ceil(max / 2),
    max
  ]
    .filter((v, i, a) => a.indexOf(v) === i)
    .map(
      (v) =>
        `<line x1="${left}" y1="${y(v)}" x2="${w - right}" y2="${y(v)}" stroke="var(--line)"/><text x="18" y="${y(v) + 4}" fill="var(--muted)" font-size="10" text-anchor="end">${v}</text>`
    )
    .join('')}${line(opp, 'var(--blue)', true)}${line(kia, 'var(--red)')}${Array.from(
    { length: n + 1 },
    (_, i) => i
  )
    .filter((i) => n <= 12 || i % 2 === 0 || i === n)
    .map(
      (i) =>
        `<text x="${x(i)}" y="${h - 5}" text-anchor="middle" font-size="10" fill="var(--muted)">${i === 0 ? '시작' : i + '회'}</text>`
    )
    .join('')}</svg>`;
}
function inningTable(d, g) {
  const n = Math.min(
    50,
    Math.max(
      9,
      Number(d.inning) || 0,
      ...Object.keys(d.score?.home || {})
        .map(Number)
        .filter(Number.isFinite),
      ...Object.keys(d.score?.away || {})
        .map(Number)
        .filter(Number.isFinite)
    )
  );
  return `<div class="inning-scroll" role="region" tabindex="0" aria-label="이닝별 점수, 좌우로 스크롤"><table class="inning-table"><caption>이닝별 점수 <span class="muted small">· 좌우로 밀어서 보기</span></caption><thead><tr><th scope="col">구단</th>${Array.from({ length: n }, (_, i) => `<th scope="col" class="${isLive(g) && i + 1 === Number(d.inning) ? 'now' : ''}">${i + 1}</th>`).join('')}<th scope="col">R</th><th scope="col">H</th><th scope="col">E</th></tr></thead><tbody>${['away', 'home'].map((s) => `<tr class="${g[s + 'TeamCode'] === 'HT' ? 'kia-inning' : ''}"><th scope="row">${esc(g[s + 'TeamName'])}</th>${Array.from({ length: n }, (_, i) => `<td class="${Number(d.score?.[s]?.[i + 1]) > 0 ? 'scored' : ''}">${val(d.score?.[s]?.[i + 1])}</td>`).join('')}<td class="total">${val(d.state?.[s + 'Score'] ?? g[s + 'TeamScore'])}</td><td>${val(d.state?.[s + 'Hit'])}</td><td>${val(d.state?.[s + 'Error'])}</td></tr>`).join('')}</tbody></table></div>`;
}
function safeReplace(id, html) {
  const el = $(id);
  if (el.innerHTML === html) return;
  const scrolls = [...el.querySelectorAll('[role="region"]')].map((x) => x.scrollLeft);
  el.innerHTML = html;
  el.dataset.html = html;
  el.querySelectorAll('[role="region"]').forEach((x, i) => (x.scrollLeft = scrolls[i] || 0));
}
function renderSituation() {
  const d = relayData,
    g = selectedGame();
  if (!d || !g) return;
  const s = d.state || {},
    live = isLive(g);
  const field = `<div class="field-card">${diamond(s, live)}<div><div class="situation-label">${live ? esc(d.inning || '–') + '회 ' + esc(d.half) : esc(status(g))}</div>${live ? counts('B', 'ball', 3, 'ball', s) + counts('S', 'strike', 2, 'strike', s) + counts('O', 'out', 2, 'out', s) : `<strong>${g.statusCode === 'RESULT' ? (outcome(g) === '승' ? (primaryName(g) === 'KIA' ? 'TIGERS WIN' : 'WIN') : outcome(g) === '패' ? 'FINAL SCORE' : 'GAME FINAL') : 'GAME CENTER'}</strong><p class="small muted">${short(g.gameDate)} · ${esc(g.stadium || '')}</p>`}<div class="at-bat"><div><span>${live ? '현재 투수' : primaryName(g) + ' 선발'}</span><strong>${esc(live ? d.pitcher || '미확인' : (isHome(g) ? g.homeStarterName : g.awayStarterName) || '미확인')}</strong></div>${live ? `<div><span>현재 타자</span><strong>${esc(d.batter || '미확인')}</strong></div>` : ''}</div></div></div>`;
  safeReplace(
    'situationContent',
    `<div class="situation-grid">${field}<div class="flow-card"><div class="chart-heading"><h3>득점 흐름</h3><span class="small muted">누적 점수</span></div><div class="legend"><span><i></i>${esc(primaryName(g))}</span><span><i class="other"></i>${esc(opponent(g))}</span></div>${flowChart(d, g)}</div></div>${inningTable(d, g)}`
  );
  updateRelayStatus();
}
function updateRelayStatus() {
  const d = relayData,
    g = selectedGame();
  if (!g || !d) return;
  const [a, b] = scores(g),
    rA = d.state?.[isHome(g) ? 'homeScore' : 'awayScore'],
    rB = d.state?.[isHome(g) ? 'awayScore' : 'homeScore'];
  const mismatch =
    [a, b, rA, rB].every((v) => numeric(v) !== null) &&
    (Number(a) !== Number(rA) || Number(b) !== Number(rB));
  $('relayStatus').classList.toggle('error', !!d.stale);
  $('relayStatus').innerHTML =
    `<span>${d.stale ? '갱신 지연 · 마지막 확인 ' : ''}${stamp(d.fetchedAt)}${mismatch ? ' · 점수판과 중계의 반영 시점이 다릅니다.' : ''}</span><a href="${sourceLink(g)}" target="_blank" rel="noopener noreferrer">원본 중계 ↗</a>`;
}
function renderLog() {
  const d = relayData;
  if (!d) return;
  const logSource = highlight && d.highlights?.length ? d.highlights : d.plays;
  const innings = [...new Set(logSource.map((p) => p.inning).filter(Boolean))].sort(
    (a, b) => a - b
  );
  $('inningFilter').innerHTML =
    '<option value="all">전체 이닝</option>' +
    innings.map((i) => `<option value="${i}">${i}회</option>`).join('');
  if (inning !== 'all' && !innings.some((i) => String(i) === String(inning))) inning = 'all';
  $('inningFilter').value = inning;
  const plays = filterPlays(logSource, { inning, highlights: highlight && !d.highlights?.length });
  $('relayLog').innerHTML = plays.length
    ? plays
        .slice(0, logLimit)
        .map(
          (p, i) =>
            `<article class="relay-play ${i === 0 ? 'latest' : ''}"><div class="play-header"><span class="inning-chip">${p.inning ? esc(p.inning) + '회 ' + esc(p.half) : '경기'}</span><strong>${esc(/^=+$/.test(p.title) ? '경기 종료' : p.title || '경기 진행')}</strong></div>${p.lines.map((l) => `<p><span>${esc(l.text)}</span>${l.speed ? `<small class="pitch">${esc(l.speed)} km/h${l.stuff ? ' · ' + esc(l.stuff) : ''}</small>` : ''}</p>`).join('')}</article>`
        )
        .join('')
    : empty(
        highlight ? '제공된 기록에 득점·주요 장면이 없어요.' : '아직 제공된 문자 중계가 없어요.'
      );
  $('relayMore').hidden = plays.length <= logLimit;
  $('relayMore').textContent = `12개 더 보기 · ${Math.max(0, plays.length - logLimit)}개 남음`;
}
function compare(label, a, b) {
  const ka = numeric(a),
    kb = numeric(b),
    sum = (ka || 0) + (kb || 0);
  return `<div class="comparison-label"><b>${val(a)}</b><span>${label}</span><b>${val(b)}</b></div><div class="comparison-track" role="img" aria-label="${esc(primaryName(selectedGame()))} ${label} ${ka ?? '미확인'}, 상대 ${kb ?? '미확인'}">${ka !== null && kb !== null && sum ? `<span style="flex:${ka}"></span><span style="flex:${kb}"></span>` : ''}</div>`;
}
function recapMarkup(g, d) {
  const r = summarizeGame(g, d);
  if (!r.available)
    return `<div class="auto-recap-pending"><strong>경기 기록을 기다리고 있어요.</strong>${esc(r.reason || '최종 점수가 확정되면 결과와 주요 이닝을 자동으로 요약합니다.')}</div>`;
  return `<article class="auto-recap"><div class="recap-label">GAME RECAP <span>기록 기반 자동 요약</span></div><h3>${esc(r.title)}</h3><p class="recap-lead">${esc(r.lead)}</p>${r.bullets.length ? `<ul class="recap-points">${r.bullets.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>` : ''}<div class="recap-chips"><span class="recap-chip">결과<b>${esc(r.result)}</b></span><span class="recap-chip">점수 차<b>${r.margin}점</b></span>${r.burst ? `<span class="recap-chip">${r.limited ? '확인된 득점' : '최다 득점'}<b>${r.burst.inning}회 · ${r.burst.runs}점</b></span>` : ''}</div><p class="recap-note">네이버 스포츠의 최종 점수·이닝 기록을 바탕으로 자동 작성했습니다.${r.limited ? ' 상세 이닝 기록이 부족해 확인된 내용만 요약했습니다.' : ''}${lastData?.stale || r.stale ? ' 갱신 지연 중인 마지막 확인 기록입니다.' : ''}</p></article>`;
}
function summaryEventText(p) {
  const key = p.lines.filter((l) => /홈런|득점|홈인|적시|끝내기/.test(l.text));
  return (
    (key.length ? key : p.lines.filter((l) => / : |주자/.test(l.text)).slice(-2))
      .map((l) => esc(l.text))
      .join('<br>') || esc(p.title)
  );
}
function renderSummary() {
  refreshGameClips();
  const g = selectedGame(),
    d = relayData;
  if (!g) return;
  const r = summarizeGame(g, d),
    sideK = isHome(g) ? 'home' : 'away',
    sideO = isHome(g) ? 'away' : 'home',
    ds = d?.state || {},
    [a, b] = scores(g);
  if (isLive(g)) {
    safeReplace('summaryContent', liveRecapMarkup(g, pendingRelay || d));
    return;
  }
  if (!r.available) {
    safeReplace('summaryContent', recapMarkup(g, d));
    return;
  }
  const ev = r.events;
  safeReplace(
    'summaryContent',
    recapMarkup(g, d) +
      (r.batters.length
        ? `<div class="recap-batters"><h3>타격 주요 기록 <span>${esc(primaryName(g))}</span></h3><div class="batter-grid">${r.batters.map((p) => `<div class="batter-card"><span class="batter-avatar" aria-hidden="true">${esc(p.name.slice(0, 1))}</span><strong>${esc(p.name)}</strong><p><b>${val(p.hit)}</b>안타 <b>${val(p.rbi)}</b>타점</p><small>${val(p.ab)}타수${Number(p.hr) > 0 ? ' · ' + p.hr + '홈런' : ''}</small></div>`).join('')}</div></div>`
        : '') +
      `<div class="stat-comparison"><div class="legend" style="justify-content:space-between;margin-bottom:16px"><span><i></i>${esc(primaryName(g))}</span><span><i class="other"></i>${esc(opponent(g))}</span></div>${compare('최종 득점', a, b)}${compare('안타', ds[sideK + 'Hit'], ds[sideO + 'Hit'])}${compare('실책', ds[sideK + 'Error'], ds[sideO + 'Error'])}</div><div class="pitcher-cards">${[
        ['승리 투수', g.winPitcherName],
        ['패전 투수', g.losePitcherName],
        ['세이브', g.savePitcherName]
      ]
        .map(
          ([l, v]) =>
            `<div class="pitcher-card"><small>${l}</small><strong>${esc(v || '기록 미제공')}</strong></div>`
        )
        .join(
          ''
        )}</div><div class="summary-events"><h3>주요 장면 타임라인</h3>${ev.length ? ev.map((p) => `<div class="summary-event"><span class="inning-chip">${esc(p.inning)}회 ${esc(p.half)}</span><span>${summaryEventText(p)}</span></div>`).join('') : empty('제공된 중계 기록에 주요 장면이 없어요.')}<p class="recap-note">중계 기록에 포함된 득점·홈런·적시타·끝내기 관련 장면을 시간순으로 표시합니다.</p></div>`
  );
  renderFeaturedRecap();
}
function renderFeaturedRecap() {
  const games = lastData?.games || [],
    g = [...games].reverse().find((g) => g.statusCode === 'RESULT' && !g.cancel && !g.suspended);
  if (!g) {
    $('featuredRecap').innerHTML =
      '<div class="recap-overline">AFTER THE GAME <span>↗</span></div><div class="recap-empty-art" aria-hidden="true">◇</div><h2>마지막 아웃 뒤,<br>경기의 이야기가 남아.</h2><p class="recap-copy">조회 범위에 종료된 경기가 없어요. 경기가 끝나면 여기에 요약이 표시됩니다.</p><a href="#games" data-page="games" class="recap-link">경기 일정 보기 <span>↗</span></a>';
    return;
  }
  const r = summarizeGame(g, relayData?.gameId === g.gameId ? relayData : null);
  $('featuredRecap').innerHTML =
    `<div class="recap-overline">LAST GAME RECAP <span>↗</span></div><p class="recap-date">${short(g.gameDate)} (${weekday(g.gameDate)}) · ${esc(g.stadium || '구장 미정')}${lastData?.stale ? ' · 마지막 확인 기록' : ''}</p><h2>${esc(r.available ? r.title : '최종 기록 확인 중')}</h2>${r.available ? `<div class="recap-result"><b>${r.kia}<span style="border:0;padding:0;font-size:28px;color:var(--hero-muted)"> : </span>${r.other}</b><span>${esc(r.result)}</span></div><p class="recap-copy">${esc(r.bullets[0] || r.lead)}</p>` : ''}<button class="recap-link" data-game="${esc(g.gameId)}">종료 요약 읽기 <span>↗</span></button>`;
}
function setTab(tab) {
  activeTab = tab;
  q('[data-tab]').forEach((b) => {
    const on = b.dataset.tab === tab;
    b.setAttribute('aria-selected', String(on));
    b.tabIndex = on ? 0 : -1;
  });
  for (const name of ['situation', 'log', 'summary', 'clips'])
    $(name + 'Panel').hidden = name !== tab;
  if (tab === 'log') {
    if (pendingRelay) {
      relayData = pendingRelay;
      pendingRelay = null;
      $('newPlays').hidden = true;
    }
    renderLog();
  }
  if (tab === 'summary') renderSummary();
  if (tab === 'clips') refreshGameClips();
  else stopGameClip();
}
q('[data-tab]').forEach((b) => {
  b.addEventListener('click', () => setTab(b.dataset.tab));
  b.addEventListener('keydown', (e) => {
    const tabs = [...q('[data-tab]')],
      i = tabs.indexOf(b);
    if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) {
      e.preventDefault();
      const next =
        e.key === 'Home'
          ? 0
          : e.key === 'End'
            ? tabs.length - 1
            : (i + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
      tabs[next].focus();
      setTab(tabs[next].dataset.tab);
    }
  });
});
$('inningFilter').addEventListener('change', (e) => {
  inning = e.target.value;
  logLimit = 12;
  renderLog();
});
$('highlightFilter').addEventListener('click', () => {
  highlight = !highlight;
  logLimit = 12;
  $('highlightFilter').setAttribute('aria-pressed', String(highlight));
  renderLog();
});
$('relayMore').addEventListener('click', () => {
  logLimit += 12;
  const y = scrollY;
  renderLog();
  window.scrollTo({ top: y, behavior: 'instant' });
});
$('newPlays').addEventListener('click', () => {
  if (pendingRelay) {
    relayData = pendingRelay;
    pendingRelay = null;
  }
  logLimit = 12;
  $('newPlays').hidden = true;
  renderLog();
  renderSituation();
  renderSummary();
  $('logPanel').scrollIntoView({ behavior: smooth(), block: 'start' });
});
$('relayGame').addEventListener('change', (e) => chooseGame(e.target.value, { scroll: false }));
document.addEventListener('click', (e) => {
  const game = e.target.closest('[data-game]');
  if (game) {
    chooseGame(game.dataset.game);
    return;
  }
  const day = e.target.closest('[data-date]');
  if (day) {
    dateFilter = dateFilter === day.dataset.date ? '' : day.dataset.date;
    renderCalendar();
    renderLists();
    if (dateFilter === lastData.today) {
      const g = lastData.games.find((g) => g.gameDate === dateFilter);
      if (g) chooseGame(g.gameId);
    }
    return;
  }
});
q('[data-location]').forEach((b) =>
  b.addEventListener('click', () => {
    locationFilter = b.dataset.location;
    q('[data-location]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    renderLists();
  })
);
$('clearDate').addEventListener('click', () => {
  dateFilter = '';
  renderCalendar();
  renderLists();
});
q('[data-window]').forEach((b) =>
  b.addEventListener('click', async () => {
    const n = Number(b.dataset.window);
    if (n === windowDays) return;
    windowDays = n;
    dateFilter = '';
    q('[data-window]').forEach((x) =>
      x.setAttribute('aria-pressed', String(Number(x.dataset.window) === n))
    );
    await refreshGames(true);
  })
);
$('shareGame').addEventListener('click', async () => {
  const g = selectedGame();
  if (!g) return toast('먼저 경기를 선택해 주세요.');
  const u = new URL(location.href);
  u.searchParams.set('game', g.gameId);
  if (windowDays === 30) u.searchParams.set('days', '30');
  u.hash = 'games';
  try {
    await navigator.clipboard.writeText(u.href);
    toast('경기 링크를 복사했어요.');
  } catch {
    if (navigator.share)
      try {
        await navigator.share({ title: gameLabel(g), url: u.href });
      } catch {}
    else toast('주소창의 경기 링크를 복사해 주세요.');
  }
});
function updateMini() {
  if (currentPage !== 'home' && currentPage !== 'games') {
    $('miniScore').hidden = true;
    return;
  }
  const g =
    lastData?.games.find((g) => g.gameDate === lastData.today && isLive(g)) ||
    lastData?.games.find((g) => g.gameDate === lastData.today);
  if (!g) {
    $('miniScore').hidden = true;
    return;
  }
  const [a, b] = scores(g);
  $('miniScore').innerHTML =
    `<button data-game="${esc(g.gameId)}"><span>KIA</span><b>${g.statusCode === 'BEFORE' ? time(g) : g.cancel ? '취소' : val(a) + ' : ' + val(b)}</b><span>${esc(opponent(g))}</span><span class="mini-state">${lastData.stale ? '갱신 지연' : esc(status(g))}</span></button>`;
  $('miniScore').hidden = currentPage === 'home' && $('today').getBoundingClientRect().bottom > 90;
}
let scrollQueued = false;
window.addEventListener(
  'scroll',
  () => {
    if (scrollQueued) return;
    scrollQueued = true;
    requestAnimationFrame(() => {
      updateMini();
      scrollQueued = false;
    });
  },
  { passive: true }
);
function renderStandings() {
  const d = rankData;
  if (!d) return;
  $('standingsDate').textContent = d.asOf.replaceAll('-', '.') + ' 기준';
  $('standingsTable').innerHTML =
    `<table class="standings-table"><caption class="sr-only">${esc(d.asOf)} 기준 KBO 정규시즌 순위</caption><thead><tr>${['순위', '구단', '경기', '승', '패', '무', '승률', '게임차', '흐름'].map((l) => `<th scope="col">${l}</th>`).join('')}</tr></thead><tbody>${d.teams.map((t) => `<tr class="${t.code === 'HT' ? 'kia-row' : ''}"><td><b>${t.rank}</b></td><td><span class="table-team">${logo(t.code)}${esc(t.name)}</span></td><td>${t.games}</td><td>${t.wins}</td><td>${t.losses}</td><td>${t.draws}</td><td>${Number(t.pct).toFixed(3)}<div class="pct-bar" aria-hidden="true"><i style="width:${t.pct * 100}%"></i></div></td><td>${t.behind === 0 ? '–' : Number(t.behind).toFixed(1)}</td><td>${esc(t.streak || '–')}</td></tr>`).join('')}</tbody></table>`;
  const selected = $('rankTeam').value;
  $('rankTeam').innerHTML = d.teams
    .map(
      (t) =>
        `<option value="${esc(t.code)}">${t.code === 'HT' ? 'KIA만 보기' : 'KIA vs ' + esc(t.name)}</option>`
    )
    .join('');
  $('rankTeam').value = d.teams.some((t) => t.code === selected) ? selected : 'HT';
  $('rankTeam').disabled = false;
  drawRankChart();
  const missing = d.history.filter((p) => !p.ranks).length;
  $('rankWarning').hidden = !d.stale && !missing;
  $('rankWarning').textContent =
    (d.stale ? '갱신 지연 · 마지막 확인 기록입니다. ' : '') +
    (missing ? `${missing}일의 기록을 확인하지 못했습니다.` : '');
  $('rankUpdated').innerHTML =
    `<a href="https://www.koreabaseball.com/Record/TeamRank/TeamRankDaily.aspx" target="_blank" rel="noopener noreferrer">KBO 공식 기록 ↗</a> · 기록 기준 ${esc(d.asOf)} · ${d.stale ? '마지막 확인' : '조회'} ${stamp(d.fetchedAt)} · 5분마다 갱신`;
  overview();
}
function drawRankChart() {
  if (!rankData) return;
  const points = rankData.history,
    other = $('rankTeam').value,
    codes = other === 'HT' ? ['HT'] : ['HT', other],
    w = 480,
    h = 230,
    left = 25,
    right = 22,
    top = 14,
    bottom = 29;
  const x = (i) => left + (i * (w - left - right)) / (points.length - 1),
    y = (r) => top + ((r - 1) * (h - top - bottom)) / 9;
  const path = (code) => {
    let paths = [],
      s = [];
    points.forEach((p, i) => {
      const r = p.ranks?.[code];
      if (r) s.push([x(i), y(r)]);
      else if (s.length) {
        paths.push(s);
        s = [];
      }
    });
    if (s.length) paths.push(s);
    return (
      paths
        .map(
          (p) =>
            `<polyline points="${p.map((v) => v.join(',')).join(' ')}" stroke="${code === 'HT' ? 'var(--red)' : 'var(--blue)'}" stroke-width="${code === 'HT' ? 3 : 2}" ${code === 'HT' ? '' : 'stroke-dasharray="6 4"'} fill="none" stroke-linejoin="round"/>`
        )
        .join('') +
      points
        .map((p, i) =>
          p.ranks?.[code]
            ? `<circle cx="${x(i)}" cy="${y(p.ranks[code])}" r="3.5" fill="var(--surface)" stroke="${code === 'HT' ? 'var(--red)' : 'var(--blue)'}" stroke-width="2"/>`
            : ''
        )
        .join('')
    );
  };
  const labels = [0, Math.floor(points.length / 2), points.length - 1];
  $('rankChartBody').innerHTML =
    `<div class="legend"><span><i></i>KIA</span>${other !== 'HT' ? `<span><i class="other"></i>${esc(rankData.teams.find((t) => t.code === other)?.name)}</span>` : ''}</div><div id="rankReadout" class="rank-readout" aria-live="polite"></div><svg class="rank-chart" viewBox="0 0 ${w} ${h}" role="img" aria-label="최근 14일 순위 추이, 1위가 위쪽. 빨간 실선 KIA${other !== 'HT' ? ', 파란 점선 비교 팀' : ''}. 아래 슬라이더와 날짜별 기록에서 상세 확인 가능.">${Array.from({ length: 10 }, (_, i) => `<line x1="${left}" y1="${y(i + 1)}" x2="${w - right}" y2="${y(i + 1)}" stroke="var(--line)"/><text x="16" y="${y(i + 1) + 4}" text-anchor="end" font-size="10" fill="var(--muted)">${i + 1}</text>`).join('')}${[...codes].reverse().map(path).join('')}${labels.map((i) => `<text x="${x(i)}" y="${h - 5}" text-anchor="${i === 0 ? 'start' : i === points.length - 1 ? 'end' : 'middle'}" font-size="10" fill="var(--muted)">${short(points[i].date)}</text>`).join('')}<line id="rankCursor" x1="0" x2="0" y1="${top}" y2="${h - bottom}" stroke="var(--muted)" stroke-dasharray="3 3" opacity=".5"/></svg><label class="small muted" for="rankSlider">날짜를 움직여 순위를 비교하세요.</label><input id="rankSlider" class="chart-range" type="range" min="0" max="${points.length - 1}" step="1" value="${Math.min(selectedRankIndex, points.length - 1)}"><details class="rank-history-detail"><summary>날짜별 정확한 기록</summary><ul>${points.map((p) => `<li>${short(p.date)} · ${codes.map((c) => (c === 'HT' ? 'KIA' : rankData.teams.find((t) => t.code === c)?.name) + ' ' + (p.ranks?.[c] ? p.ranks[c] + '위' : '미확인')).join(' / ')}${p.asOf && p.asOf !== p.date ? ' (' + short(p.asOf) + ' 기준)' : ''}</li>`).join('')}</ul></details>`;
  const read = (i) => {
    selectedRankIndex = i;
    const p = points[i];
    $('rankReadout').innerHTML =
      `<span>${short(p.date)}${p.asOf && p.asOf !== p.date ? ' · ' + short(p.asOf) + ' 공시 기준' : ''}</span><span>KIA <strong>${p.ranks?.HT ?? '–'}</strong>위${other !== 'HT' ? ` / ${esc(rankData.teams.find((t) => t.code === other)?.name)} <b>${p.ranks?.[other] ?? '–'}</b>위` : ''}</span>`;
    $('rankSlider').setAttribute(
      'aria-valuetext',
      `${p.date}, KIA ${p.ranks?.HT ?? '미확인'}위${other !== 'HT' ? ', 비교 팀 ' + (p.ranks?.[other] ?? '미확인') + '위' : ''}`
    );
    $('rankCursor').setAttribute('x1', x(i));
    $('rankCursor').setAttribute('x2', x(i));
  };
  $('rankSlider').addEventListener('input', (e) => read(Number(e.target.value)));
  read(Math.min(selectedRankIndex, points.length - 1));
}
$('rankTeam').addEventListener('change', drawRankChart);
async function fetchJSON(path, timeout = 15000) {
  const r = await fetch(path, { cache: 'no-store', signal: AbortSignal.timeout(timeout) });
  if (!r.ok) throw Error('연결 실패');
  return r.json();
}
async function refreshGames(force = false) {
  if (postseasonCenter) return;
  if (gamesPending) {
    await gamesPending;
    if (lastData?.windowDays !== windowDays) return refreshGames(force);
    return;
  }
  const days = windowDays;
  gamesFetched = Date.now();
  gamesPending = (async () => {
    try {
      const d = await fetchJSON('/api/games?days=' + days);
      if (!Array.isArray(d.games) || !d.today) throw Error('경기 응답 오류');
      if (postseasonCenter || days !== windowDays) return;
      const was = selectedGame()?.statusCode;
      lastData = d;
      gamesFailed = !!d.stale;
      gamesFetched = Date.now();
      if (!d.stale) writeStore('kia-games-' + days, d);
      renderGames();
      if (was && was !== selectedGame()?.statusCode) {
        refreshRelay(true);
        if (selectedGame()?.statusCode === 'RESULT') {
          renderSummary();
          renderFeaturedRecap();
          if (currentPage === 'games') toast('경기가 끝났어요. 종료 요약이 준비됐어요.');
        }
      }
    } catch {
      if (postseasonCenter) return;
      gamesFailed = true;
      const cached = lastData?.windowDays === days ? lastData : readStore('kia-games-' + days);
      if (cached && Array.isArray(cached.games)) {
        const today = todayKST();
        lastData = {
          ...cached,
          today,
          from: shift(today, -days),
          to: shift(today, days),
          games: cached.games.filter(
            (g) => g.gameDate >= shift(today, -days) && g.gameDate <= shift(today, days)
          ),
          stale: true
        };
        renderGames();
      } else {
        $('notice').hidden = false;
        $('notice').textContent =
          '경기 정보 연결이 지연되고 있어요. 잠시 후 자동으로 다시 시도합니다.';
        $('today').innerHTML =
          '<div class="scoreboard"><div class="empty-board"><strong>경기 정보 연결을 기다리고 있어요</strong><small>상단 새로고침으로 다시 확인할 수 있어요.</small></div></div>';
        $('recentPanel').innerHTML = empty('경기 결과를 불러오지 못했어요.');
        $('nextPanel').innerHTML = empty('일정을 불러오지 못했어요.');
        $('relayGame').innerHTML = '<option>연결 확인 필요</option>';
        $('relayGame').disabled = true;
        renderRelayEmpty('경기 정보를 먼저 확인해야 해요.');
        $('updated').textContent = '연결 확인 필요';
      }
    } finally {
      gamesPending = null;
    }
  })();
  await gamesPending;
}
async function refreshStandings() {
  if (rankPending) return rankPending;
  rankFetched = Date.now();
  rankPending = (async () => {
    try {
      const d = await fetchJSON('/api/standings', 45000);
      if (!Array.isArray(d.teams) || d.teams.length !== 10 || d.history?.length !== 14)
        throw Error('순위 응답 오류');
      rankData = d;
      rankFailed = !!d.stale;
      rankFetched = Date.now();
      if (!d.stale) writeStore('kia-ranks', d);
      renderStandings();
    } catch {
      rankFailed = true;
      const cached = rankData || readStore('kia-ranks');
      if (cached?.teams?.length === 10 && cached?.history?.length === 14) {
        rankData = { ...cached, stale: true };
        renderStandings();
      } else {
        $('standingsDate').textContent = '연결 확인 필요';
        $('standingsTable').innerHTML = empty('순위표를 불러오지 못했어요.');
        $('rankChartBody').innerHTML = empty('순위 기록을 불러오지 못했어요.');
        $('rankWarning').hidden = false;
        $('rankWarning').textContent = '상단 새로고침으로 다시 시도할 수 있어요.';
      }
    } finally {
      rankPending = null;
    }
  })();
  return rankPending;
}
async function refreshRelay(force = false) {
  const g = selectedGame();
  if (!g) return;
  if (g.statusCode === 'BEFORE' || g.cancel) {
    relaySeq++;
    relayData = null;
    renderRelayEmpty(
      g.cancel
        ? '취소된 경기입니다.'
        : '경기 시작 전이에요. 시작 후 베이스와 득점 흐름이 여기에 표시됩니다.'
    );
    return;
  }
  if (relayPending?.id === relayId) return relayPending.promise;
  const id = relayId,
    token = ++relaySeq;
  relayFetched = Date.now();
  const promise = (async () => {
    try {
      const d = await fetchJSON(
        (postseasonCenter ? '/api/postseason/relay?gameId=' : '/api/relay?gameId=') +
          encodeURIComponent(id) +
          '&highlights=1'
      );
      if (d.gameId !== id || !Array.isArray(d.plays)) throw Error('중계 응답 오류');
      if (token !== relaySeq || id !== relayId) return;
      relayFetched = Date.now();
      relayFailed = !!d.stale;
      const changed = relayData && JSON.stringify(d.plays) !== JSON.stringify(relayData.plays);
      if (changed && activeTab === 'log' && relayData) {
        pendingRelay = d;
        const oldIds = new Set(relayData.plays.map((p) => p.id)),
          n = d.plays.filter((p) => !oldIds.has(p.id)).length;
        $('newPlays').hidden = false;
        $('newPlays').textContent = n
          ? `새 중계 ${n}개 · 눌러서 업데이트`
          : '중계 기록이 수정됐어요 · 업데이트';
        relayData = {
          ...relayData,
          state: d.state,
          score: d.score,
          inning: d.inning,
          half: d.half,
          pitcher: d.pitcher,
          batter: d.batter,
          fetchedAt: d.fetchedAt,
          stale: d.stale
        };
      } else {
        const first = !relayData;
        relayData = d;
        pendingRelay = null;
        $('newPlays').hidden = true;
        if (first || changed || activeTab !== 'log') renderLog();
      }
      renderSituation();
      renderSummary();
      renderCenterScore();
    } catch {
      if (token !== relaySeq) return;
      relayFailed = true;
      if (relayData) {
        relayData = { ...relayData, stale: true };
        renderSituation();
        renderSummary();
        renderCenterScore();
        updateRelayStatus();
      } else {
        $('relayStatus').classList.add('error');
        $('relayStatus').innerHTML =
          '<span>중계 연결이 지연되고 있어요.</span><button class="text-button" id="retryRelay">다시 시도 ↻</button>';
        $('retryRelay').addEventListener('click', () => refreshRelay(true));
        $('situationContent').innerHTML = empty(
          '중계 데이터를 불러오지 못했어요.',
          '원본 기록이나 새로고침으로 다시 확인해 주세요.'
        );
        renderSummary();
      }
    } finally {
      if (token === relaySeq) renderCenterScore();
      if (relayPending?.token === token) relayPending = null;
    }
  })();
  relayPending = { id, token, promise };
  return promise;
}
async function refreshAll(manual = false) {
  if (document.documentElement.dataset.season === 'postseason') return;
  $('refresh').disabled = true;
  $('refresh').classList.add('busy');
  $('refresh').setAttribute('aria-busy', 'true');
  try {
    await Promise.allSettled([
      refreshGames(true).then(() => refreshRelay(true)),
      refreshStandings(),
      refreshNews(),
      ...(currentPage === 'videos' ? [refreshVideos()] : [])
    ]);
    if (manual)
      toast(
        gamesFailed ||
          rankFailed ||
          relayFailed ||
          newsFailed ||
          (currentPage === 'videos' && videosFailed)
          ? '일부 정보가 지연되고 있어요. 기준 시각을 확인해 주세요.'
          : '최신 정보를 업데이트했어요.'
      );
  } finally {
    $('refresh').disabled = false;
    $('refresh').classList.remove('busy');
    $('refresh').setAttribute('aria-busy', 'false');
  }
}
$('refresh').addEventListener('click', () => refreshAll(true));
setInterval(() => {
  if (
    window.kiaSeasonResolved === false ||
    document.hidden ||
    !navigator.onLine ||
    document.documentElement.dataset.season === 'postseason'
  )
    return;
  const live = lastData?.games.some(isLive);
  if (Date.now() - gamesFetched > (gamesFailed ? 60000 : live ? 25000 : 115000))
    refreshGames().then(() => {
      if (isLive(selectedGame())) refreshRelay();
    });
  if (Date.now() - rankFetched > 295000) refreshStandings();
  const g = selectedGame();
  if (
    g &&
    g.statusCode !== 'BEFORE' &&
    (isLive(g) ? Date.now() - relayFetched > 25000 : Date.now() - relayFetched > 295000)
  )
    refreshRelay();
}, 10000);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) refreshAll();
});
window.addEventListener('online', () => {
  toast('다시 연결됐어요. 기록을 확인할게요.');
  refreshAll();
});
window.addEventListener('offline', () => {
  if (lastData) {
    lastData = { ...lastData, stale: true };
    renderGames();
  }
  if (relayData) {
    relayData = { ...relayData, stale: true };
    renderSituation();
    renderSummary();
    renderCenterScore();
    updateRelayStatus();
  }
  toast('오프라인 · 마지막 확인 기록을 표시합니다.');
});
let installPrompt;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  installPrompt = e;
  $('installApp').hidden = false;
});
$('installApp').addEventListener('click', async () => {
  if (!installPrompt) return;
  await installPrompt.prompt();
  installPrompt = null;
  $('installApp').hidden = true;
});
if ('serviceWorker' in navigator)
  window.addEventListener(
    'load',
    () => {
      const install = () => navigator.serviceWorker.register('/sw.js').catch(() => {});
      if ('requestIdleCallback' in window) window.requestIdleCallback(install, { timeout: 4000 });
      else setTimeout(install, 1500);
    },
    { once: true }
  );
if (new URLSearchParams(location.search).get('days') === '30') {
  windowDays = 30;
  q('[data-window]').forEach((b) =>
    b.setAttribute('aria-pressed', String(b.dataset.window === '30'))
  );
}

let currentPage = 'home',
  newsData = null,
  newsPending = null,
  newsFailed = false,
  newsFilter = 'all',
  newsQuery = '',
  newsLimit = 12,
  newsFetched = 0;
let savedNews = readStore('kia-saved-news');
savedNews = Array.isArray(savedNews) ? savedNews.filter(validArticle) : [];
const pageMeta = {
  settings: [
    '설정',
    '06 / PREFERENCES',
    '나에게 맞는 다이아몬드',
    '화면과 응원 방식을 설정하세요.'
  ],
  home: ['대시보드', '01 / TEAM DASHBOARD', '오늘의 타이거즈', '점수 너머, 경기의 흐름까지.'],
  games: [
    '경기 센터',
    '02 / GAME CENTER',
    '한 경기의 모든 장면',
    '지금의 승부, 끝난 경기의 이야기.'
  ],
  league: [
    '리그 순위',
    '03 / LEAGUE INSIGHTS',
    '순위로 보는 페넌트레이스',
    '타이거즈의 위치와 경쟁 팀의 흐름.'
  ],
  videos: [
    '하이라이트',
    '05 / TIGERS PLAYBACK',
    '승부를 다시 재생하다',
    '최근 7일 경기, 놓칠 수 없는 장면.'
  ],
  news: [
    '최신 뉴스',
    '04 / TIGERS NEWSROOM',
    '지금, 타이거즈',
    '오늘의 기사와 구단 소식을 한곳에서.'
  ]
};
function setView(page, { scroll = true, hash = true } = {}) {
  if (document.documentElement.dataset.season === 'postseason') {
    window.kiaPostseasonNavigate?.(page, { scroll });
    return;
  }
  if (!pageMeta[page]) page = 'home';
  if (page !== 'games') stopGameClip();
  if (currentPage === 'videos' && page !== 'videos') stopVideo();
  currentPage = page;
  for (const name of Object.keys(pageMeta)) $(name + 'Page').hidden = name !== page;
  q('[data-page]').forEach((a) => {
    if (a.dataset.page === page) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
  const [label, eyebrow, title, desc] = pageMeta[page];
  $('pageCrumb').textContent = label;
  $('pageEyebrow').textContent = eyebrow;
  $('pageTitle').innerHTML = esc(title) + '<span class="red-dot">.</span>';
  $('pageDescription').textContent = desc;
  document.title = label + ' · KIA 다이아몬드';
  window.kiaLiquidMount?.();
  if (hash) {
    const u = new URL(location.href);
    u.hash = page;
    history.replaceState(null, '', u.pathname + u.search + u.hash);
  }
  if (scroll) window.scrollTo({ top: 0, behavior: 'instant' });
  if (page === 'news' && Date.now() - newsFetched > 300000) refreshNews();
  if (page === 'videos') {
    renderVideos();
    if (Date.now() - videoFetched > 300000) refreshVideos();
  }
  if (page === 'league' && rankData) drawRankChart();
  updateMini();
}
function applyHash() {
  const h = location.hash.slice(1),
    aliases = {
      today: 'home',
      relay: 'games',
      recent: 'games',
      upcoming: 'games',
      standings: 'league',
      summary: 'games'
    };
  setView(aliases[h] || h || (requestedGame ? 'games' : 'home'), { scroll: false, hash: false });
  if (h === 'summary') setTab('summary');
}
document.addEventListener('click', (e) => {
  const a = e.target.closest('[data-page]');
  if (a && !e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey) {
    e.preventDefault();
    setView(a.dataset.page);
  }
});
window.addEventListener('hashchange', applyHash);
const categoryLabels = { game: '경기·순위', team: '선수·전력', club: '구단 소식' };
function relativeDate(date) {
  const minutes = Math.max(0, Math.floor((Date.now() - Date.parse(date)) / 60000));
  return minutes < 1
    ? '방금 전'
    : minutes < 60
      ? minutes + '분 전'
      : minutes < 1440
        ? Math.floor(minutes / 60) + '시간 전'
        : Math.floor(minutes / 1440) + '일 전';
}
function newsCard(a, { save = true } = {}) {
  const selected = savedNews.some((n) => n.id === a.id);
  return `<article class="news-card"><div class="news-card-top"><span class="publisher-mark" aria-hidden="true">${esc(a.publisher.slice(0, 1))}</span><span class="news-publisher">${esc(a.publisher)}</span><time class="news-time" datetime="${esc(a.publishedAt)}" title="${esc(stamp(a.publishedAt))}">${relativeDate(a.publishedAt)}</time></div><h3><a href="${esc(a.url)}" target="_blank" rel="noopener noreferrer">${esc(a.title)}</a></h3><div class="news-card-foot"><span class="news-category">${categoryLabels[a.category] || '구단 소식'}</span><span class="external-indicator" aria-hidden="true">↗</span>${save ? `<button class="news-save" data-save-news="${esc(a.id)}" aria-pressed="${selected}" aria-label="${esc(a.title)} ${selected ? '저장 해제' : '저장'}" title="${selected ? '저장 해제' : '기사 저장'}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h12v18l-6-4-6 4z"/></svg></button>` : ''}</div></article>`;
}
function validArticle(a) {
  try {
    const u = new URL(a.url);
    return (
      u.protocol === 'https:' &&
      typeof a.title === 'string' &&
      typeof a.publisher === 'string' &&
      Number.isFinite(Date.parse(a.publishedAt)) &&
      typeof a.id === 'string'
    );
  } catch {
    return false;
  }
}
function currentNews() {
  return (newsData?.articles || []).filter(
    (a) => validArticle(a) && Date.now() - Date.parse(a.publishedAt) <= 7 * 86400000
  );
}
function renderNews() {
  const fresh = currentNews(),
    all = newsFilter === 'saved' ? savedNews.filter(validArticle) : fresh;
  const articles = all.filter(
    (a) =>
      (['all', 'saved'].includes(newsFilter) || a.category === newsFilter) &&
      (!newsQuery || (a.title + ' ' + a.publisher).toLowerCase().includes(newsQuery.toLowerCase()))
  );
  $('newsCount').textContent = String(fresh.length);
  $('newsList').innerHTML = articles.length
    ? articles
        .slice(0, newsLimit)
        .map((a) => newsCard(a))
        .join('')
    : `<div class="panel empty"><span class="news-error-icon" aria-hidden="true">◇</span>${newsFilter === 'saved' ? '저장한 기사가 없어요. 기사 오른쪽 북마크를 눌러 보세요.' : newsQuery ? '검색어와 일치하는 기사가 없어요.' : newsData ? '선택한 분류에 최근 7일 기사가 없어요.' : '뉴스를 불러오지 못했어요. 잠시 후 다시 확인해 주세요.'}${!newsData ? '<div><a href="https://www.yna.co.kr/sports/baseball" target="_blank" rel="noopener noreferrer">연합뉴스 야구 ↗</a><a href="https://www.donga.com/news/Sports" target="_blank" rel="noopener noreferrer">동아일보 스포츠 ↗</a></div>' : ''}</div>`;
  $('newsMore').hidden = articles.length <= newsLimit;
  $('newsMore').textContent = `기사 더 보기 · ${Math.max(0, articles.length - newsLimit)}개 남음`;
  $('newsUpdated').textContent = newsData
    ? (newsData.stale ? '마지막 확인 ' : '조회 ') + stamp(newsData.fetchedAt) + ' · 최신 발행순'
    : '연결 확인 필요';
  $('newsNotice').hidden = !newsData?.stale && !newsData?.partial;
  $('newsNotice').textContent = newsData?.stale
    ? '뉴스 갱신이 지연되어 마지막 확인 목록을 표시합니다. 발행 시각을 확인해 주세요.'
    : newsData?.partial
      ? '일부 언론사 연결이 지연되어 확인된 매체의 기사만 표시합니다.'
      : '';
  $('homeNews').innerHTML = fresh.length
    ? fresh
        .slice(0, 3)
        .map((a) => newsCard(a, { save: false }))
        .join('')
    : '<div class="panel empty">' +
      (newsData ? '최근 7일 관련 기사가 없어요.' : '최신 뉴스 연결을 기다리고 있어요.') +
      ' <a href="#news" data-page="news">뉴스룸에서 확인 ↗</a></div>';
  q('[data-news-filter]').forEach((b) =>
    b.setAttribute('aria-pressed', String(b.dataset.newsFilter === newsFilter))
  );
}
async function refreshNews() {
  if (newsPending) return newsPending;
  newsFetched = Date.now();
  $('refreshNews').disabled = true;
  newsPending = (async () => {
    try {
      const d = await fetchJSON('/api/news', 20000);
      if (!Array.isArray(d.articles)) throw Error('Invalid news');
      d.articles = d.articles.filter(validArticle);
      newsData = d;
      newsFailed = !!d.stale;
      if (!d.stale) writeStore('kia-news', d);
      renderNews();
    } catch {
      newsFailed = true;
      const cached = newsData || readStore('kia-news');
      newsData = cached && Array.isArray(cached.articles) ? { ...cached, stale: true } : null;
      renderNews();
    } finally {
      newsPending = null;
      $('refreshNews').disabled = false;
    }
  })();
  return newsPending;
}
q('[data-news-filter]').forEach((b) =>
  b.addEventListener('click', () => {
    newsFilter = b.dataset.newsFilter;
    newsLimit = 12;
    renderNews();
  })
);
$('newsSearch').addEventListener('input', (e) => {
  newsQuery = e.target.value.trim();
  newsLimit = 12;
  renderNews();
});
$('newsMore').addEventListener('click', () => {
  newsLimit += 12;
  renderNews();
});
$('refreshNews').addEventListener('click', () => refreshNews());
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-save-news]');
  if (!b) return;
  const id = b.dataset.saveNews,
    exists = savedNews.some((a) => a.id === id);
  if (exists) savedNews = savedNews.filter((a) => a.id !== id);
  else {
    const a = newsData?.articles.find((a) => a.id === id);
    if (a) savedNews = [a, ...savedNews].slice(0, 100);
  }
  writeStore('kia-saved-news', savedNews);
  renderNews();
  toast(exists ? '저장을 해제했어요.' : '이 기기에 기사를 저장했어요.');
});
setInterval(() => {
  if (
    window.kiaSeasonResolved !== false &&
    document.documentElement.dataset.season !== 'postseason' &&
    !document.hidden &&
    navigator.onLine &&
    Date.now() - newsFetched > 300000
  )
    refreshNews();
}, 30000);
let videoData = null,
  videoPending = null,
  videoFetched = 0,
  videoDate = 'all',
  playingVideo = '',
  videosFailed = false;
function currentVideos() {
  const today = todayKST(),
    from = shift(today, -6);
  return (videoData?.videos || []).filter(
    (v) =>
      typeof v.title === 'string' &&
      /^[\w-]{11}$/.test(v.id || '') &&
      v.gameDate >= from &&
      v.gameDate <= today
  );
}
function videoSearch(date) {
  return (
    'https://www.youtube.com/results?search_query=' +
    encodeURIComponent(
      'KIA ' + (date === 'all' ? '' : date.replaceAll('-', '.')) + ' 경기 하이라이트'
    )
  );
}
function videoCard(v) {
  return `<article class="video-card" data-selected="${playingVideo === v.id}"><button class="video-thumb" data-play-video="${v.id}" aria-label="${esc(v.title)} 재생"><img src="https://i.ytimg.com/vi/${v.id}/hqdefault.jpg" alt="" loading="lazy" width="480" height="270"><span class="video-play"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m8 5 11 7-11 7z"/></svg></span><span class="video-thumb-label">${playingVideo === v.id ? '선택한 영상' : '경기 요약'}</span></button><div class="video-card-body"><time datetime="${v.gameDate}">${short(v.gameDate)} (${weekday(v.gameDate)}) 경기</time><h3>${esc(v.title)}</h3><div class="video-card-foot"><span>KBO 공식 하이라이트</span><a href="https://www.youtube.com/watch?v=${v.id}" target="_blank" rel="noopener noreferrer">YouTube ↗</a></div></div></article>`;
}
function stopVideo() {
  playingVideo = '';
  $('videoPlayer').innerHTML = '';
  $('videoPlayer').hidden = true;
}
function playVideo(id) {
  const v = currentVideos().find((v) => v.id === id);
  if (!v) return;
  playingVideo = id;
  const player = $('videoPlayer');
  player.hidden = false;
  player.innerHTML = `<div class="video-frame"><iframe src="https://www.youtube-nocookie.com/embed/${v.id}?autoplay=1&playsinline=1&rel=0" title="${esc(v.title)}" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe></div><div class="video-player-foot"><div><h3>${esc(v.title)}</h3><p>${short(v.gameDate)} 경기 · 재생이 제한되면 YouTube에서 시청해 주세요.</p></div><div class="video-player-actions"><a href="https://www.youtube.com/watch?v=${v.id}" target="_blank" rel="noopener noreferrer">YouTube에서 보기 ↗</a><button class="text-button" data-close-video aria-label="영상 재생 닫기">닫기 ×</button></div></div>`;
  renderVideos();
  player.scrollIntoView({
    behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
    block: 'start'
  });
}
function renderVideos() {
  const today = todayKST(),
    days = Array.from({ length: 7 }, (_, i) => shift(today, -i)),
    all = currentVideos();
  if (videoDate !== 'all' && !days.includes(videoDate)) videoDate = 'all';
  const shown = all.filter((v) => videoDate === 'all' || v.gameDate === videoDate);
  $('videoRange').textContent = short(days[6]) + ' – ' + short(today) + ' · 최근 7일';
  const datesHTML =
    `<button data-video-date="all" aria-pressed="${videoDate === 'all'}"><small>최근 7일</small><strong>전체</strong><span>${all.length}개 영상</span></button>` +
    days
      .map((d) => {
        const n = all.filter((v) => v.gameDate === d).length;
        return `<button data-video-date="${d}" aria-pressed="${videoDate === d}"><small>${d === today ? '오늘' : weekday(d) + '요일'}</small><strong>${short(d)}</strong><span>${n ? n + '개 영상' : videoData?.stale ? '확인 필요' : videoData?.checkedDays?.includes(d) ? '등록 영상 없음' : '확인 중'}</span></button>`;
      })
      .join('');
  const datesNode = $('videoDates');
  if (datesNode.dataset.days !== days.join(',')) {
    datesNode.innerHTML = datesHTML;
    datesNode.dataset.days = days.join(',');
  } else {
    datesNode.querySelectorAll('[data-video-date]').forEach((b) => {
      const d = b.dataset.videoDate,
        n = d === 'all' ? all.length : all.filter((v) => v.gameDate === d).length;
      b.setAttribute('aria-pressed', String(d === videoDate));
      b.querySelector('span').textContent =
        d === 'all'
          ? n + '개 영상'
          : n
            ? n + '개 영상'
            : videoData?.stale
              ? '확인 필요'
              : videoData?.checkedDays?.includes(d)
                ? '등록 영상 없음'
                : '확인 중';
    });
  }
  $('videoListTitle').textContent =
    videoDate === 'all' ? '최근 7일 하이라이트' : short(videoDate) + ' 경기 하이라이트';
  $('videoCount').textContent = shown.length + '개 영상';
  $('videoList').innerHTML = shown.length
    ? shown.map(videoCard).join('')
    : `<div class="panel video-empty"><h3>${!videoData ? '영상 연결을 기다리고 있어요' : videoData.stale ? '최신 영상 확인이 필요해요' : '등록된 유튜브 영상이 없어요'}</h3><p>${!videoData || videoData.stale ? '영상 새로고침으로 다시 시도하거나 유튜브에서 확인해 주세요.' : '경기가 없거나, 경기 요약이 아직 등록되지 않았을 수 있어요.<br>영상이 올라오면 이곳에서 확인할 수 있어요.'}</p><a href="${videoSearch(videoDate)}" target="_blank" rel="noopener noreferrer">${videoDate === 'all' ? 'KIA' : short(videoDate) + ' KIA'} 하이라이트 유튜브에서 찾기 ↗</a></div>`;
  $('videoNotice').hidden = !videoData?.stale && !videoData?.partial;
  $('videoNotice').textContent = videoData?.stale
    ? '영상 목록 갱신이 지연되어 마지막 확인 목록을 표시합니다.'
    : videoData?.partial
      ? '일부 날짜 또는 영상 연결이 지연되어 확인된 영상만 표시합니다.'
      : '';
  $('videoUpdated').textContent = videoData
    ? (videoData.stale ? '마지막 확인 ' : '목록 확인 ') + stamp(videoData.fetchedAt)
    : '연결 확인 필요';
}
async function refreshVideos() {
  if (videoPending) return videoPending;
  videoFetched = Date.now();
  $('refreshVideos').disabled = true;
  $('refreshVideos').setAttribute('aria-busy', 'true');
  videoPending = (async () => {
    try {
      const d = await fetchJSON('/api/videos', 25000);
      if (!Array.isArray(d.videos)) throw Error('Invalid videos');
      videoData = d;
      videosFailed = !!d.stale;
      if (!d.stale) writeStore('kia-videos', d);
    } catch {
      videosFailed = true;
      const cached = videoData || readStore('kia-videos');
      videoData = cached && Array.isArray(cached.videos) ? { ...cached, stale: true } : null;
    } finally {
      renderVideos();
      videoPending = null;
      $('refreshVideos').disabled = false;
      $('refreshVideos').setAttribute('aria-busy', 'false');
    }
  })();
  return videoPending;
}
$('refreshVideos').addEventListener('click', () => refreshVideos());
document.addEventListener('click', (e) => {
  const date = e.target.closest('[data-video-date]'),
    play = e.target.closest('[data-play-video]'),
    close = e.target.closest('[data-close-video]');
  if (date) {
    videoDate = date.dataset.videoDate;
    stopVideo();
    renderVideos();
  }
  if (play) playVideo(play.dataset.playVideo);
  if (close) {
    stopVideo();
    renderVideos();
  }
});
setInterval(() => {
  if (
    document.documentElement.dataset.season !== 'postseason' &&
    currentPage === 'videos' &&
    !document.hidden &&
    navigator.onLine &&
    Date.now() - videoFetched > 300000
  )
    refreshVideos();
}, 30000);

window.kiaRegularStart = () => {
  applyHash();
  return refreshAll().then(() => {
    if (requestedGame && selectedGame()) setView('games', { scroll: false });
    if (currentPage === 'games' && selectedGame()?.statusCode === 'RESULT') setTab('summary');
  });
};
if (!window.kiaSeasonManaged) window.kiaRegularStart();

window.kiaGameCenter = {
  setPostseason(d) {
    if (!d) {
      if (!postseasonCenter) return;
      postseasonCenter = false;
      lastData = null;
      relayId = '';
      relayData = null;
      relaySeq++;
      manualGame = false;
      dateFilter = '';
      locationFilter = 'all';
      refreshGames(true);
      return;
    }
    const entering = !postseasonCenter,
      previous = selectedGame()?.statusCode;
    postseasonCenter = true;
    if (entering) {
      relaySeq++;
      relayId = '';
      relayData = null;
      pendingRelay = null;
      dateFilter = '';
      locationFilter = 'all';
      manualGame = false;
    }
    lastData = {
      ...d,
      from: d.start || d.today,
      to: d.games.at(-1)?.gameDate || d.today,
      windowDays: 30
    };
    renderCalendar();
    renderLists();
    syncRelay();
    if (
      previous &&
      previous !== selectedGame()?.statusCode &&
      selectedGame()?.statusCode === 'RESULT'
    )
      setTab('summary');
    refreshRelay(true);
  },
  open(id) {
    chooseGame(id, { scroll: false });
  },
  show() {
    currentPage = 'games';
    $('gamesPage').hidden = false;
    renderCenterScore();
  }
};

function probabilityMarkup(g, d) {
  if (!g) return '';
  if (g.statusCode === 'BEFORE' && !g.cancel && !g.suspended) return pregameMarkup(g);
  if (!isLive(g)) {
    const h = numeric(g.homeTeamScore),
      a = numeric(g.awayTeamScore),
      done = g.statusCode === 'RESULT' && !g.cancel && !g.suspended;
    const message = g.cancel
      ? '취소된 경기예요.'
      : g.suspended
        ? '경기가 중단되어 예측을 잠시 멈췄어요.'
        : done
          ? h !== null && a !== null
            ? h === a
              ? `무승부 · ${h}–${a} 경기 종료`
              : h > a
                ? `${g.homeTeamName} 승리 · ${h}–${a} 경기 종료`
                : `${g.awayTeamName} 승리 · ${a}–${h} 경기 종료`
            : '경기가 종료됐어요.'
          : '경기 정보를 확인하고 있어요.';
    return `<section class="win-estimate"><div class="chart-heading"><h3>승리 확률 예측</h3><span class="pill">${done ? '최종 결과' : '예측 대기'}</span></div><p>${esc(message)}</p></section>`;
  }
  return pregameMarkup(g);
}
function probabilityBar(g, p) {
  return `<div class="win-labels"><strong>${esc(g.homeTeamName)} ${p.home}%</strong><strong>${esc(g.awayTeamName)} ${p.away}%</strong></div><div class="win-meter" role="img" aria-label="${esc(g.homeTeamName)} ${p.home}퍼센트, ${esc(g.awayTeamName)} ${p.away}퍼센트"><span style="width:${p.home}%"></span></div>`;
}
function pregameMarkup(g) {
  const d = pregameCache.get(g.gameId),
    p = pregameEstimate(g, d),
    primary = d?.sources?.find((s) => s.source === d.primary),
    confirmed = d?.sources?.find((s) => s.lineupConfirmed),
    expired = d?.stale || Date.now() - Date.parse(d?.fetchedAt) > 600000;
  const starters = ['home', 'away']
    .map(
      (side) =>
        `<div><span>${esc(g[side + 'TeamName'])} 예고 선발</span><strong>${esc(d?.starters?.[side] || primary?.starters?.[side] || g[side + 'StarterName'] || '미발표')}</strong></div>`
    )
    .join('');
  const rosters = ['home', 'away']
    .map((side) => {
      const actual = confirmed?.lineups?.[side],
        expected = d?.expectedLineups?.[side],
        list = actual?.length ? actual : expected?.players || [];
      return `<div><h4>${esc(g[side + 'TeamName'])} ${actual?.length ? '확정 타순' : '예상 타순'}</h4><p class="small muted">${actual?.length ? '외부 제공처의 확정 라인업' : expected ? esc(expected.date) + ' 직전 경기 기준 · 출전 미확정' : '확인 가능한 타순 자료 없음'}</p>${list.length ? `<ol>${list.map((x) => `<li>${esc(x.name)}${x.ops != null ? ' · OPS ' + esc(x.ops) : ''}</li>`).join('')}</ol>` : ''}${expected && !actual?.length ? `<a href="${esc(expected.url)}" target="_blank" rel="noopener noreferrer">타순 근거 ↗</a>` : ''}</div>`;
    })
    .join('');
  const sources = (d?.sources || [])
    .map(
      (x) =>
        `<li><a href="${esc(x.url)}" target="_blank" rel="noopener noreferrer">${esc(x.source)} ↗</a> — ${x.available && !expired ? `${esc(g.homeTeamName)} ${x.home}% / ${esc(g.awayTeamName)} ${x.away}%` : esc(expired ? '재확인 필요' : x.reason)}${x.available ? `<p class="small muted">${esc(x.basis)}${x.factors?.length ? ' · 반영 항목: ' + esc(x.factors.join(', ')) : ''}</p>` : ''}</li>`
    )
    .join('');
  const metrics = confirmed?.metrics || [];
  return `<section class="win-estimate"><div class="chart-heading"><h3>${isLive(g) ? '외부 사이트 승리 예측' : '경기 전 승리 예측'}</h3><span class="pill">${p ? '출처 기반' : '자료 확인 중'}</span></div>${isLive(g) ? '<p class="small muted">경기 전 전망 · 현재 점수와 이닝을 반영한 실시간 승률이 아닙니다.</p>' : ''}${p ? probabilityBar(g, p) + `<p class="small muted"><a href="${esc(primary.url)}" target="_blank" rel="noopener noreferrer">${esc(primary.source)} 원문 ↗</a> · ${esc(primary.basis)}</p>` : '<p>신뢰할 수 있는 경기별 예측이 아직 없어 확률을 표시하지 않아요.</p>'}<div class="at-bat">${starters}</div><p class="small muted">${primary?.asOf ? '출처 갱신 ' + stamp(primary.asOf) + ' · ' : ''}${d?.fetchedAt ? stamp(d.fetchedAt) + ' 조회 · ' : ''}5분마다 자료 확인${expired ? ' · 자료 갱신 지연' : ''}</p><details><summary>선발·타순·외부 예측 근거 보기</summary><div class="pregame-rosters">${rosters}</div><h4>외부 예측 비교</h4><ul>${sources || '<li>예측 자료를 조회하고 있어요.</li>'}</ul>${metrics.length ? `<h4>확정 라인업 모델 입력</h4>${metrics.map((x) => `<p>${esc(g[x.side + 'TeamName'])} · 타선 OPS ${x.lineupOps ?? '미제공'} · 선발 FIP ${x.starterFip ?? '미제공'} · 불펜 FIP ${x.bullpenFip ?? '미제공'}</p>`).join('')}` : ''}<p>확정 타순·선발·불펜 지표가 포함된 외부 모델을 우선하고, 없으면 해당 경기의 다른 공개 예측을 표시합니다. 확률 정의가 다른 제공처 수치는 평균 내지 않습니다. 직전 경기 타순은 참고용 예상이며, 자체 가중치로 확률을 조정하지 않습니다. 선발 변경·미공개 라인업에 따라 예측이 달라질 수 있습니다.</p></details></section>`;
}
async function refreshPregame(g) {
  const id = g.gameId;
  if (pregamePending.has(id) || Date.now() - (pregameAttempt.get(id) || 0) < 300000) return;
  pregameAttempt.set(id, Date.now());
  pregamePending.add(id);
  try {
    const d = await fetchJSON('/api/pregame?gameId=' + encodeURIComponent(id), 35000);
    if (d.gameId !== id || !Array.isArray(d.sources)) throw Error('Invalid pregame');
    pregameCache.set(id, d);
  } catch {
    pregameCache.set(id, { ...pregameCache.get(id), gameId: id, stale: true });
  } finally {
    pregamePending.delete(id);
    if (pregameCache.size > 30) pregameCache.delete(pregameCache.keys().next().value);
    if (selectedGame()?.gameId === id) renderCenterScore();
  }
}
function liveRecapMarkup(g, d) {
  const r = liveSummary(g, d);
  if (!r)
    return empty(
      '진행 중 요약을 준비하고 있어요.',
      '점수와 이닝 기록이 연결되면 자동으로 표시됩니다.'
    );
  return `<article class="auto-recap"><div class="recap-label">LIVE RECAP <span>${r.stale ? '갱신 지연 · 마지막 기록' : '경기 중 · 기록 기반 자동 요약'}</span></div><h3>${esc(r.title)}</h3><p class="recap-lead">${esc(r.lead)}</p><p class="small muted">${stamp(d.fetchedAt)} 기준 · 경기 종료 전 기록입니다.</p><div class="at-bat"><div><span>현재 투수</span><strong>${esc(d.pitcher || '미확인')}</strong></div><div><span>현재 타자</span><strong>${esc(d.batter || '미확인')}</strong></div></div><div class="summary-events"><h3>최근 주요 장면</h3>${r.events.length ? r.events.map((p) => `<div class="summary-event"><span class="inning-chip">${esc(p.inning)}회 ${esc(p.half)}</span><span>${summaryEventText(p)}</span></div>`).join('') : '<p>제공된 기록에 주요 장면이 아직 없어요.</p>'}</div></article>`;
}

function stopGameClip() {
  const n = $('gameClipPlayer');
  if (n) n.innerHTML = '';
}
function renderGameClips(g) {
  const d = clipData,
    items = d?.clips || [];
  $('gameClipList').innerHTML = items.length
    ? items
        .map(
          (v) =>
            `<article class="video-card">${v.thumbnail ? `<img src="${esc(v.thumbnail)}" alt="" loading="lazy" style="width:100%;aspect-ratio:16/9;object-fit:cover">` : ''}<div class="video-card-body"><p class="small muted">${esc(v.source)}</p><h3>${esc(v.title)}</h3><div class="video-player-actions">${v.embedUrl ? `<button class="pill" data-game-clip="${esc(v.id)}">▶ 여기서 재생</button>` : ''}<a href="${esc(v.url)}" target="_blank" rel="noopener noreferrer">주요 장면 보기 ↗</a></div></div></article>`
        )
        .join('')
    : empty(
        d?.stale ? '영상 연결이 지연되고 있어요.' : '아직 등록된 주요 장면이 없어요.',
        '경기 중 공개되는 영상을 1분 간격으로 확인합니다.'
      );
  $('gameClipStatus').textContent = d
    ? (d.stale ? '갱신 지연 · ' : '') +
      (d.fetchedAt ? stamp(d.fetchedAt) + ' 확인' : '연결 확인 필요')
    : '영상 목록을 확인하고 있어요.';
  $('gameClipSource').href =
    `https://m.sports.naver.com/game/${encodeURIComponent(g.gameId)}/video`;
}
async function refreshGameClips(force = false) {
  const g = selectedGame();
  if (!g) return;
  const id = g.gameId;
  if (clipGame !== id) {
    clipGame = id;
    clipData = null;
    clipFetched = 0;
    clipSeq++;
    stopGameClip();
    renderGameClips(g);
  }
  if (clipPending === id || (!force && Date.now() - clipFetched < 60000)) return;
  clipPending = id;
  const token = ++clipSeq;
  clipFetched = Date.now();
  try {
    const d = await fetchJSON('/api/game-clips?gameId=' + encodeURIComponent(id));
    if (d.gameId !== id || !Array.isArray(d.clips)) throw Error('Invalid clips');
    if (token !== clipSeq || selectedGame()?.gameId !== id) return;
    clipData = d;
  } catch {
    if (token !== clipSeq || selectedGame()?.gameId !== id) return;
    clipData = { ...clipData, stale: true };
  } finally {
    if (clipPending === id) clipPending = '';
    if (token === clipSeq && selectedGame()?.gameId === id) renderGameClips(g);
  }
}
$('refreshGameClips').addEventListener('click', () => refreshGameClips(true));
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-game-clip]');
  if (!b) return;
  const v = clipData?.clips.find((v) => v.id === b.dataset.gameClip);
  if (!v?.embedUrl) return;
  $('gameClipPlayer').innerHTML =
    `<div class="video-frame"><iframe src="${esc(v.embedUrl)}" title="${esc(v.title)}" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen></iframe></div><button class="text-button" id="closeGameClip">재생 닫기 ×</button><p class="small muted">재생이 제한되면 영상의 원본 링크에서 시청하세요.</p>`;
  $('closeGameClip').onclick = stopGameClip;
});
setInterval(() => {
  if (!document.hidden && navigator.onLine && currentPage === 'games') refreshGameClips();
}, 15000);

setInterval(() => {
  if (!document.hidden && currentPage === 'games') renderCenterScore();
}, 15000);
