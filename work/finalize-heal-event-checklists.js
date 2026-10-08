'use strict';
const fs=require('fs'),assert=require('node:assert/strict'),{readProgress}=require('../tools/lib/checklist-progress'),{checks}=require('../tools/check_game');
const before=JSON.parse(fs.readFileSync('work/heal-event-checklist-before.json','utf8'));
const oldMap=JSON.parse(fs.readFileSync('work/contract-checklist-revalidation.json','utf8'));
const tests=new Map(oldMap.mapped.map(v=>[v.id,v.tests]));
for(const id of ['op/char_290_vigna/skill/skchr_vigna_1/source-body','op/char_290_vigna/skill/skchr_vigna_2/source-body','op/char_289_gyuki/skill/skchr_gyuki_2/source-body'])tests.set(id,['tools/_client_stat_buff_smoke.js']);
for(const id of ['enemy_9014_acstma','enemy_9015_acstmb'])tests.set(`enemy/${id}/passive/damage-transfer`,['tools/_enemy_transfer_smoke.js']);
tests.set('batch/B03/training/act1/initial-hp',['tools/_training_runtime_smoke.js']);
tests.set('batch/B07/equip/eff_acarm060/source-body',['tools/_equip_protection_smoke.js']);
assert.equal(tests.size,495);
const logs=['a','b','a-resume'].map(s=>fs.readFileSync(`work/heal-event-checks-${s}.txt`,'utf8')).join('\n');
const passedNames=new Set([...logs.matchAll(/^PASS (.+)$/gm)].map(m=>m[1]));assert.equal(passedNames.size,124);
const passedFiles=new Set(checks.filter(([n])=>passedNames.has(n)).map(([,args])=>args[0]));
for(const [id,paths] of tests)if(before[id]?.done)for(const p of paths)assert.ok(passedFiles.has(p),id+' lacks passed '+p);
const additions=new Map([
 ['op/char_172_svrash/skill/skchr_svrash_3/final-defense',{tests:['tools/_final_defense_smoke.js'],note:'银灰S3十级源最终防御因子统一作用于比例与末端平加；真实侵蚀/物理承伤、Boss选敌、防御链接与面板、零因子/基础重算/结束及两玩家鉴权恢复通过。仅最终DEF传播，不纳入完整攻击/天赋/模组和所有负修正类别；见../mechanics/client-stat-buffs.md。'}],
 ['enemy/enemy_9017_achunt/passive/marked-death-cleanup',{tests:['tools/_achunt_cleanup_smoke.js'],note:'四个源根永久achunt_mark明确；首领最终死亡经GlobalSelector→InstantKill直接置零并走正常死亡/复活。真实关卡分级、重复子体、复活/坠落/漏怪/幂等、无伤害事件/干员击杀贡献、即时胜利、弹体及两归属鉴权恢复通过。三子体TARGET转伤和多个首领组合未纳入；见../research/enemy-achunt-cleanup-native.md。'}],
 ...['eff_acarm040','eff_acgarm040'].map(id=>[`batch/B07/equip/${id}/skill-stacks`,{tests:['tools/_equip_skill_stacks_smoke.js'],note:'按共用GlobalBuff八节点与两季源黑板接单件施法攻击叠层，普通5%/进阶8%每层、最多10层；概率1和满层仍消耗源Dice。真实后续普攻、持续技能/保命/最终死亡、两归属、失败施法、购买/奖励/穿戴、旧静态mods休整与鉴权恢复通过；96池/384补位通过。多件重复注册和当次瞬发优先级未验；见../mechanics/shop-items.md。'}])
]);
assert.equal(additions.size,4);for(const row of additions.values())for(const p of row.tests)assert.ok(passedFiles.has(p));
const files=['README','operator-checklist','enemy-checklist','library-checklist','mode-slot-checklist'],current=new Map();
for(const name of files)for(const [id,row]of readProgress(fs.readFileSync(`docs/checklists/${name}.md`,'utf8'))){assert.ok(!current.has(id));current.set(id,row);}
assert.equal(current.size,6328);assert.equal(Object.keys(before).length,6324);assert.equal(Object.values(before).filter(v=>v.done).length,497);
for(const [id,old]of Object.entries(before)){
 const cur=current.get(id);assert.ok(cur,id+' lost');let cursor=0;
 for(const note of old.notes){const n=cur.notes.indexOf(note,cursor);assert.ok(n>=cursor,id+' lost original note');cursor=n+1;}
 if(old.done&&!tests.has(id)){assert.equal(cur.basis,old.basis,id+' unsupported revalidation');assert.ok(cur.done,id+' unexplained reopening');}
}
for(const id of current.keys())assert.ok(before[id]||additions.has(id),'unexpected new '+id);
let affected=0;
for(const name of files){
 const p=`docs/checklists/${name}.md`,lines=fs.readFileSync(p,'utf8').split(/\r?\n/),out=[];
 for(let i=0;i<lines.length;i++){
  const line=lines[i],match=/^- \[([ xX])\] .*<!-- review:([^ ]+) basis:([a-f0-9]+) -->$/.exec(line);
  if(!match){out.push(line);continue;}
  const id=match[2],old=before[id],notes=[];while(/^  - 记录：/.test(lines[i+1]||''))notes.push(lines[++i]);
  const restore=old?.done&&!current.get(id).done,add=additions.get(id);
  out.push(restore||add?line.replace(/^- \[[ xX]\]/,'- [x]'):line,...notes);
  if(restore){affected++;out.push('  - 记录：2026-09-14；本批最终DEF、死亡清理、装备事件与目录兼容传播后沿原范围复核，'+tests.get(id).map(p=>'`node '+p+'`').join('、')+'通过；保留原来源、人工记录和限定边界，未核完整角色/敌人/多件装备不升级。');}
  if(add)out.push('  - 记录：2026-09-14；'+add.note+'验证：'+add.tests.map(p=>'`node '+p+'`').join('、')+'。');
 }
 fs.writeFileSync(p,out.join('\n'));
}
const final=[];for(const name of files)final.push(...readProgress(fs.readFileSync(`docs/checklists/${name}.md`,'utf8')));
assert.equal(final.length,6328);assert.equal(final.filter(([,v])=>v.done).length,501);
const report={beforeIds:6324,originalAccepted:497,revalidated:affected,added:[...additions.keys()],finalIds:6328,finalAccepted:501,passedGroups:124,mapped:[...tests,...[...additions].map(([id,v])=>[id,v.tests])].map(([id,paths])=>({id,tests:paths}))};
fs.writeFileSync('work/heal-event-checklist-revalidation.json',JSON.stringify(report,null,2)+'\n');
console.log('CHECKLIST PRESERVED '+JSON.stringify({original:497,revalidated:affected,added:4,total:6328,accepted:501}));
