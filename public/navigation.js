// Shared, frame-rate independent spring lens for floating navigation and round filters.
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
export function springStep(x,v,target,dt){const a=420*(target-x)-32*v;v+=a*dt;return [x+v*dt,v]}
const mounted=new Map();
function mount(nav,selector,attribute){
 const candidates=[...nav.querySelectorAll(selector)];if(candidates.length<2)return;
 const previous=mounted.get(nav);if(previous&&previous.links.length===candidates.length&&previous.links.every((b,i)=>b===candidates[i]))return;if(previous)previous.cleanup();
nav.dataset.liquidReady='true';nav.classList.add('liquid-tabs');
 const links=[...nav.querySelectorAll(selector)];if(!links.length)return;
 const lens=document.createElement('span');lens.className='nav-glass-selector';lens.setAttribute('aria-hidden','true');nav.prepend(lens);
 const controller=new AbortController(),listen=(el,type,fn,options={})=>el.addEventListener(type,fn,{...options,signal:controller.signal});
 const reduced=matchMedia('(prefers-reduced-motion: reduce)');
 let gesture=null,suppressUntil=0,wheel=0,wheelAt=0,raf=0,last=0,x=0,v=0,w=0,vw=0,target=0,targetW=0,initialized=false;
 const selected=()=>Math.max(0,links.findIndex(a=>attribute==='aria-current'?a.hasAttribute(attribute):a.getAttribute(attribute)==='true'));
 const geometry=i=>{const b=nav.getBoundingClientRect(),r=links[i].getBoundingClientRect();return {x:r.left-b.left+nav.scrollLeft,w:r.width}};
 function draw(){const strength=document.documentElement.dataset.motion==='soft'?.35:1;const stretch=(reduced.matches||document.documentElement.dataset.motion==='off')?0:strength*Math.min(.17,Math.abs(v)/4200)+(gesture?.drag?.025:0);nav.style.setProperty('--nav-x',x+'px');nav.style.setProperty('--nav-w',w+'px');nav.style.setProperty('--liquid-sx',1+stretch);nav.style.setProperty('--liquid-sy',1-stretch*.45);nav.style.setProperty('--liquid-light',clamp(50+v/25,15,85)+'%')}
 function frame(now){raf=0;if(!nav.isConnected)return;const dt=Math.min((now-last)/1000||1/60,1/30);last=now;[x,v]=springStep(x,v,target,dt);[w,vw]=springStep(w,vw,targetW,dt);if(Math.abs(x-target)+Math.abs(v)+Math.abs(w-targetW)+Math.abs(vw)<.12){x=target;w=targetW;v=vw=0;draw();return}draw();raf=requestAnimationFrame(frame)}
 function aim(left,width){target=left;targetW=width;if(!initialized||reduced.matches||document.documentElement.dataset.motion==='off'){initialized=true;x=target;w=targetW;v=vw=0;draw();return}if(!raf){last=performance.now();raf=requestAnimationFrame(frame)}}
 function paint(){const g=geometry(selected());if(g.w)aim(g.x,g.w)}
 function activate(i,focus=false){i=clamp(i,0,links.length-1);if(focus)links[i].focus({preventScroll:true});if(i!==selected())links[i].click();const g=geometry(i);if(g.x<nav.scrollLeft||g.x+g.w>nav.scrollLeft+nav.clientWidth)nav.scrollTo({left:Math.max(0,g.x-(nav.clientWidth-g.w)/2),behavior:'instant'});paint()}
 listen(nav,'pointerdown',e=>{if(!e.isPrimary||e.button!==0)return;const g=geometry(selected());gesture={id:e.pointerId,x:e.clientX,y:e.clientY,start:selected(),left:g.x,width:g.w,drag:false,lastX:e.clientX,lastTime:performance.now(),velocity:0}});
 listen(nav,'pointermove',e=>{if(!gesture||gesture.id!==e.pointerId)return;const dx=e.clientX-gesture.x,dy=e.clientY-gesture.y;if(!gesture.drag){if(Math.abs(dy)>Math.abs(dx)&&Math.abs(dy)>10){gesture=null;return}if(Math.abs(dx)<8)return;gesture.drag=true;nav.setPointerCapture(e.pointerId);nav.classList.add('dragging')}e.preventDefault();const now=performance.now(),dt=Math.max(8,now-gesture.lastTime);gesture.velocity=now>gesture.lastTime&&now-gesture.lastTime<100?(e.clientX-gesture.lastX)/dt:0;gesture.lastX=e.clientX;gesture.lastTime=now;const min=geometry(0).x,max=geometry(links.length-1).x,raw=gesture.left+dx;const edge=clamp(raw,min,max);aim(edge+clamp((raw-edge)*.18,-14,14),gesture.width)});
 function finish(e,cancel=false){if(!gesture||e.pointerId!==gesture.id)return;const g=gesture;gesture=null;nav.classList.remove('dragging');if(nav.hasPointerCapture(e.pointerId))nav.releasePointerCapture(e.pointerId);if(g.drag){suppressUntil=performance.now()+500;const dx=e.clientX-g.x;if(!cancel&&Math.abs(dx)>=24){const steps=Math.max(1,Math.round(Math.abs(dx+(performance.now()-g.lastTime<100?clamp(g.velocity*45,-g.width*.5,g.width*.5):0))/Math.max(g.width,1)));activate(g.start+Math.sign(dx)*steps)}else paint()}else paint()}
 listen(nav,'pointerup',e=>finish(e));listen(nav,'pointercancel',e=>finish(e,true));listen(nav,'lostpointercapture',e=>{if(e.target===nav&&gesture?.id===e.pointerId)finish(e,true)});
 // Capture at the window before postseason's document-level navigation handler.
 listen(window,'click',e=>{if(e.detail!==0&&performance.now()<suppressUntil&&nav.contains(e.target)){e.preventDefault();e.stopImmediatePropagation()}},true);
 listen(nav,'dragstart',e=>e.preventDefault());
 listen(nav,'keydown',e=>{if(e.defaultPrevented)return;if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();activate(e.key==='Home'?0:e.key==='End'?links.length-1:selected()+(e.key==='ArrowRight'?1:-1),true)});
 listen(nav,'wheel',e=>{if(Math.abs(e.deltaX)<=Math.abs(e.deltaY))return;e.preventDefault();const now=performance.now();if(now-wheelAt>250)wheel=0;wheelAt=now;wheel+=e.deltaX;if(Math.abs(wheel)>=45){activate(selected()+Math.sign(wheel));wheel=0}},{passive:false});
 const changes=new MutationObserver(()=>{if(!gesture?.drag)paint()}),resize=new ResizeObserver(paint);changes.observe(nav,{attributes:true,attributeFilter:[attribute],subtree:true});resize.observe(nav);listen(reduced,'change',paint);listen(window,'kia-preferences',paint);mounted.set(nav,{links,cleanup(){controller.abort();changes.disconnect();resize.disconnect();cancelAnimationFrame(raf);lens.remove();mounted.delete(nav)}});paint();
}
window.kiaLiquidMount=()=>{
 for(const [nav,state] of mounted)if(!nav.isConnected)state.cleanup();
 const rules=[['.mobile-nav','[data-page]','aria-current'],['.ps-tabs','button[aria-pressed]','aria-pressed'],['.settings-choice','button[aria-pressed]','aria-pressed'],['.pills','button[aria-pressed]','aria-pressed'],['.segmented','button[aria-pressed]','aria-pressed'],['.relay-tabs','button[aria-selected]','aria-selected'],['.video-dates','button[aria-pressed]','aria-pressed']];
 for(const [group,buttons,attr] of rules)document.querySelectorAll(group).forEach(n=>mount(n,buttons,attr));
};
let mountQueued=false;new MutationObserver(()=>{if(!mountQueued){mountQueued=true;queueMicrotask(()=>{mountQueued=false;window.kiaLiquidMount()})}}).observe(document.body,{childList:true,subtree:true});window.kiaLiquidMount();
