'use strict';
const fs=require('fs'),path=require('path'),vm=require('vm');
module.exports=function({root=path.join(__dirname,'..','web')}={}){
  const elements=new Map(),storage=new Map(),listeners={},noop=()=>{};
  function el(id){if(!elements.has(id))elements.set(id,{id,innerHTML:'',textContent:'',style:{},classList:{add:noop,remove:noop,contains:()=>false,toggle:noop},addEventListener:noop,getContext:()=>new Proxy({},{get:()=>noop}),getBoundingClientRect:()=>({left:0,top:0,right:1400,bottom:900})});return elements.get(id);}
  const ctx={console,innerWidth:1400,innerHeight:900,requestAnimationFrame:()=>0,addEventListener:noop,setTimeout:()=>0,clearTimeout:noop,document:{getElementById:el,querySelector:()=>null,addEventListener:(type,fn)=>(listeners[type]||=[]).push(fn)},Image:function(){this.complete=false;},localStorage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,String(v))},fetch:async url=>({json:async()=>JSON.parse(fs.readFileSync(path.join(root,url),'utf8'))})};
  ctx.window=ctx;vm.createContext(ctx);
  const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
  for(const [,src] of html.matchAll(/<script src="([^"?]+)(?:\?[^" ]*)?"/g)){
    if(src.includes('://')||src.startsWith('vendor/'))continue;
    vm.runInContext(fs.readFileSync(path.join(root,src),'utf8'),ctx,{filename:src});
  }
  return {ctx,el,storage,listeners,run:code=>vm.runInContext(code,ctx)};
};
