import {esc} from '/model.js';
const $=id=>document.getElementById(id);
const colors={HT:'#e23851',LG:'#c15b9b',OB:'#527bd5',SS:'#3289f5',KT:'#71798b',SK:'#df542e',HH:'#f49c32',NC:'#36aaaf',LT:'#50a9de',WO:'#a679d7'};
let data=null,row=null,month='',selected='',view='month';
const dot=c=>`<i class="team-dot" style="--team-color:${colors[c]||'#8994a6'}" aria-hidden="true"></i>`;
export function monthDays(value){const [y,m]=value.split('-').map(Number);return {offset:new Date(Date.UTC(y,m-1,1)).getUTCDay(),count:new Date(Date.UTC(y,m,0)).getUTCDate()}}
function detail(){
 const panel=$('calendarDetail');if(!panel)return;
 document.querySelectorAll('[data-calendar-date]').forEach(b=>b.setAttribute('aria-expanded',String(b.dataset.calendarDate===selected)));
 panel.hidden=!selected;if(!selected)return;
 const games=data.games.filter(g=>g.gameDate===selected);
 panel.innerHTML=`<div class="calendar-detail-head"><h3>${Number(selected.slice(5,7))}월 ${Number(selected.slice(8))}일</h3><button class="text-button" data-calendar-close aria-label="날짜 상세 닫기">닫기 ×</button></div>${games.length?games.map(row).join(''):`<div class="empty">${data.stale?'이 날짜의 경기 정보를 확인하지 못했어요.':'이 날짜에 등록된 경기가 없어요.'}</div>`}`;
}
function draw(){
 if(!data)return;
 $('weekStrip').hidden=view!=='week';$('monthCalendar').hidden=view!=='month';
 const first=(data.from||data.today).slice(0,7),last=(data.to||data.today).slice(0,7);
 if(!month||month<first||month>last)month=data.today.slice(0,7);
 const [y,m]=month.split('-').map(Number),{offset,count}=monthDays(month),teams=new Map();
 data.games.filter(g=>g.gameDate.startsWith(month)).forEach(g=>{for(const side of ['away','home'])teams.set(g[side+'TeamCode'],g[side+'TeamName'])});
 $('monthCalendar').innerHTML=`<div class="calendar-heading"><button class="icon-button" data-calendar-step="-1" aria-label="이전 달" ${month<=first?'disabled':''}>‹</button><h3>${y}년 ${m}월</h3><button class="icon-button" data-calendar-step="1" aria-label="다음 달" ${month>=last?'disabled':''}>›</button></div><div class="calendar-legend">${[...teams].map(([c,n])=>`<span>${dot(c)}${esc(n)}</span>`).join('')}</div><div class="calendar-grid"><div class="calendar-weekdays">${['일','월','화','수','목','금','토'].map(t=>`<span>${t}</span>`).join('')}</div>${Array.from({length:offset},()=>'<span aria-hidden="true"></span>').join('')}${Array.from({length:count},(_,i)=>{
 const date=month+'-'+String(i+1).padStart(2,'0'),games=data.games.filter(g=>g.gameDate===date),covered=date>=data.from&&date<=data.to;
 return `<button class="calendar-day ${date===data.today?'today':''}" data-calendar-date="${date}" aria-expanded="${selected===date}" aria-controls="calendarDetail" aria-label="${date}, ${games.length?esc(games.map(g=>g.awayTeamName+' 대 '+g.homeTeamName+(g.cancel?' 취소':'')).join(', ')):covered?'등록 경기 없음':'조회 범위 밖'}" ${!covered&&!games.length?'disabled':''}><b>${i+1}</b><span class="calendar-dots">${games.map(g=>`<span class="game-dot-pair ${g.cancel?'cancelled':''}" title="${esc(g.awayTeamName+' 대 '+g.homeTeamName)}">${dot(g.awayTeamCode)}${dot(g.homeTeamCode)}</span>`).join('')}</span></button>`;
 }).join('')}</div><div id="calendarDetail" class="calendar-detail" aria-live="polite" hidden></div><p class="calendar-note">두 점은 원정·홈 구단 순서 · ${(data.from||data.today).slice(5)}–${(data.to||data.today).slice(5)} 조회${data.stale?' · 갱신 지연':''}</p>`;detail();
}
document.addEventListener('click',e=>{
 const tab=e.target.closest('[data-calendar-view]'),step=e.target.closest('[data-calendar-step]'),day=e.target.closest('[data-calendar-date]'),close=e.target.closest('[data-calendar-close]');
 if(tab){view=tab.dataset.calendarView;document.querySelectorAll('[data-calendar-view]').forEach(b=>b.setAttribute('aria-pressed',String(b===tab)));draw()}
 if(step&&data){const [y,m]=month.split('-').map(Number);month=new Date(Date.UTC(y,m-1+Number(step.dataset.calendarStep),1)).toISOString().slice(0,7);selected='';draw()}
 if(day||close){selected=close||selected===day?.dataset.calendarDate?'':day.dataset.calendarDate;detail();const panel=$('calendarDetail');if(selected&&document.documentElement.dataset.motion!=='off'&&!matchMedia('(prefers-reduced-motion: reduce)').matches)panel.animate([{opacity:.35,transform:'translateY(-8px) scale(.97)'},{opacity:1,transform:'translateY(0) scale(1)'}],{duration:320,easing:'cubic-bezier(.2,.8,.2,1)'});if(close)document.querySelector(`[data-calendar-date="${close.dataset.date||''}"]`)?.focus();}
});
window.kiaCalendar={render(d,renderer){data=d;row=renderer;draw()}};
