'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const f=require('./_browser_fixture')(),html=fs.readFileSync(path.join(__dirname,'../web/index.html'),'utf8');
// Execute the actual HTML click handlers, with the real game rules and key listener.
for(const tag of html.matchAll(/<(?:button|div)\b[^>]+>/g)){
  const id=/\bid="([^"]+)"/.exec(tag[0])?.[1],click=/\bonclick="([^"]+)"/.exec(tag[0])?.[1];
  if(id&&click)f.el(id).click=()=>{f.ctx.event={stopPropagation(){}};return f.run(click);};
}
const overlays=['menu','setup','decision-modal','roster-modal','roster-detail','exit-confirm','settlement'];
const press=(code,fields={})=>{const event={code,key:code?.slice(-1).toLowerCase(),preventDefault(){this.defaultPrevented=true;},...fields};for(const fn of f.listeners.keydown||[])fn(event);return event;};
const state=()=>f.run('JSON.stringify(G)');
(async()=>{
 await f.run("initMode().then(()=>chooseBand('band_amiya'))");
 for(const id of overlays)f.el(id).style.display='none';f.el('main').style.display='flex';
 f.run("dispatchSessionCommand('economy/add',{amount:50})");
 const money=f.run('G.money');press('KeyS');assert.equal(f.run('G.frozen'),true);press('KeyS');assert.equal(f.run('G.frozen'),false);
 press('KeyD');assert.equal(f.run('G.money'),money-f.run('shopRefreshPrice()'),'refresh really spends its source price');
 press('KeyA');assert.equal(f.run('window.__shopCollapsed'),true);press('KeyA');assert.equal(f.run('window.__shopCollapsed'),false);
 const level=f.run('G.level'),cost=f.run('G.upgradeCost'),before=f.run('G.money');
 press('KeyG');assert.equal(f.run('G.level'),level);assert.equal(f.run('G._upgradeConfirm'),true);
 press('KeyG',{repeat:true});assert.equal(f.run('G.level'),level,'holding G must not confirm');
 press('KeyG');assert.equal(f.run('G.level'),level+1);assert.equal(f.run('G.money'),before-cost);
 for(const fields of [{repeat:true},{ctrlKey:true},{metaKey:true},{altKey:true},{shiftKey:true},{isComposing:true},{keyCode:229},{defaultPrevented:true},{target:{isContentEditable:true}},{target:{closest:()=>({tagName:'INPUT'})}}]){
   const before=state();press('KeyD',fields);assert.equal(state(),before,'typing/modifiers/repeats cannot change economy');
 }
 for(const id of overlays){f.el(id).style.display='flex';const before=state();press('KeyD');assert.equal(state(),before,id+' blocks underlying actions');f.el(id).style.display='none';}
 f.ctx.document.querySelector=()=>({open:true});const dialogState=state();press('KeyS');assert.equal(state(),dialogState);f.ctx.document.querySelector=()=>null;
 const freeze=f.el('freeze-btn');freeze.disabled=true;press('KeyS');assert.equal(f.run('G.frozen'),false);freeze.disabled=false;
 freeze.getAttribute=()=> 'true';press('KeyS');assert.equal(f.run('G.frozen'),false);freeze.getAttribute=()=>null;
 freeze.getClientRects=()=>[];press('KeyS');assert.equal(f.run('G.frozen'),false);delete freeze.getClientRects;
 press('KeyS',{key:'ы'});assert.equal(f.run('G.frozen'),true,'physical letter works outside a Latin layout');
 press('',{key:'S'});assert.equal(f.run('G.frozen'),false,'key fallback is case insensitive');
 f.run('showMergeReward()');const reward=state();for(const key of ['KeyS','KeyD','KeyG','KeyC'])press(key);assert.equal(state(),reward,'pending reward cannot be bypassed');
 f.run('G.shop=G._mergeReward.savedShop;G._mergeReward=null;renderAll()');
 press('KeyC');assert.equal(f.run('G.phase'),'battle','ready begins the actual round');
 const battle=state();for(const key of ['KeyS','KeyD','KeyG','KeyC','KeyA'])press(key);assert.equal(state(),battle,'combat locks preparation actions');
 console.log('SHORTCUTS OK A/S/D/G/C actual buttons and rules, two-press upgrade, repeat/IME/input/modal/hidden/disabled guards, reward and battle locks');
})().catch(e=>{console.error(e);process.exitCode=1;});
