import test from 'node:test';
import assert from 'node:assert/strict';
import {createGameCalendarFile} from '../public/calendar-export.js';
const now = Date.parse('2026-12-31T14:00:00Z');
const freshness = {fetchedAt: new Date(now).toISOString(), stale: false, online: true};
const game = {gameId:'20270101LGHT02027',gameDate:'2027-01-01',gameDateTime:'2027-01-01T18:30:00',
  homeTeamCode:'HT',awayTeamCode:'LG',homeTeamName:'KIA',awayTeamName:'LG',stadium:'광주',statusCode:'BEFORE',timeTbd:false};
test('Korean provider time exports UTC without inventing an end time',()=>{
  const file=createGameCalendarFile(game,freshness,now);
  assert.equal(file.ok,true);assert.equal(file.filename,'kia-20270101LGHT02027.ics');
  assert.match(file.content,/DTSTART:20270101T093000Z\r\n/);
  assert.match(file.content,/UID:20270101LGHT02027@kia-diamond/);
  assert.doesNotMatch(file.content,/DTEND|DURATION/);
  assert.equal(file.content.endsWith('END:VCALENDAR\r\n'),true);
});
test('explicit offsets and UTC yield same Korean start and ignore host timezone',()=>{
  for(const time of ['2027-01-01T18:30:00+09:00','2027-01-01T09:30:00Z']){
    const file=createGameCalendarFile({...game,gameDateTime:time},freshness,now);
    assert.equal(file.ok,true);assert.match(file.content,/DTSTART:20270101T093000Z/);
  }
});
test('unknown, invalid, past and date-mismatched times cannot be exported',()=>{
  for(const time of ['2027-02-30T18:30:00','2027-01-01T24:00:00','2027-01-01T18:70:00','2027-01-01T18:30:00+15:00','bad','2026-01-01T18:30:00'])
    assert.equal(createGameCalendarFile({...game,gameDateTime:time},freshness,now).code,'invalid_time');
  assert.equal(createGameCalendarFile({...game,timeTbd:true},freshness,now).code,'invalid_time');
  assert.equal(createGameCalendarFile({...game,gameDate:'2027-01-02'},freshness,now).code,'invalid_time');
});
test('canceled, suspended, live, final, malformed and non-KIA games are rejected',()=>{
  for(const change of [{cancel:true},{suspended:true},{statusCode:'RESULT'},{statusCode:'STARTED'}])
    assert.equal(createGameCalendarFile({...game,...change},freshness,now).code,'ineligible_status');
  for(const g of [null,{...game,gameId:'bad'},{...game,homeTeamCode:'SS'},{...game,homeTeamName:''}])
    assert.equal(createGameCalendarFile(g,freshness,now).code,'invalid_game');
});
test('offline, stale, missing, too old and future freshness block exports',()=>{
  for(const f of [{stale:true},{fetchedAt:null},{fetchedAt:'bad'},{fetchedAt:new Date(now-300001).toISOString()},{fetchedAt:new Date(now+30001).toISOString()}])
    assert.equal(createGameCalendarFile(game,{...freshness,...f},now).code,'stale_data');
  assert.equal(createGameCalendarFile(game,{...freshness,online:false},now).code,'offline');
  assert.equal(createGameCalendarFile(game,{...freshness,fetchedAt:new Date(now-300000).toISOString()},now).ok,true);
});
test('text injection is escaped and folded at UTF-8 boundaries',()=>{
  const file=createGameCalendarFile({...game,stadium:'광주,구장;\\\r\nBEGIN:VEVENT',awayTeamName:'한글'.repeat(100)},freshness,now);
  assert.equal(file.ok,true);
  assert.equal(file.content.split('\r\n').filter(l=>l==='BEGIN:VEVENT').length,1);
  for(const line of file.content.split('\r\n'))assert.ok(Buffer.byteLength(line,'utf8')<=75);
  assert.match(file.content.replace(/\r\n /g,''),/LOCATION:광주\\,구장\\;/);
  assert.doesNotMatch(file.content,/�/);
});
test('doubleheaders retain distinct UIDs and missing venue is omitted',()=>{
  const a=createGameCalendarFile({...game,stadium:undefined},freshness,now);
  const b=createGameCalendarFile({...game,gameId:'20270101LGHT12027'},freshness,now);
  assert.notEqual(a.filename,b.filename);assert.doesNotMatch(a.content,/LOCATION:/);
});
