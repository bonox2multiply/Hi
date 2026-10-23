const defaults = { theme: 'system', start: 'home', team: 'all', font: 'normal', motion: 'full' };
const allowed = {
  theme: ['system', 'light', 'dark'],
  start: ['home', 'games', 'news', 'videos'],
  team: ['all', 'kia'],
  font: ['normal', 'large'],
  motion: ['full', 'soft', 'off']
};
let prefs = { ...defaults };
try {
  const saved = JSON.parse(localStorage.getItem('kia-preferences') || '{}');
  for (const k in defaults) if (allowed[k].includes(saved[k])) prefs[k] = saved[k];
} catch {}
const system = matchMedia('(prefers-color-scheme: dark)');
function apply(notify = false) {
  window.kiaPreferences = { ...prefs };
  document.documentElement.dataset.theme =
    prefs.theme === 'system' ? (system.matches ? 'dark' : 'light') : prefs.theme;
  document.documentElement.dataset.font = prefs.font;
  document.documentElement.dataset.motion = prefs.motion;
  document
    .querySelectorAll('[data-pref]')
    .forEach((b) =>
      b.setAttribute('aria-pressed', String(prefs[b.dataset.pref] === b.dataset.value))
    );
  try {
    localStorage.setItem('kia-preferences', JSON.stringify(prefs));
  } catch {
    document.getElementById('settingsSaved').textContent =
      '이 브라우저에서는 설정 저장이 제한돼요.';
  }
  if (notify) window.dispatchEvent(new Event('kia-preferences'));
}
function season(value) {
  const select = document.getElementById('seasonMode');
  if (select) {
    select.value = value;
    select.dispatchEvent(new Event('change'));
  }
  document
    .querySelectorAll('[data-season-choice]')
    .forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.seasonChoice === value)));
}
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-pref],[data-season-choice]');
  if (!b) return;
  if (b.dataset.pref) {
    prefs[b.dataset.pref] = b.dataset.value;
    apply(true);
  } else season(b.dataset.seasonChoice);
});
document.getElementById('settingsReset').addEventListener('click', () => {
  prefs = { ...defaults };
  apply(true);
  season('auto');
  document.getElementById('settingsSaved').textContent = '기본 설정으로 복원했어요.';
});
async function status() {
  const connection = document.getElementById('settingsConnection');
  connection.textContent = navigator.onLine
    ? '연결 상태 확인 중'
    : '오프라인 · 마지막 기록을 표시해요';
  if (!navigator.onLine) return;
  try {
    const r = await fetch('/api/postseason', { signal: AbortSignal.timeout(15000) });
    if (!r.ok) throw Error();
    const d = await r.json();
    connection.textContent = d.stale
      ? '갱신 지연 · 마지막 확인 기록'
      : '온라인 · 경기 데이터 연결 정상';
    document.getElementById('settingsUpdated').textContent = d.fetchedAt
      ? '최근 갱신 ' + new Date(d.fetchedAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })
      : '아직 확인된 경기 기록이 없어요.';
  } catch {
    connection.textContent = '서버 연결 지연 · 다시 확인해 주세요.';
  }
}
document.getElementById('settingsRefresh').addEventListener('click', status);
window.addEventListener('online', status);
window.addEventListener('offline', status);
system.addEventListener('change', () => apply());
apply();
let mode = 'auto';
try {
  mode = localStorage.getItem('kia-season-mode') || 'auto';
} catch {}
document
  .querySelectorAll('[data-season-choice]')
  .forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.seasonChoice === mode)));
document.getElementById('settingsConnection').textContent = navigator.onLine
  ? '온라인 · 새로고침으로 연결 확인'
  : '오프라인';
