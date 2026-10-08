'use strict';
const fs=require('fs'),assert=require('assert');
const {readProgress}=require('../tools/lib/checklist-progress');
const {checks}=require('../tools/check_game');
const before=JSON.parse(fs.readFileSync('work/stat-graph-checklist-before.json','utf8'));
const validation=JSON.parse(fs.readFileSync('work/heartbeat-mechanisms-validation-map.json','utf8'));
const mapped=new Map(validation.mapped.map(row=>[row.id,row.tests]));
for(const id of Object.keys(before)){
 if(id.endsWith('/death-spawn/source-body'))mapped.set(id,['tools/_enemy_death_spawn_smoke.js']);
 if(id.endsWith('/prop-like/source-body'))mapped.set(id,['tools/_enemy_prop_smoke.js']);
}
const passed=new Set(['a','b','resume'].flatMap(s=>fs.readFileSync('work/source-batch-checks-'+s+'.txt','utf8').split(/\r?\n/).filter(s=>s.startsWith('PASS ')).map(s=>s.slice(5))));
const commands=new Map(checks.map(([name,args])=>[args[0],{name,args}]));
assert.equal(passed.size,116);
const files=['README','operator-checklist','library-checklist','enemy-checklist','mode-slot-checklist'];
const ids=new Set(),writes=[];let restored=0,addedSkills=0,addedEnemies=0,done=0;
for(const file of files){
 const path='docs/checklists/'+file+'.md';
 const original=fs.readFileSync(path,'utf8'),current=readProgress(original),lines=original.split(/\r?\n/),out=[];
 for(let i=0;i<lines.length;i++){
  const m=/^- \[([ xX])\] .*<!-- review:([^ ]+) basis:([a-f0-9]+) -->$/.exec(lines[i]);
  if(!m){out.push(lines[i]);continue;}
  const id=m[2];assert(!ids.has(id));ids.add(id);
  let line=lines[i],notes=[];while(/^  - 记录：/.test(lines[i+1]||''))notes.push(lines[++i]);
  for(const note of before[id]?.notes||[])assert(notes.includes(note),'Lost original note '+id);
  if(before[id]?.done&&!current.get(id).done){
   const tests=mapped.get(id);assert(tests?.length,'Unmapped original scope '+id);
   for(const test of tests)assert(passed.has(commands.get(test)?.name),'Missing validation '+test);
   line=line.replace('- [ ]','- [x]');
   notes.push('  - 记录：2026-09-14；本批严格属性图、敌人根被动、训练经济及目录兼容变化后复核原限定范围，'+tests.map(t=>'`node '+commands.get(t).args.join(' ')+'`').join('、')+'通过。沿用原验收边界及源身份，不由此升级完整技能、天赋、模组或敌人能力。');
   restored++;
  }
  if(!before[id]){
   if(id.startsWith('op/')&&id.endsWith('/source-body')){
    assert(passed.has('client stat graph execution'));line=line.replace('- [ ]','- [x]');addedSkills++;
    notes.push('  - 记录：2026-09-14；`node tools/_client_stat_buff_smoke.js`核本技能实际资料身份/合法等级、源黑板和SP、实际伤害或治疗/防御/攻击间隔、静态与动态攻速、持续退出/死亡、休整阻回及双归属鉴权恢复。六项新增主体在22个源ID的818个动作组合内验证；[严格源图与边界](../mechanics/client-stat-buffs.md)保留天赋/模组完整联动、原版动作帧序及mode_graph尚未支持。');
   }else if(id.endsWith('/passive/block-free')){
    assert(passed.has('enemy permanent block-free'));line=line.replace('- [ ]','- [x]');addedEnemies++;
    notes.push('  - 记录：2026-09-14；`node tools/_enemy_passives_smoke.js`逐一核九个真实根被动ID的关卡覆写、永久不可阻挡、旧干员/召唤物阻挡释放、实际穿行、普通攻击与blockedOnly/ownBlocked资格及鉴权恢复。[根被动证据](../mechanics/enemy-passives.md)限定BLOCK_FREE；不增加飞行/隐身/伤害免疫，转移伤害、标记和完整敌人能力仍未验收。');
   }else assert.fail('Unexpected new ID '+id);
  }
  out.push(line,...notes);if(line.startsWith('- [x]'))done++;
 }
 writes.push([path,out.join('\n')]);
}
assert.equal(Object.keys(before).length,6302);assert.equal(Object.values(before).filter(x=>x.done).length,475);
assert.equal(ids.size,6317);for(const id of Object.keys(before))assert(ids.has(id),'Lost ID '+id);
assert.equal(restored,465);assert.equal(addedSkills,6);assert.equal(addedEnemies,9);assert.equal(done,490);
for(const [path,content]of writes)fs.writeFileSync(path,content);
console.log(JSON.stringify({originalIds:6302,ids:ids.size,restored,addedSkills,addedEnemies,done,passed:passed.size}));
