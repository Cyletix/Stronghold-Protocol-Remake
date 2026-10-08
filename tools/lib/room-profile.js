'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const DEFAULT_PORTRAITS=['char_102_texas','char_1012_skadi2','char_1028_texas2','char_1019_siege2'];
const catalogs=new Map();

// The portable package owns this catalog: only real PNGs under web/portraits are selectable.
function listPortraits(root){
 root=path.resolve(root);
 if(catalogs.has(root))return catalogs.get(root).map(x=>({...x}));
 let names=new Map();
 try{const data=JSON.parse(fs.readFileSync(path.join(root,'web/db_export.json'),'utf8'));names=new Map((data.operators||[]).map(x=>[x.charId,x.name]));}catch{}
 let files=[];try{files=fs.readdirSync(path.join(root,'web/portraits'),{withFileTypes:true});}catch{}
 const list=files.filter(f=>f.isFile()&&/^char_[a-zA-Z0-9_]+\.png$/.test(f.name)).map(f=>{
  const id=f.name.slice(0,-4);return {id,name:names.get(id)||id,path:'portraits/'+f.name};
 }).sort((a,b)=>{
  const ai=DEFAULT_PORTRAITS.indexOf(a.id),bi=DEFAULT_PORTRAITS.indexOf(b.id);
  if(ai!==-1||bi!==-1)return (ai===-1?999:ai)-(bi===-1?999:bi);
  return a.name.localeCompare(b.name,'zh-CN')||a.id.localeCompare(b.id);
 });
 catalogs.set(root,list);return list.map(x=>({...x}));
}
function isValidPortrait(root,id){return typeof id==='string'&&listPortraits(root).some(x=>x.id===id);}
function defaults(root){return {version:1,name:'',portrait:listPortraits(root)[0]?.id||DEFAULT_PORTRAITS[0]};}
function validName(value){return typeof value==='string'&&value.trim().length>0&&value.trim().length<=20&&!/[\u0000-\u001f\u007f]/.test(value);}
function loadProfile(root,profileRoot=root){
 const profile=defaults(root),filename=path.join(path.resolve(profileRoot),'user-config.json');
 try{
  const stat=fs.lstatSync(filename);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>65536)return profile;
  const stored=JSON.parse(fs.readFileSync(filename,'utf8').replace(/^\uFEFF/,''));
  if(!stored||typeof stored!=='object'||Array.isArray(stored))return profile;
  if(validName(stored.name))profile.name=stored.name.trim();
  if(isValidPortrait(root,stored.portrait))profile.portrait=stored.portrait;
 }catch{}
 return profile;
}
function saveProfile(root,value,profileRoot=root){
 if(!value||typeof value!=='object'||!validName(value.name))throw Error('昵称须为 1～20 个字符。');
 if(!isValidPortrait(root,value.portrait))throw Error('请选择列表中的展示干员。');
 const profile={version:1,name:value.name.trim(),portrait:value.portrait};
 const folder=path.resolve(profileRoot),filename=path.join(folder,'user-config.json');
 const temporary=path.join(folder,'.user-config.'+process.pid+'.'+crypto.randomBytes(8).toString('hex')+'.tmp');
 try{
  fs.writeFileSync(temporary,JSON.stringify(profile,null,2)+'\n',{flag:'wx',mode:0o600});
  fs.renameSync(temporary,filename);
 }catch(e){try{fs.unlinkSync(temporary);}catch{}throw Error('本机配置保存失败，请确认解压后的文件夹可以写入。',{cause:e});}
 return profile;
}
module.exports={DEFAULT_PORTRAITS,listPortraits,isValidPortrait,loadProfile,saveProfile};
