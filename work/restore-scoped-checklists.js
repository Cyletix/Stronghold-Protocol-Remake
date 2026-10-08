'use strict';
// One-shot continuation of the exact original reviewed scopes after the parent
// supplied successful results for each mapped test. This is not a generator.
const fs=require('node:fs'),crypto=require('node:crypto');
const report=JSON.parse(fs.readFileSync('work/funnel-checklist-continuation.json','utf8'));
if(report.items.length!==434||report.missing.length)throw Error('Unexpected scope');
for(const [file,sha]of Object.entries(report.sourceHashes))if(crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')!==sha)throw Error('Source changed since impact review: '+file);
const byId=new Map(report.items.map(r=>[r.id,r])),seen=new Set();
for(const name of ['README','operator-checklist','library-checklist','enemy-checklist','mode-slot-checklist']){
 const file='docs/checklists/'+name+'.md',lines=fs.readFileSync(file,'utf8').split('\n'),out=[];
 for(let i=0;i<lines.length;i++){
  const line=lines[i],id=/<!-- review:([^ ]+) basis:/.exec(line)?.[1],r=byId.get(id);
  if(!r){out.push(line);continue;}
  if(!line.startsWith('- [ ]'))throw Error('Unexpected already-reviewed state: '+id);
  seen.add(id);out.push(line.replace('- [ ]','- [x]'));
  while(/^  - 记录：/.test(lines[i+1]||''))out.push(lines[++i]);
  const commands=r.requiredCommands.map(c=>'`'+c+'`').join('、');
  const extra=r.impact==='enemy-spawn-related'?'仅延续既有寒冷/冻结能力范围，不验收波次/模板全部行为。':r.impact==='funnel-owner-related'?'仅延续原固定配置或公共S1本体，不提升为复杂浮游技能或整项天赋完成。':'仅延续原记录限定范围；精确时序、未核模组及完整组合边界不变。';
  out.push('  - 记录：2026-09-14 客户端批次影响复核：本子项相关既有CN源字段未改；共享执行/存档/模式文件指纹已更新。'+commands+'及本轮集成检查通过，'+extra+(r.inferredCommand?' 原记录遗漏的专项命令已按 '+r.inferredCommand.evidence+' 与实际断言补定位。':''));
 }
 fs.writeFileSync(file,out.join('\n'));
}
if(seen.size!==434)throw Error('Missing previous reviews: '+[...byId.keys()].filter(k=>!seen.has(k)).join(','));
console.log('RESTORED PREVIOUS LIMITED SCOPES',seen.size);
