'use strict';
// Inventory only. An explicit handler does not imply a complete operator,
// and nonempty legacy text-classifier effects are never counted as completion.
const fs=require('node:fs'),path=require('node:path'),fixture=require('./_browser_fixture');
const root=path.resolve(__dirname,'..');
(async()=>{
 const f=fixture();await f.run('initMode()');
 const rows=JSON.parse(f.run(`JSON.stringify(ROSTER_LIST.slice().sort((a,b)=>a.tier-b.tier||a.charId.localeCompare(b.charId)).map(e=>({
  id:e.charId,name:e.name,tier:e.tier,branch:e.subProfession,
  action:ArkAttackProfiles[e.charId]?.action,shape:ArkAttackProfiles[e.charId]?.kind||'single',
  moduleAction:!!ArkAttackProfiles[e.charId]?.moduleLevels,
  defaultSkill:SKILL_DATA[e.charId]?.skillId,
  skills:(SKILL_CHOICES[e.charId]||[]).map(s=>({id:s.skillId,name:s.name,explicitAttackHandler:ArkClientPrograms.supported.includes(s.skillId)||ArkClientStatBuffSkills.supported.includes(s.skillId)||ArkOperatorCombat.supported.includes(s.skillId)||ArkElementOperators.supported.includes(s.skillId)||ArkMystic.skillIds.includes(s.skillId)||ArkDollkeeper.skillIds.includes(s.skillId)||ArkCommonSkills.supported.includes(s.skillId)||ArkMedicSkills.supported.includes(s.skillId)||ArkTactician.skillIds.includes(s.skillId)||ArkFlowShape.ids.includes(s.skillId)||Object.hasOwn(ArkTacticalSpecials.skillKeys,s.skillId),description:s.normal.desc.replace(/<[^>]*>/g,''),keys:Object.keys(s.normal.blackboard||{})}))
})))`));
 const count=rows.reduce((n,r)=>n+r.skills.filter(s=>s.explicitAttackHandler).length,0),all=rows.reduce((n,r)=>n+r.skills.length,0);
 const sourceInventory=JSON.parse(f.run('JSON.stringify({characters:Object.keys(ArkOperatorSkillData.characters).length,skillIds:Object.keys(ArkOperatorSkillData.skills).length})'));
 const report={schema:1,scope:'default act2autochess fixed roster skill associations',sourceInventory,rosterCount:rows.length,skillCount:all,explicitAttackHandlerCount:count,notes:'Explicit means a registered combat, common, elemental, medic or branch handler (including tactician/flow/special tactical), not full skill/talent/module fidelity. Legacy entries can contain working behavior; source IDs, roster skill associations and checked behavior scopes are separate counts.',rows};
 const lines=['# 干员机制逐项核对','', '由 `node tools/audit_operator_mechanics.js` 重建；仅统计当前 Web 名册，不能证明两季原版名册完整。人工完成记录统一在[实施 checkbox 总清单](../checklists/README.md)，本表只提供处理器统计。','',
 `本表仅统计默认盟约II固定名册 ${rows.length} 人、${all} 条可选技能关联；其中 ${count} 条登记了攻击、元素、治疗、公共或职业分支执行器（含战术实体）。其余为旧路径待核；这不是全项目只完成了 ${count} 个技能。源目录另有 ${sourceInventory.characters} 个资料身份、${sourceInventory.skillIds} 个独立skillId；限定行为验收数只见实施清单。`,
 '', '机制、证据、近似参数与下一批缺口见 [operator-mechanics.md](../mechanics/operator-mechanics.md)；元素系统见 [elemental-damage.md](../mechanics/elemental-damage.md)，医疗行为见 [basic-actions.md](../mechanics/basic-actions.md)。', '',
 '| 阶 | 干员 | 基础分支 / 形状 | 当前有处理器登记的技能（可能部分） | 旧路径待核对的技能 |','|---|---|---|---|---|'];
 for(const r of rows)lines.push(`| ${r.tier} | ${r.name} | ${r.branch} / ${r.shape} | ${r.skills.filter(s=>s.explicitAttackHandler).map(s=>s.name).join('、')||'—'} | ${r.skills.filter(s=>!s.explicitAttackHandler).map(s=>s.name).join('、')||'—'} |`);
 for(const [name,text]of [['operator-mechanics.json',JSON.stringify(report,null,2)+'\n'],['operator-mechanics.md',lines.join('\n')+'\n']]){
  const dest=path.join(root,'docs/generated',name);
  if(process.argv.includes('--check')){if(fs.readFileSync(dest,'utf8')!==text)throw Error(name+' drift');}else fs.writeFileSync(dest,text);
 }
 console.log(`OPERATOR AUDIT ${rows.length} roster, ${all} skills, ${count} explicit attack handlers (not full operators)`);
})().catch(e=>{console.error(e);process.exitCode=1;});
