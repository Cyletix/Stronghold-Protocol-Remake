'use strict';
const fs=require('node:fs');
function writeBrowserTicket(file,url){
 const temp=file+'.tmp';
 if(fs.existsSync(file))throw Error('启动地址文件已存在，请重新启动。');
 try{fs.writeFileSync(temp,url,{flag:'wx'});fs.renameSync(temp,file);}
 finally{if(fs.existsSync(temp))fs.unlinkSync(temp);}
}
// Browser lifetime is a local open stream, not a timer in a background tab.
// A grace period lets document navigation, refresh and BFCache reconnect.
function createWindowLifetime({graceMs=15000,startupMs=120000,onEmpty}={}){
 const pages=new Set();let timer=null,stopped=false;
 function schedule(ms){clearTimeout(timer);timer=setTimeout(()=>{if(!stopped&&!pages.size){stopped=true;void onEmpty();}},ms);timer.unref?.();}
 schedule(startupMs);
 return {
  attach(res){
   if(stopped)return false;
   clearTimeout(timer);pages.add(res);
   res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-store','Connection':'keep-alive','X-Accel-Buffering':'no'});
   res.write('retry: 1000\nevent: attached\ndata: {}\n\n');
   const ping=setInterval(()=>{if(!res.destroyed)res.write(': alive\n\n');},10000);ping.unref?.();
   res.once('close',()=>{clearInterval(ping);pages.delete(res);if(!stopped&&!pages.size)schedule(graceMs);});
   return true;
  },
  close(){stopped=true;clearTimeout(timer);for(const res of pages)res.end();pages.clear();},
  get size(){return pages.size;}
 };
}
module.exports={createWindowLifetime,writeBrowserTicket};
