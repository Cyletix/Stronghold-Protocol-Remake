'use strict';
// Preserve human review separately from automatically observed data presence.
const crypto=require('node:crypto');
const digest=value=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0,16);
function readProgress(text){
 const out=new Map(),lines=text.split(/\r?\n/);
 for(let i=0;i<lines.length;i++){
  const m=/^- \[([ xX])\] .*<!-- review:([^ ]+) basis:([a-f0-9]+) -->$/.exec(lines[i]);
  if(!m)continue;
  if(out.has(m[2]))throw Error('Duplicate review ID '+m[2]);
  const notes=[];while(/^  - 记录：/.test(lines[i+1]||''))notes.push(lines[++i]);
  const done=m[1].toLowerCase()==='x';
  if(done&&!notes.some(s=>s.trim()!=='- 记录：'))throw Error('Checked review requires a validation record: '+m[2]);
  out.set(m[2],{done,basis:m[3],notes});
 }
 return out;
}
function taskLine(id,label,basis,previous){
 const key=digest(basis),old=previous.get(id),changed=old&&old.basis!==key;
 const notes=old?.notes?.slice()||[];
 if(changed&&old.done)notes.push('  - 记录：源字段或相关执行代码已变化，自动重新打开；以上记录仅供追溯。');
 return ['- ['+(old?.done&&!changed?'x':' ')+'] '+label+' <!-- review:'+id+' basis:'+key+' -->',...notes].join('\n');
}
module.exports={digest,readProgress,taskLine};
