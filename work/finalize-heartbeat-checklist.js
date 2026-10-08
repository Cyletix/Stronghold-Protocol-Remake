'use strict';
const fs=require('fs'),assert=require('assert');
const {readProgress}=require('../tools/lib/checklist-progress');
const {checks}=require('../tools/check_game');
const before=JSON.parse(fs.readFileSync('work/heartbeat-mechanisms-checklist-before.json','utf8'));
const validation=JSON.parse(fs.readFileSync('work/heartbeat-mechanisms-validation-map.json','utf8'));
const mapped=new Map(validation.mapped.map(row=>[row.id,row.tests]));
const passed=new Set(['a','b'].flatMap(s=>fs.readFileSync('work/heartbeat-final-checks-'+s+'.txt','utf8').split('\n').filter(s=>s.startsWith('PASS ')).map(s=>s.slice(5))));
const commands=new Map(checks.map(([name,args])=>[args[0],{name,args}]));
assert.equal(passed.size,110);
const files=['README','operator-checklist','library-checklist','enemy-checklist','mode-slot-checklist'];
const ids=new Set();let restored=0,added=0,done=0;
for(const file of files){
 const path='docs/checklists/'+file+'.md';
 const original=fs.readFileSync(path,'utf8'),current=readProgress(original),lines=original.split(/\r?\n/),out=[];
 for(let i=0;i<lines.length;i++){
  const m=/^- \[([ xX])\] .*<!-- review:([^ ]+) basis:([a-f0-9]+) -->$/.exec(lines[i]);
  if(!m){out.push(lines[i]);continue;}
  const id=m[2];assert(!ids.has(id));ids.add(id);
  let line=lines[i],notes=[];while(/^  - 记录：/.test(lines[i+1]||''))notes.push(lines[++i]);
  if(before[id]?.done&&!current.get(id).done){
   const tests=mapped.get(id);assert(tests?.length,'Unmapped original scope '+id);
   for(const test of tests)assert(passed.has(commands.get(test)?.name),'Missing validation '+test);
   line=line.replace('- [ ]','- [x]');
   notes.push('  - 记录：2026-09-14；本批公共伤害、商店来源与目录兼容变化后复核原限定范围，'+tests.map(t=>'`node '+commands.get(t).args.join(' ')+'`').join('、')+'通过。源身份/养成与原边界保留，续接原验收；不由此升级完整技能、天赋、模组或敌人能力。');
   restored++;
  }
  if(!before[id]&&/\/(death-spawn|prop-like)\/source-body$/.test(id)){
   const prop=id.includes('/prop-like/');
   const test=prop?'tools/_enemy_prop_smoke.js':'tools/_enemy_death_spawn_smoke.js';
   assert(passed.has(commands.get(test).name));line=line.replace('- [ ]','- [x]');
   notes.push(prop?'  - 记录：2026-09-14；`node tools/_enemy_prop_smoke.js`逐一核14种源子敌（其中12种在本清单），当前HP覆写/翻倍、每次有效伤害扣1、指定法术/真伤、拒绝治疗、实际普攻/技能/弹体/持续伤害、元素积累及主机鉴权恢复通过。原生依据见[器物机制](../mechanics/enemy-death-spawn.md)；不可阻挡、动画和其他独立能力不在本子项。':'  - 记录：2026-09-14；`node tools/_enemy_death_spawn_smoke.js`逐一核14种源本体（其中12种在本清单）及54个子敌数量，最终死亡/复活/坠落/漏怪/沉默/幂等、关卡覆写、路线快照、阻波/清场/超时和主机鉴权恢复通过。原生依据见[器物机制](../mechanics/enemy-death-spawn.md)；随机延迟序列、散布/障碍和完整本体能力不在本子项。');added++;
  }
  if(id==='batch/B02')notes.push('  - 记录：2026-09-14；此前“仍缺数量与属性换算公式”的记录已被[敌群原生取证](../research/enemy-replacement-native.md)和B02限定子项替代，六模板生成及数量/间隔已接并验证。本批又接器物死亡生成与有效命中次数；总项仍因token/extraEnemy、动态分支等未完保持未勾，不再重复从零取证。');
  out.push(line,...notes);if(line.startsWith('- [x]'))done++;
 }
 fs.writeFileSync(path,out.join('\n'));
}
assert.equal(Object.values(before).filter(x=>x.done).length,451);
assert.equal(ids.size,6302);for(const id of Object.keys(before))assert(ids.has(id),'Lost ID '+id);
assert.equal(added,24);assert.equal(done,475);
console.log(JSON.stringify({originalIds:Object.keys(before).length,ids:ids.size,restored,added,done}));
