import {test as base,expect} from '@playwright/test';
import fs from 'node:fs';
export {expect};
export const test=base.extend({
  scenario:async({page},use)=>{
    const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
    const shift=n=>new Date(Date.parse(today+'T00:00:00Z')+n*86400000).toISOString().slice(0,10);
    const date=shift(1);
    const game={gameId:date.replaceAll('-','')+'LGHT02026',gameDate:date,gameDateTime:date+'T18:30:00',
      homeTeamCode:'HT',awayTeamCode:'LG',homeTeamName:'KIA',awayTeamName:'LG',stadium:'광주',statusCode:'BEFORE',timeTbd:false};
    const article={id:'https://www.yna.co.kr/view/test',url:'https://www.yna.co.kr/view/test',title:'KIA 테스트 기사',publisher:'연합뉴스',category:'game',publishedAt:new Date().toISOString()};
    const state={game,article,today,date,failNews:false,stale:false,delayNews:0};
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.route('**/*',async route=>{
      const u=new URL(route.request().url());
      if(u.origin!=='http://127.0.0.1:4177'){await route.abort();return;}
      if(!u.pathname.startsWith('/api/')){await route.continue();return;}
      const data={today,from:shift(-30),to:shift(30),windowDays:30,games:[state.game],active:false,stale:state.stale,fetchedAt:new Date().toISOString()};
      let body=data;
      if(u.pathname==='/api/news'){
        if(state.delayNews)await new Promise(r=>setTimeout(r,state.delayNews));
        if(state.failNews){await route.fulfill({status:503,json:{error:'controlled failure'}});return;}
        body={articles:[article],fetchedAt:new Date().toISOString(),stale:false};
      }else if(u.pathname==='/api/standings')body=JSON.parse(fs.readFileSync(new URL('../../worker/standings-snapshot.json',import.meta.url)));
      else if(u.pathname==='/api/videos')body={videos:[],days:[today],checkedDays:[today],fetchedAt:new Date().toISOString()};
      await route.fulfill({json:body});
    });
    await use(state);
    expect(errors).toEqual([]);
  },
});
