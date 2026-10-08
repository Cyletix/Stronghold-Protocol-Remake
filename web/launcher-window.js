(function(){
 'use strict';
 if(typeof EventSource==='undefined')return;
 const STORE='ark-launcher-window-v1';let target=null,stream=null;
 function valid(value){return /^http:\/\/127\.0\.0\.1:\d+$/.test(value?.url||'')&&/^[a-f0-9]{48}$/.test(value?.token||'');}
 try{
  const token=document.querySelector('meta[name="launcher-window"]')?.content;
  if(/^[a-f0-9]{48}$/.test(token||''))target={url:location.origin,token};
  else{
   const payload=new URLSearchParams(location.hash.slice(1)).get('launch');
   if(payload){const boot=JSON.parse(atob(payload.replace(/-/g,'+').replace(/_/g,'/')));target={url:boot.launcherUrl,token:boot.windowToken};}
   if(!valid(target))target=JSON.parse(sessionStorage.getItem(STORE)||'null');
  }
  if(!valid(target))return;
  sessionStorage.setItem(STORE,JSON.stringify(target));
 }catch{return;}
 function open(){if(!stream)stream=new EventSource(target.url+'/api/window?token='+target.token);}
 function close(){stream?.close();stream=null;}
 // Visibility changes do not mean exit. No unload beacon can distinguish a
 // refresh from closing the tab; the local server observes all open documents.
 window.addEventListener('pagehide',close);
 window.addEventListener('pageshow',open);
 open();
})();
