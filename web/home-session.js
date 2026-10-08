'use strict';
// The original index menu remains the only home. This bridge gives that document
// package-backed profile/session access. Covenant is a separate mode subpage.
(()=>{
 const key=document.querySelector('meta[name="launcher-key"]')?.content;
 if(!/^[a-f0-9]{48}$/.test(key||''))return;
 const el=id=>document.getElementById(id);
 let profile=null,portraits=[],portraitPage=0,state={phase:'idle'},timer,saveTimer,saving=Promise.resolve();
 async function api(route,method='GET',body){const response=await fetch(route,{method,headers:{'x-launcher-key':key,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});const result=await response.json();if(!response.ok)throw Error(result.message||'操作失败');return result;}
 function applyProfile(value){profile=value;window.ArkSolo?.rememberProfile(value);const name=value.name||'博士';if(typeof setPlayerName==='function')setPlayerName(name);else el('player-name').value=name;el('home-portrait').src='portraits/'+value.portrait+'.png';if(el('home-art'))el('home-art').src='portraits/'+value.portrait+'.png';el('home-profile').hidden=false;}
 function saveName(){
  clearTimeout(saveTimer);if(!profile)return saving;
  const name=el('player-name').value.trim();if(!name||name===profile.name)return saving;
  const value={name,portrait:profile.portrait};saving=saving.then(async()=>{try{const result=await api('/api/profile','POST',value);profile=result.profile;el('home-profile-status').textContent='名片已保存。';}catch(error){el('home-profile-status').textContent=error.message;}});return saving;
 }
 function renderSession(){el('home-continue').hidden=state.phase!=='ready';el('home-continue').textContent=state.role==='solo'?'继续单人房间':'继续当前同盟';}
 function localGame(){const url=new URL(location.href);return url.searchParams.has('solo')||new URLSearchParams(url.hash.slice(1)).has('solo');}
 async function refresh(){try{if(!localGame()){state=await api('/api/status');renderSession();}}catch{}clearTimeout(timer);timer=setTimeout(refresh,2000);}
 function renderPortraits(){
  const query=el('home-portrait-search').value.trim().toLocaleLowerCase(),found=portraits.filter(p=>!query||p.name.toLocaleLowerCase().includes(query)||p.id.includes(query)),pages=Math.max(1,Math.ceil(found.length/24));
  portraitPage=Math.max(0,Math.min(portraitPage,pages-1));const grid=el('home-portrait-grid');grid.replaceChildren();
  for(const p of found.slice(portraitPage*24,(portraitPage+1)*24)){
   const button=document.createElement('button'),img=document.createElement('img'),label=document.createElement('span');button.type='button';button.setAttribute('aria-label','选择'+p.name);button.setAttribute('aria-pressed',String(p.id===profile?.portrait));img.src=p.path;img.alt='';img.loading='lazy';label.textContent=p.name;button.append(img,label);
   button.onclick=async()=>{await saveName();try{const result=await api('/api/profile','POST',{name:el('player-name').value.trim()||'博士',portrait:p.id});applyProfile(result.profile);el('home-profile-status').textContent='名片已保存。';el('home-profile-dialog').close();}catch(error){el('home-portrait-status').textContent=error.message;}};grid.append(button);
  }
  el('home-portrait-page').textContent=(portraitPage+1)+' / '+pages;el('home-portrait-prev').disabled=portraitPage===0;el('home-portrait-next').disabled=portraitPage===pages-1;
 }
 function editProfile(){portraitPage=0;el('home-portrait-search').value='';renderPortraits();el('home-profile-dialog').showModal();el('home-portrait-search').focus();}
 async function openPanel(view='mode'){
  if(view==='profile'){editProfile();return;}
  await saveName();if(typeof showMenu==='function')showMenu();location.href='room-lab.html?mode=solo'+(view==='team'?'&view=team':'');
 }
 function navigate(url){try{const target=new URL(url);if(target.protocol!=='http:'||target.hostname!=='127.0.0.1'||!target.port||target.pathname!=='/room-lab.html'||!target.hash.startsWith('#launch='))return;location.href=target.href;}catch{}}
 window.RoomHome={enabled:true,open:openPanel,save:saveName};
 el('home-profile').onclick=editProfile;
 el('home-profile-close').onclick=()=>el('home-profile-dialog').close();
 el('home-portrait-search').oninput=()=>{portraitPage=0;renderPortraits();};
 el('home-portrait-prev').onclick=()=>{portraitPage--;renderPortraits();};el('home-portrait-next').onclick=()=>{portraitPage++;renderPortraits();};
 el('home-continue').onclick=async()=>{await saveName();try{state=await api('/api/resume','POST');renderSession();if(state.phase==='ready')navigate(state.url);}catch(error){el('home-profile-status').textContent=error.message;}};
 el('player-name').addEventListener('input',()=>{clearTimeout(saveTimer);saveTimer=setTimeout(saveName,500);});el('player-name').addEventListener('change',saveName);
 window.addEventListener('pagehide',()=>{clearTimeout(timer);clearTimeout(saveTimer);});
 window.addEventListener('pageshow',event=>{if(event.persisted){void (async()=>{try{const result=await api('/api/profile');applyProfile(result.profile);}catch{}void refresh();})();}});
 (async()=>{try{const result=await api('/api/profile');portraits=result.portraits||[];applyProfile(result.profile);if(!localGame())state=await api('/api/resume','POST');renderSession();const query=new URL(location.href).searchParams;if(query.has('profile'))editProfile();else if(query.get('view')==='mode'||query.get('view')==='team')await openPanel(query.get('view'));}catch(error){el('home-profile-status').textContent='暂时无法读取名片，请稍后重试。';}void refresh();})();
})();
