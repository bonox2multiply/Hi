// Provider fixtures and the existing schedule UI express offset-free times in Korea time.
const reasons = {
  offline: '오프라인에서는 최신 일정을 확인할 수 없어요. 연결 후 새로고침해 주세요.',
  stale_data: '일정 정보를 새로고침한 뒤 다운로드해 주세요.',
  ineligible_status: '취소·중단·진행·종료 경기는 다운로드할 수 없어요.',
  invalid_time: '시작 시각이 확정되지 않아 다운로드할 수 없어요.',
  invalid_game: '경기 정보를 확인할 수 없어 다운로드할 수 없어요.',
};
const fail = code => ({ok: false, code, message: reasons[code]});
const utcStamp = ms => new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
const text = value => Array.from(String(value || '')).slice(0, 250).join('').replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '')
  .replace(/\\/g, '\\\\').replace(/\r\n|\r|\n/g, '\\n').replace(/;/g, '\\;').replace(/,/g, '\\,');
// RFC 5545 physical lines are at most 75 UTF-8 octets, including continuation space.
function fold(line) {
  const encoder = new TextEncoder();
  let result = '', bytes = 0;
  for (const character of line) {
    const size = encoder.encode(character).length;
    if (bytes + size > 75) { result += '\r\n '; bytes = 1; }
    result += character; bytes += size;
  }
  return result;
}
function startTime(value) {
  if (typeof value !== 'string') return null;
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(Z|[+-]\d{2}:\d{2})?$/);
  if (!match) return null;
  const [, y, m, d, h, min, sec, zone] = match;
  const wall = Date.UTC(+y, +m - 1, +d, +h, +min, +sec);
  if (+y < 2000 || +y > 2100 || +h > 23 || +min > 59 || +sec > 59 ||
      new Date(wall).toISOString().slice(0, 19) !== value.slice(0, 19)) return null;
  if (zone && zone !== 'Z' && (+zone.slice(1, 3) > 14 || +zone.slice(4) > 59 ||
      (+zone.slice(1, 3) === 14 && +zone.slice(4) !== 0))) return null;
  const result = Date.parse(value + (zone ? '' : '+09:00'));
  return Number.isFinite(result) ? result : null;
}
export function createGameCalendarFile(game, freshness, now = Date.now()) {
  if (freshness?.online === false) return fail('offline');
  const fetched = Date.parse(freshness?.fetchedAt);
  if (!Number.isFinite(now) || freshness?.stale || !Number.isFinite(fetched) ||
      now - fetched > 300000 || fetched > now + 30000) return fail('stale_data');
  if (!game || !/^\d{8}[A-Z]{4}\d{5}$/.test(game.gameId) ||
      ![game.homeTeamCode, game.awayTeamCode].includes('HT') ||
      typeof game.homeTeamName !== 'string' || !game.homeTeamName.trim() ||
      typeof game.awayTeamName !== 'string' || !game.awayTeamName.trim()) return fail('invalid_game');
  if (game.statusCode !== 'BEFORE' || game.cancel || game.suspended) return fail('ineligible_status');
  const start = startTime(game.gameDateTime);
  if (game.timeTbd || start === null || start <= now ||
      new Date(start + 9 * 3600000).toISOString().slice(0, 10) !== game.gameDate) return fail('invalid_time');
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//KIA Diamond//Game Schedule//KO', 'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT', `UID:${game.gameId}@kia-diamond`, `DTSTAMP:${utcStamp(now)}`, `DTSTART:${utcStamp(start)}`,
    `SUMMARY:${text(game.awayTeamName)} 대 ${text(game.homeTeamName)}`,
    ...(typeof game.stadium === 'string' && game.stadium.trim() ? [`LOCATION:${text(game.stadium)}`] : []),
    `DESCRIPTION:${text('한국 시간 기준 경기 일정입니다. 종료 시각은 미정입니다. 다운로드 후 변경은 자동 반영되지 않습니다. 경기 전 KIA 다이아몬드에서 일정을 다시 확인해 주세요.')}`,
    'END:VEVENT', 'END:VCALENDAR',
  ];
  return {ok: true, filename: `kia-${game.gameId}.ics`, content: lines.map(fold).join('\r\n') + '\r\n'};
}
