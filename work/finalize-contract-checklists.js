'use strict';
const fs=require('fs'),assert=require('node:assert/strict');
const {readProgress}=require('../tools/lib/checklist-progress'),{checks}=require('../tools/check_game');
const before=JSON.parse(fs.readFileSync('work/mode-contract-checklist-before.json','utf8'));
const oldMap=JSON.parse(fs.readFileSync('work/heartbeat-mechanisms-validation-map.json','utf8'));
const tests=new Map(oldMap.mapped.map(v=>[v.id,v.tests]));
for(const [id,row] of Object.entries(before))if(row.done&&!tests.has(id)){
 if(id.includes('/death-spawn/source-body'))tests.set(id,['tools/_enemy_death_spawn_smoke.js']);
 else if(id.includes('/prop-like/source-body'))tests.set(id,['tools/_enemy_prop_smoke.js']);
 else if(id.includes('/passive/block-free'))tests.set(id,['tools/_enemy_passives_smoke.js']);
 else if(id.includes('/skill/')&&id.endsWith('/source-body'))tests.set(id,['tools/_client_stat_buff_smoke.js']);
}
assert.equal(tests.size,488);
const logs=['a','b','a-resume'].map(s=>fs.readFileSync(`work/contract-batch-checks-${s}.txt`,'utf8')).join('\n');
const passedNames=new Set([...logs.matchAll(/^PASS (.+)$/gm)].map(m=>m[1]));assert.equal(passedNames.size,120);
const passedFiles=new Set(checks.filter(([n])=>passedNames.has(n)).map(([,args])=>args[0]));
for(const [id,paths]of tests)if(before[id]?.done)for(const p of paths)assert.ok(passedFiles.has(p),id+' lacks passed '+p);
const additions=new Map([
 ['op/char_290_vigna/skill/skchr_vigna_1/source-body','红豆S1'],
 ['op/char_290_vigna/skill/skchr_vigna_2/source-body','红豆S2'],
 ['op/char_289_gyuki/skill/skchr_gyuki_2/source-body','缠丸S2'],
].map(([id,name])=>[id,`  - 记录：2026-09-14；${name}按原始CastSkill图和真实角色/等级接入。红豆限定模式证明核全部模式、角色及来源SHA；缠丸最终DEF=0核实际承伤、增益/平加、Boss选敌、流形联动与面板退出，基础属性不突变。tools/_client_stat_buff_smoke.js的848身份等级动作/九种鉴权恢复及source-only七项拒绝校验通过。仅本主体；未核天赋/模组、其他最终属性与原版动作时序继续保留。`]));
for(const id of ['enemy_9014_acstma','enemy_9015_acstmb'])additions.set(`enemy/${id}/passive/damage-transfer`,'  - 记录：2026-09-14；web/src/simulation/enemy-passives.js与engine受伤前事件接源hp_lose→BossSelector→PURE FixedValueDamage。tools/_enemy_transfer_smoke.js核物理/法术/真伤/元素扣HP、过量伤害、跳事件、实际关卡BOSS/NORMAL覆写、唯一合法目标、弹体及房主鉴权恢复。原始模板/方法见../research/enemy-transfer-native.md；未知多目标排序/动态标记与全Boss能力未纳入。');
additions.set('batch/B03/training/act1/initial-hp','  - 记录：2026-09-14；misc.initialHp=45经GenerateLocalSave→_LoadRunTimeData真实写入定位，仅chooseBand第一季训练新局消费。tools/_training_runtime_smoke.js核跨轮不补满、休整剩余生命、跨模式/赛季隔离及真实房主恢复。NPC坐标调用链、六槽轮选及完整Boss/训练流程未计完成；详见../mechanics/shop-items.md。');
additions.set('batch/B07/equip/eff_acarm060/source-body','  - 记录：2026-09-14；build_equip_protection.js核原始GlobalBuff、四节点和两季0.6数值，equip-protection.js在实际命中时按visualId/实体检查来源和动态阻挡。tools/_equip_protection_smoke.js验证近战、飞行中关系改变、购买穿戴、合法null槽休整及房主弹体恢复；坏对象/重复UID/库存null仍拒绝。多件去重仅本地约定，未知来源伤害、完整事件优先级和上游环境实例归并未验；详见../mechanics/shop-items.md。');
assert.equal(additions.size,7);
const files=['README','operator-checklist','enemy-checklist','library-checklist','mode-slot-checklist'];
const current=new Map();let affected=0;
for(const name of files){
 const p=`docs/checklists/${name}.md`,text=fs.readFileSync(p,'utf8');
 for(const [id,v]of readProgress(text)){assert.ok(!current.has(id));current.set(id,v);}
}
assert.equal(current.size,6324);assert.equal(Object.keys(before).length,6317);
for(const [id,old]of Object.entries(before)){
 const cur=current.get(id);assert.ok(cur,id+' lost');
 let cursor=0;for(const note of old.notes){const n=cur.notes.indexOf(note,cursor);assert.ok(n>=cursor,id+' lost original note');cursor=n+1;}
 if(old.done&&!tests.has(id)){assert.equal(cur.basis,old.basis,id+' unsupported revalidation');assert.ok(cur.done,id+' unexplained reopening');}
}
for(const id of current.keys())assert.ok(before[id]||additions.has(id),'unexpected new '+id);
for(const name of files){
 const p=`docs/checklists/${name}.md`,lines=fs.readFileSync(p,'utf8').split(/\r?\n/),out=[];
 for(let i=0;i<lines.length;i++){
  const line=lines[i],match=/^- \[([ xX])\] .*<!-- review:([^ ]+) basis:([a-f0-9]+) -->$/.exec(line);
  if(!match){out.push(line);continue;}
  const id=match[2],old=before[id],notes=[];while(/^  - 记录：/.test(lines[i+1]||''))notes.push(lines[++i]);
  const restore=old?.done&&!current.get(id).done,add=additions.get(id);
  out.push(restore||add?line.replace(/^- \[[ xX]\]/,'- [x]'):line,...notes);
  if(restore){affected++;out.push('  - 记录：2026-09-14；本批最终属性/模式证明、入站事件、装备与目录兼容变化后按原范围复核，'+tests.get(id).map(p=>'`node '+p+'`').join('、')+'通过。保留原源身份及验收边界；未核时序/模组/完整组合不随本批升级。');}
  if(add)out.push(add);
 }
 fs.writeFileSync(p,out.join('\n'));
}
const final=[];for(const name of files)final.push(...readProgress(fs.readFileSync(`docs/checklists/${name}.md`,'utf8')));
assert.equal(final.length,6324);assert.equal(final.filter(([,v])=>v.done).length,497);
const report={beforeIds:6317,originalAccepted:490,revalidated:affected,added:[...additions.keys()],finalIds:6324,finalAccepted:497,passedGroups:120,mapped:[...tests].map(([id,paths])=>({id,tests:paths}))};
fs.writeFileSync('work/contract-checklist-revalidation.json',JSON.stringify(report,null,2)+'\n');
console.log('CHECKLIST PRESERVED '+JSON.stringify({original:490,revalidated:affected,added:7,total:6324,accepted:497}));
