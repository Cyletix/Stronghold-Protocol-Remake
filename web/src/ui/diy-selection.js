// Shared local formation editor: home and room use the same four source slots.
(()=>{
 'use strict';
 let catalogPromise,dialog,seasonId,picks={},slotId=null,options={},busy=false,previousFocus;
 const data=()=>catalogPromise||(catalogPromise=fetch('diy_roster.json').then(r=>{if(r.ok===false)throw Error('甄选名册加载失败');return r.json();}).catch(e=>{catalogPromise=null;throw e;}));
 const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const tier=n=>n===5?'V':'VI';
 function create(){
  if(dialog)return;
  dialog=document.createElement('dialog');dialog.id='diy-dialog';dialog.className='diy-dialog';dialog.setAttribute('aria-labelledby','diy-title');
  document.body.append(dialog);dialog.addEventListener('close',()=>{previousFocus?.focus?.();});
  dialog.addEventListener('click',e=>{if(e.target===dialog)dialog.close();});
 }
 function close(){dialog.close();options.onChange?.();}
 async function open(sid,opts={}){
  if(busy)return;busy=true;
  try{const d=await data();create();seasonId=sid;options=opts;slotId=null;picks=ArkDiyRoster.normalize(d,sid,ArkDiyRoster.read(localStorage,sid));previousFocus=document.activeElement;render(d);if(!dialog.open)dialog.showModal();}
  catch(e){if(typeof flash==='function')flash(e.message);else alert(e.message);}finally{busy=false;}
 }
 function store(d){picks=ArkDiyRoster.normalize(d,seasonId,picks);ArkDiyRoster.save(localStorage,seasonId,picks);options.onChange?.();}
 function render(d){
  const s=d.seasons[seasonId];
  dialog.innerHTML='<div class="diy-heading"><div><h2 id="diy-title">甄选编队</h2><p>V 阶、VI 阶各两名 · 开局后加入商店，三合一成为精锐</p></div>'+(options.chooseSeason?'<select id="diy-season" aria-label="甄选赛季">'+Object.keys(d.seasons).map(id=>'<option value="'+id+'"'+(id===seasonId?' selected':'')+'>'+(id==='act2autochess'?'盟约Ⅱ':'盟约')+'</option>').join('')+'</select>':'')+'<button id="diy-done" class="diy-primary">完成</button></div>'
   +'<div class="diy-slots">'+s.slots.map(slot=>{
    const v=picks[slot.slotId],op=d.operators[v?.charId];
    return '<article class="diy-slot'+(slotId===slot.slotId?' selected':'')+'"><button data-pick="'+slot.slotId+'" class="diy-portrait" aria-label="选择 '+tier(slot.tier)+' 阶甄选干员"><b>'+tier(slot.tier)+'</b>'+(op?'<img src="avatars/'+op.charId+'.png" alt=""><strong>'+esc(op.name)+'</strong>':'<span>＋ 选择干员</span>')+'</button>'+(op?
     '<div class="diy-bonds">'+ArkDiyRoster.bonds(d,seasonId,op.charId).map(id=>esc(s.coreBonds.find(b=>b.bondId===id)?.name||'协防干员')).join(' · ')+'</div>'
     +'<label>携带技能<select data-skill="'+slot.slotId+'">'+op.skills.map(x=>'<option value="'+x.index+'"'+(v.skillIndex===x.index?' selected':'')+'>S'+(x.index+1)+' · '+esc(x.name)+'</option>').join('')+'</select></label>'
     +'<label>精锐模组<select data-module="'+slot.slotId+'"><option value="">不携带</option>'+op.modules.map(x=>'<option value="'+x.uniEquipId+'"'+(v.uniEquipId===x.uniEquipId?' selected':'')+'>'+esc(x.name)+'</option>').join('')+'</select></label>'
     +'<button class="diy-clear" data-clear="'+slot.slotId+'">移除</button>':'<p class="diy-empty">未选择的栏位不加入商店</p>')+'</article>';
   }).join('')+'</div>'
   +'<p class="diy-note">仅选择当季固定名册以外的六星干员。按实际势力匹配核心盟约，未匹配者归入协防；不附加卫戍专属特质。普通为精二 1 级、技能 4；精锐为精二 60 级、技能 7，V / VI 阶模组分别为 '+s.slots[0].elite.equipLevel+' / '+s.slots[2].elite.equipLevel+' 级。入门协议不使用甄选编队。</p>'
   +(slotId?'<div class="diy-picker-head"><label>选择 '+tier(s.slots.find(x=>x.slotId===slotId).tier)+' 阶干员 <input id="diy-search" type="search" placeholder="搜索干员" autocomplete="off"></label><span id="diy-count"></span></div><div id="diy-candidates" class="diy-candidates"></div>':'');
  dialog.querySelector('#diy-done').onclick=close;
  const season=dialog.querySelector('#diy-season');if(season)season.onchange=()=>{seasonId=season.value;picks=ArkDiyRoster.normalize(d,seasonId,ArkDiyRoster.read(localStorage,seasonId));slotId=null;render(d);};
  dialog.querySelectorAll('[data-pick]').forEach(b=>b.onclick=()=>{slotId=b.dataset.pick;render(d);dialog.querySelector('#diy-search').focus();});
  dialog.querySelectorAll('[data-clear]').forEach(b=>b.onclick=()=>{delete picks[b.dataset.clear];store(d);render(d);});
  dialog.querySelectorAll('[data-skill]').forEach(e=>e.onchange=()=>{picks[e.dataset.skill].skillIndex=Number(e.value);store(d);});
  dialog.querySelectorAll('[data-module]').forEach(e=>e.onchange=()=>{picks[e.dataset.module].uniEquipId=e.value||null;store(d);});
  if(slotId){dialog.querySelector('#diy-search').oninput=()=>renderCandidates(d);renderCandidates(d);}
 }
 function renderCandidates(d){
  const query=dialog.querySelector('#diy-search').value.trim().toLowerCase(),s=d.seasons[seasonId],used=new Set(Object.entries(picks).filter(([id])=>id!==slotId).map(([,v])=>v.charId));
  const list=s.eligibleCharIds.map(id=>d.operators[id]).filter(op=>!used.has(op.charId)&&(!query||op.name.toLowerCase().includes(query)||op.charId.includes(query)));
  dialog.querySelector('#diy-count').textContent=list.length+' 名可选';
  const grid=dialog.querySelector('#diy-candidates');grid.innerHTML=list.map(op=>'<button data-char="'+op.charId+'"><img src="avatars/'+op.charId+'.png" alt="" loading="lazy"><strong>'+esc(op.name)+'</strong><span>'+ArkDiyRoster.bonds(d,seasonId,op.charId).map(id=>esc(s.coreBonds.find(b=>b.bondId===id)?.name||'协防')).join(' · ')+'</span></button>').join('')||'<p>没有符合条件的干员</p>';
  grid.querySelectorAll('[data-char]').forEach(b=>b.onclick=()=>{
   const op=d.operators[b.dataset.char];let a={};try{a=JSON.parse(localStorage.getItem('arknightsRoster')||'{}').ops?.[op.charId]||{};}catch{}
   picks[slotId]={charId:op.charId,skillIndex:op.skills.some(s=>s.index===a.selectedSkill)?a.selectedSkill:op.skills[0].index,potentialRank:Math.max(0,Math.min(5,(a.potential??6)-1)),uniEquipId:null};
   store(d);slotId=null;render(d);
  });
 }
 async function summary(element,sid,locked=false){
  if(!element)return;element.dataset.season=sid;element.dataset.locked=String(locked);
  if(locked&&dialog?.open&&!options.chooseSeason)dialog.close();
  try{const d=await data();if(element.dataset.season!==sid)return;const p=ArkDiyRoster.normalize(d,sid,ArkDiyRoster.read(localStorage,sid));
   element.innerHTML='<span>我的甄选 · '+d.seasons[sid].slots.map(s=>tier(s.tier)+' '+esc(d.operators[p[s.slotId]?.charId]?.name||'未选择')).join(' / ')+'</span><button class="secondary"'+(element.dataset.locked==='true'?' disabled':'')+'>调整甄选</button>';
   element.querySelector('button').onclick=()=>open(sid,{onChange:()=>summary(element,sid,false)});
  }catch(e){element.textContent=e.message;}
 }
 window.ArkDiySelection=Object.freeze({open,summary});
})();
