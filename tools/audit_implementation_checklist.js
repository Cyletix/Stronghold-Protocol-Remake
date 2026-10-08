'use strict';
// Read source identities and actual page catalogs. Never infer completion from
// text classification, a matching ID, an image, or the mere existence of a test.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {readProgress,taskLine,digest}=require('./lib/checklist-progress');
const {loadReceipt,canPreserve}=require('./lib/checklist-revalidation');
const root=path.resolve(__dirname,'..'),check=process.argv.includes('--check');
const scopeSkillModes=process.argv.includes('--scope-skill-modes');
const scopeGarrisonBatches=process.argv.includes('--scope-garrison-batches');
const scopeEnemySelectableAttacks=process.argv.includes('--scope-enemy-selectable-attacks');
const scopeEnemyAttached=process.argv.includes('--scope-enemy-attached-projectiles');
const scopeEnemyAuras=process.argv.includes('--scope-enemy-auras');
if([scopeSkillModes,scopeGarrisonBatches,scopeEnemySelectableAttacks,scopeEnemyAuras,scopeEnemyAttached].filter(Boolean).length>1)throw Error('Choose one scoped update');
const outputArg=process.argv.indexOf('--output-dir');
const outputRoot=outputArg>=0?path.resolve(root,process.argv[outputArg+1]||''):root;
if(outputArg>=0&&(!process.argv[outputArg+1]||outputRoot===root||path.relative(root,outputRoot).startsWith('..')||path.isAbsolute(path.relative(root,outputRoot))))throw Error('Preview output must be a child directory of the project');
const receiptArg=process.argv.indexOf('--revalidation');
const receipt=receiptArg>=0?loadReceipt(root,process.argv[receiptArg+1]||''):null;
const files={},hashes={},readText=p=>{const s=fs.readFileSync(path.join(root,p),'utf8');hashes[p]=crypto.createHash('sha256').update(s).digest('hex');return s;};
const read=p=>JSON.parse(readText(p)),unique=a=>[...new Set(a)],sorted=a=>unique(a).sort();
const clean=s=>String(s||'').replace(/<\/?(?:@[^>]*|\$[^>]*|)>/g,'').replace(/<[^>]*>/g,m=>/^<[^>]*[\u4e00-\u9fff]/.test(m)?'【'+m.slice(1,-1)+'】':'').replace(/\\n|[\r\n]+/g,' / ').replace(/\|/g,'／').trim();
const short=(s,n=340)=>{s=clean(s);return s.length>n?s.slice(0,n)+'…（全文见源字段）':s;};
const code=s=>'`'+String(s??'—').replace(/`/g,'')+'`';
const gd='data/ArknightsGameData/zh_CN/gamedata/',seasonName={act1autochess:'盟约 I',act2autochess:'盟约 II'};
const roman=['—','I','II','III','IV','V','VI'];
const previous=new Map(),seen=new Set(),reviewTasks=[];
for(const p of ['docs/checklists/README.md','docs/checklists/operator-checklist.md','docs/checklists/library-checklist.md','docs/checklists/enemy-checklist.md','docs/checklists/mode-slot-checklist.md']){
 if(fs.existsSync(path.join(root,p)))for(const [id,value]of readProgress(fs.readFileSync(path.join(root,p),'utf8'))){if(previous.has(id))throw Error('Duplicate review '+id);previous.set(id,value);}
}
function task(id,label,basis,group){
 if(seen.has(id))throw Error('Duplicate task '+id);seen.add(id);
 let line=taskLine(id,label,basis,previous);
 const old=previous.get(id),currentBasis=digest(basis);
 if(old?.done&&old.basis!==currentBasis&&canPreserve(receipt,{id,fromBasis:old.basis,toBasis:currentBasis})){
  line=['- [x] '+label+' <!-- review:'+id+' basis:'+currentBasis+' -->',...old.notes].join('\n');
 }
 reviewTasks.push({id,group,checked:line.startsWith('- [x]'),basis:digest(basis),notes:line.split('\n').slice(1)});
 return line;
}
const fact=(ok,label)=>'- ['+(ok?'x':' ')+'] **资料检查**：'+label;
function doc(p,lines){files[p]=lines.join('\n')+'\n';}
function link(p,label){return '['+label+']('+p+')';}
function auditEnemySelectableAttacks(){
 const aura=scopeEnemyAuras,attached=scopeEnemyAttached,field=attached?'attachedProjectile':aura?'enemyAura':'selectableAttack',auditKey=attached?'enemyAttachedProjectiles':aura?'enemyAuras':'enemySelectableAttacks';
 const indexPath='docs/checklists/implementation-checklist.json',enemyPath='docs/checklists/enemy-checklist.md';
 const old=read(indexPath),prior=fs.readFileSync(path.join(root,enemyPath),'utf8');
 const raw=readText('web/external_combat_data.js'),prefix='window.ArkExternalCombatData=';
 const at=raw.indexOf(prefix);if(at<0)throw Error('Missing external combat data assignment');
 const data=JSON.parse(raw.slice(at+prefix.length).trim().replace(/;$/,''));
 const imported=read('work/external-combat-import-report.json')[attached?'attachedProjectiles':aura?'enemyAuras':'selectableAttacks'];
 const appearance=read('work/garrison-encounter-scope.json'),actual=new Set(appearance.eligibleEnemyIDs);
 if(!imported?.selections)throw Error('Build selectable attack provider report before its scoped checklist');
 const selected=Object.entries(data.enemies).filter(([,p])=>p[field]).map(([id])=>id).sort();
 if(!selected.length)throw Error('No compiled selectable ordinary attack providers');
 const evidencePaths=attached?['tools/enemy_attach_projectiles.py','tools/build_external_combat_data.py','tools/test_enemy_attach_projectiles.py','tools/_enemy_attached_projectiles_smoke.js','web/src/simulation/enemy-attached-projectiles.js','web/engine.js','web/src/render/battle-presentation.js','work/enemy-attach-projectile-contract.json','work/enemy-attach-action-owned-source.json','work/enemy-attach-projectile-owned-source.json']:aura?['tools/enemy_auras.py','tools/build_external_combat_data.py','tools/test_enemy_auras.py',
  'web/src/simulation/enemy-auras.js','web/src/simulation/external-combat.js','web/src/simulation/skill-auras.js',
  'web/src/simulation/operator-combat.js','web/engine.js','tools/_enemy_auras_smoke.js',
  'work/enemy-aura-contract.json','work/enemy-aura-sluggish-source.json']:['tools/enemy_selectable_attacks.py','tools/build_external_combat_data.py',
  'tools/test_enemy_selectable_attacks.py','tools/_enemy_selective_attacks_contract_smoke.js',
  'web/src/simulation/enemy-selective-attacks.js','web/src/simulation/external-combat.js','web/engine.js',
  'work/enemy-selectable-attack-candidates.json','work/enemy-selectable-attack-contract.json'];
 const evidenceHashes=Object.fromEntries(evidencePaths.map(p=>{readText(p);return [p,hashes[p]];}));
 const oldTasks=new Map(old.tasks.map(t=>[t.id,t])),oldEnemies=new Set(old.enemies.map(e=>e.id));
 const nextTasks=old.tasks.slice(),taskIds=[];let text=prior;
 for(const id of selected){
  const ir=data.enemies[id][field],selection=imported.selections[id];
  if(!actual.has(id)||!oldEnemies.has(id)||!selection?.accepted||
   JSON.stringify(selection[field])!==JSON.stringify(ir))throw Error('Unbound or out-of-scope enemy provider '+id);
  if(aura&&(data.enemies[id].initialMode!==0||data.enemies[id].modes?.[0]?.sourceNoBasicAttack!==true))throw Error('Missing proved empty ordinary mode '+id);
  const taskId='enemy/'+id+(attached?'/basic/source-attached-projectile-body':aura?'/talent/source-aura-body':'/basic/source-selectable-attack-body');taskIds.push(taskId);
  if(oldTasks.has(taskId)){
   const historic=previous.get(taskId),task=oldTasks.get(taskId);
   if(!historic||historic.basis!==task.basis||historic.done!==task.checked||JSON.stringify(historic.notes)!==JSON.stringify(task.notes))
    throw Error('Historical Markdown/JSON disagreement '+taskId);
   continue; // This scope adds provider tasks; it never revalidates old basis.
  }
  if(previous.has(taskId))throw Error('Unindexed historical selectable task '+taskId);
  const parentId='enemy/'+id+'/base',lines=text.split('\n');
  const anchor=lines.findIndex(line=>line.includes('<!-- review:'+parentId+' basis:'));
  if(anchor<0||!oldTasks.has(parentId))throw Error('Missing historical enemy base parent '+id);
  const label=attached?'**普通攻击提供者 · 延迟固定落点范围弹体限定主体**：完整双普通动作通道、当前源射程与标记优先/无标记回退；选定目标后在OnAttack冻结位置及物理攻击力，3秒后只伤害当前圈内合格单位，不跟随/强制补伤追踪目标。已发弹体独立于来源死亡，待发动作中断取消；范围提示、轮末等待、池复用及主机恢复按记录验收。标记排序、发出帧与独立寿命为明确模型；环境标记生产者、完整敌技和阶段另核，不勾整敌。':aura?'**敌方持续光环 · 三天赋限定主体**：完整源挂载、0.5圆形范围与进入后每秒法伤，独立来源计时和离场撤销；通用伤害事件按当前攻击力派发神经损伤，一次命中只派一次。自身状态抵抗和精确override竞争进入真实消费者，源空普通模式禁用旧兜底攻击，实际出生、退出重入、护盾、状态及主机恢复按记录验收。0.5静态圆与跨版本对应、首次周期、零伤不派元素及override胜出为明确模型，完整阶段/天赋组合与整敌另核。':'**普通攻击提供者 · 双分支范围弹体限定主体**：实际池绑定完整 AbilitySelectableGroup，源全场选择器优先指定余音模式1，回退敌对目标；共享冷却、首动画事件与三发固定间隔、落点法术范围及有效追踪目标单次追加，施法/来源结束后的已发弹体和鉴权恢复按本组模型核查。余音目前无源模式提供者，首分支只按显式 mode1 fixture 验证；真实余音切形态、受伤联动、召唤及独立技能不在本项，不能据此勾整敌或全阶段闭环。排序、后续发射、追踪追加与弹体清理是已记录的跨源推断/仿真约定，不宣称原生等价。';
  const basis={rule:imported.rule,sourceFingerprint:selection.sourceFingerprint,provider:ir,
   appearance:appearance.appearanceReferences[id]||[],evidenceHashes};
  const block=taskLine(taskId,label,basis,new Map()),basisHash=digest(basis);
  lines.splice(anchor,0,block);text=lines.join('\n');
  nextTasks.push({id:taskId,group:'enemy',checked:false,basis:basisHash,notes:[]});
 }
 const report={...old,tasks:nextTasks,scopedAudits:{...old.scopedAudits,[auditKey]:{
  enemyIds:selected,taskIds,ordinaryProviderBindings:selected.length,
  sourceFingerprint:digest(selected.map(id=>({id,sourceFingerprint:imported.selections[id].sourceFingerprint}))),
  sourceHashes:{...evidenceHashes,'web/external_combat_data.js':hashes['web/external_combat_data.js'],
   'work/garrison-encounter-scope.json':hashes['work/garrison-encounter-scope.json']},
  boundary:'Only new actually bound provider subitems were appended. Every historical task, basis, note, checkbox, enemy/operator fact and other provider scope remains unchanged. Limited provider acceptance does not close whole enemies or stages.'}}};
 const outputs={[enemyPath]:text,[indexPath]:JSON.stringify(report,null,2)+'\n'};
 for(const [file,value]of Object.entries(outputs)){
  const dest=path.join(outputRoot,file);
  if(check){if(!fs.existsSync(dest)||fs.readFileSync(dest,'utf8')!==value)throw Error('STALE '+file);}
  else{fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,value);}
 }
 console.log('ENEMY '+(attached?'ATTACHED':aura?'AURA':'SELECTABLE')+' CHECKLIST '+JSON.stringify({providerBindings:selected.length,
  appendedTasks:nextTasks.length-old.tasks.length,historicalTasksPreserved:old.tasks.length,checkedUnchanged:true}));
}
async function main(){
 if(scopeEnemySelectableAttacks||scopeEnemyAuras||scopeEnemyAttached)return auditEnemySelectableAttacks();
 const chars=read(gd+'excel/character_table.json'),skillSource=read(gd+'excel/skill_table.json');
 const activity=read(gd+'excel/activity_table.json'),seasons=activity.activity.AUTOCHESS_SEASON;
 const diy=read('web/diy_roster.json');
 const sourceBattles=read('web/source_battles.json'),encounters=read('web/enemy_encounters.json');
 const db=read(gd+'levels/enemydata/enemy_database.json'),handbook=read(gd+'excel/enemy_handbook_table.json').enemyData;
 const talents=read('web/talent_data.json'),choices=read('web/skill_choices.json'),modules=read('web/module_data.json');
 const levelData=read('web/level_data.json'),ranges=read('web/range_data.json'),garrison=read('web/garrison_data.json'),bosses=read('web/boss_mechanics.json');
 const codePaths=['web/engine.js','web/src/simulation/operator-combat.js','web/src/simulation/elemental-operators.js','web/src/simulation/elemental.js','web/src/simulation/boss-mechanics.js','web/src/simulation/enemy-cold.js','web/src/simulation/common-skills.js','tools/build_enemy_cold.js','web/mode/garrison.js','web/mode/ops.js','web/mode/battle.js'];
 const coldPaths=['tools/build_enemy_cold.js','web/enemy_cold_data.js','web/src/simulation/enemy-cold.js','web/engine.js','web/src/simulation/operator-combat.js','web/src/render/battle-presentation.js','tools/_enemy_cold_smoke.js'];
 const coldBasis=Object.fromEntries(coldPaths.map(p=>{readText(p);return [p,hashes[p]];}));
 const costPaths=['web/src/simulation/common-skills.js','web/src/simulation/attributes.js','web/engine.js','web/mode/rules.js','web/mode/decision.js','web/mode/equip.js','web/src/render/battle-presentation.js','tools/_common_cost_skills_smoke.js','tools/_common_buff_skills_smoke.js','tools/lib/common-buff-cases.js'];
 costPaths.push('tools/build_common_skill_data.js','web/common_skill_data.js','tools/_common_expansion_smoke.js');
 const levelPaths=['tools/build_operator_skill_levels.js','web/operator_skill_levels.js','web/src/rules/skill-levels.js','web/mode/rules.js','web/mode/roster.js','tools/_operator_skill_levels_smoke.js'];
 const levelBasis=Object.fromEntries(levelPaths.map(p=>{readText(p);return [p,hashes[p]];}));
 const costBasis=Object.fromEntries(costPaths.map(p=>{readText(p);return [p,hashes[p]];}));
 const vanguardIds=['skchr_scave_2','skchr_blackd_2','skchr_texas_2'];
 const vanguardBasis={...costBasis,...Object.fromEntries(['web/src/simulation/operator-combat.js','tools/_vanguard_skills_smoke.js'].map(p=>{readText(p);return [p,hashes[p]];}))};
 const medicBasis={...costBasis,...Object.fromEntries(['web/src/simulation/medic-skills.js','web/src/simulation/dollkeeper.js','web/src/simulation/tactician.js','tools/build_basic_attacks.js','tools/_medic_skills_smoke.js','tools/_periodic_medic_smoke.js','tools/_protective_medic_smoke.js','tools/_medic_talents_smoke.js'].map(p=>{readText(p);return [p,hashes[p]];}))};
 codePaths.push('web/src/simulation/medic-skills.js');
 const dronePaths=['web/src/simulation/medic-drone.js','web/mode/tactical.js','tools/lib/room-game-runtime.js','tools/_medic_drone_smoke.js','tools/_medic_module_sp_smoke.js','tools/build_elemental_data.js','web/elemental_data.js'];
 for(const p of dronePaths){readText(p);medicBasis[p]=hashes[p];}codePaths.push('web/src/simulation/medic-drone.js');
 const beeswaxBasis={...costBasis,...Object.fromEntries(['tools/build_basic_attacks.js','web/src/simulation/operator-combat.js','web/mode/debug.js','tools/_beeswax_smoke.js'].map(p=>{readText(p);return [p,hashes[p]];}))};
 const duskBasis={...costBasis,...Object.fromEntries(['tools/build_basic_attacks.js','web/src/simulation/operator-combat.js','tools/_dusk_smoke.js'].map(p=>{readText(p);return [p,hashes[p]];}))};
 const funnelBasis=Object.fromEntries(['tools/build_basic_attacks.js','web/engine.js','web/src/simulation/operator-combat.js','web/mode/debug.js','tools/_funnel_smoke.js','tools/_click_smoke.js','docs/mechanics/funnel.md'].map(p=>{readText(p);return [p,hashes[p]];}));
 readText('tools/_medic_aura_smoke.js');medicBasis['tools/_medic_aura_smoke.js']=hashes['tools/_medic_aura_smoke.js'];
 const elementPaths=['tools/build_elemental_data.js','web/elemental_data.js','web/src/simulation/elemental.js','web/src/simulation/elemental-operators.js','web/src/simulation/operator-combat.js','web/mode/rules.js','web/mode/debug.js','tools/_elemental_sources_smoke.js'];
 const elementBasis=Object.fromEntries(elementPaths.map(p=>{readText(p);return [p,hashes[p]];}));
 const hunterPaths=['tools/build_basic_attacks.js','web/src/simulation/hunter.js','web/src/simulation/operator-combat.js','web/engine.js','web/mode/rules.js','web/src/render/battle-presentation.js','tools/_hunter_smoke.js',gd+'buff_table.json'];
 const hunterBasis=Object.fromEntries(hunterPaths.map(p=>{readText(p);return [p,hashes[p]];}));
 const mysticPaths=['tools/build_basic_attacks.js','web/src/simulation/mystic.js','web/src/simulation/operator-combat.js','web/engine.js','web/mode/rules.js','web/src/render/battle-presentation.js','tools/_mystic_smoke.js'];
 const mysticBasis=Object.fromEntries(mysticPaths.map(p=>{readText(p);return [p,hashes[p]];}));
 const dollPaths=['tools/build_basic_attacks.js','web/src/simulation/dollkeeper.js','web/src/simulation/operator-combat.js','web/engine.js','web/mode/rules.js','web/src/render/battle-presentation.js','tools/_dollkeeper_smoke.js','tools/lib/dollkeeper-cases.js'];
 const dollBasis=Object.fromEntries(dollPaths.map(p=>{readText(p);return [p,hashes[p]];}));
 const tacticalPaths=['web/mode/tactical.js','tools/_tactical_controls_smoke.js','tools/_room_game_client_smoke.js','tools/room_server.js','tools/lib/room-battle-session.js','web/src/simulation/paired-battle.js','tools/build_basic_attacks.js','web/src/simulation/tactician.js','web/src/simulation/flow-shape.js','web/src/simulation/operator-combat.js','web/engine.js','web/mode/rules.js','web/mode/decision.js','web/mode/battle.js','web/mode/save.js','web/mode/ui.js','web/styles/detail.css','web/room-game.js','tools/lib/room-game-runtime.js','tools/_tactician_smoke.js','tools/lib/tactician-cases.js'];
 const tacticalBasis=Object.fromEntries(tacticalPaths.map(p=>{readText(p);return [p,hashes[p]];}));
 tacticalPaths.push('web/src/simulation/blacknight.js','tools/_blacknight_smoke.js','web/mode/debug.js','web/mode/data.js','web/mode/roster.js','web/src/simulation/tactical-specials.js','tools/_tactical_specials_smoke.js','web/mode/equip.js');
 for(const p of tacticalPaths){readText(p);tacticalBasis[p]=hashes[p];}
 codePaths.push('web/src/simulation/tactician.js','web/src/simulation/flow-shape.js','web/src/simulation/blacknight.js','web/src/simulation/tactical-specials.js');
 codePaths.push('web/src/simulation/dollkeeper.js','web/src/simulation/hunter.js','web/src/simulation/attributes.js','web/src/simulation/mystic.js');
 const fixedCodePaths=['tools/build_mode_rules.js','tools/build_modules.js','tools/build_basic_attacks.js','web/mode/rules.js','web/mode/data.js','web/mode/decision.js','web/mode/save.js','web/src/rules/run-setup.js','tools/_season_roster_smoke.js'];
 const fixedCode=Object.fromEntries(fixedCodePaths.map(p=>{readText(p);return [p,hashes[p]];}));
 const codeFiles={};for(const p of codePaths)if(fs.existsSync(path.join(root,p)))codeFiles[p]=readText(p);
 const tests=Object.fromEntries(fs.readdirSync(path.join(root,'tools')).filter(p=>/^_.*smoke\.js$/.test(p)).map(p=>['tools/'+p,fs.readFileSync(path.join(root,'tools',p),'utf8')]));
 const refs=(texts,id)=>Object.entries(texts).filter(([,s])=>s.includes(id)).map(([p])=>p);
 const testRefs=id=>refs(tests,id);
 const f=require('./_browser_fixture')();await f.run('initMode()');
 for(const p of ['web/battle_data.json','web/basic_attacks.js','web/mode_rules.json','web/operator_tiers.json'])readText(p);
 const live=JSON.parse(f.run(`JSON.stringify({roster:ROSTER_LIST.map(o=>({id:o.charId,name:o.name,tier:o.tier})),seasonRosters:Object.fromEntries(Object.keys(MODE_RULES.seasons).map(sid=>[sid,seasonRoster(sid).list.map(o=>({id:o.charId,name:o.name,tier:o.tier}))])),operators:BATTLE.operators.map(o=>({id:o.charId,name:o.name,position:o.position})),enemies:BATTLE.enemies,profiles:ArkAttackProfiles,skillLevelCounts:Object.fromEntries(Object.entries(ArkOperatorSkillData.skills).map(([id,levels])=>[id,levels.length])),attackSkills:ArkOperatorCombat.supported,medicSkills:ArkMedicSkills.supported,elementSkills:ArkElementOperators.supported,commonSkills:ArkCommonSkills.supported,mysticSkills:ArkMystic.skillIds,dollSkills:ArkDollkeeper.skillIds,tacticalSkills:[...ArkTactician.skillIds,...ArkFlowShape.ids,...Object.keys(ArkTacticalSpecials.skillKeys)]})`));
 live.clientStatSkills=JSON.parse(f.run('JSON.stringify(ArkClientStatBuffSkills.supported)'));
 const clientPrograms=JSON.parse(f.run('JSON.stringify(ArkClientProgramData)'));
 const skillModes=JSON.parse(f.run('JSON.stringify(ArkSkillModeData)'));
 const nextAttacks=JSON.parse(f.run('JSON.stringify(ArkNextAttackSkillData)'));
 const directSkills=JSON.parse(f.run('JSON.stringify(window.ArkDirectSkillData||{profiles:{}})'));
 const batchPath='work/garrison-skill-batch-report.json';
 const batchReport=fs.existsSync(path.join(root,batchPath))?read(batchPath):null;
 // Provider migration and the first explicit handler are different facts. The
 // former selects checklist rows; only the latter increases coverage counts.
 const batchSelection=new Map(),providerSuffix={'client-programs':'source-body','next-attack':'source-next-attack-body','skill-modes':'source-mode-body','direct-actions':'source-direct-body'};
 if(batchReport){
  const baseline=read(batchReport.baseline);
  for(const [provider,entry]of Object.entries(batchReport.providers)){
   if(!providerSuffix[provider])throw Error('Unknown checklist batch provider '+provider);
   const newProfiles=new Set(entry.newProfileIds),oldMembers=new Set(baseline.providerMemberIds[entry.data]);
   for(const key of entry.garrisonMemberIds){
    const member=batchReport.members[key];if(!member)throw Error('Missing batch member '+key);
    if(!newProfiles.has(member.skillId)&&oldMembers.has(key))continue;
    if(!batchSelection.has(key))batchSelection.set(key,{...member,providers:[]});
    batchSelection.get(key).providers.push(provider);
   }
  }
 }
 live.nextAttackSkills=Object.keys(nextAttacks.profiles);
 live.directSkills=Object.keys(directSkills.profiles);
 const directBasis=Object.fromEntries(['tools/build_direct_skill_data.py','tools/direct_skill_compiler.py','web/direct_skill_data.js','web/src/simulation/direct-skill-actions.js','web/src/simulation/operator-combat.js','web/engine.js','web/mode/rules.js','tools/_direct_skill_actions_smoke.js','tools/_direct_skill_projectiles_smoke.js'].map(p=>{readText(p);return [p,hashes[p]];}));
 const nextAttackBasis=Object.fromEntries(['tools/build_next_attack_skill_data.py','tools/next_attack_compiler.py','tools/next_attack_compound.py','tools/test_next_attack_compound.py','tools/_next_attack_compound_smoke.js','work/client-logic/native-deployment-buffs/contract.json','tools/next_attack_hit_buffs.py','tools/next_attack_heal_compiler.py','web/next_attack_skill_data.js','web/src/simulation/operator-combat.js','tools/_next_attack_skills_smoke.js','tools/_next_heal_skills_smoke.js'].map(p=>{readText(p);return [p,hashes[p]];}));
 live.skillModeSkills=Object.keys(skillModes.profiles);
 const skillModeBasis=Object.fromEntries(['tools/build_skill_mode_data.py','tools/skill_mode_compiler.py','tools/skill_mode_appear.py','tools/skill_mode_hit_buffs.py','tools/operator_chain_projectiles.py','tools/skill_aura_compiler.py','tools/skill_mode_aura.py','web/skill_mode_data.js','web/src/simulation/skill-modes.js','web/src/simulation/skill-auras.js','web/src/simulation/client-programs.js','web/src/simulation/operator-combat.js','web/src/simulation/attributes.js','web/src/simulation/enemy-cold.js','web/src/simulation/enemy-skills.js','web/src/simulation/hunter.js','web/src/simulation/mystic.js','web/engine.js','web/mode/rules.js','tools/lib/source-battle.js','tools/_operator_skill_modes_smoke.js','tools/_skill_mode_expansion_smoke.js','tools/_skill_mode_hit_buffs_smoke.js','tools/_skill_mode_chain_smoke.js','tools/_deployment_programs_smoke.js','tools/_skill_mode_deployment_smoke.js','tools/_source_attack_debuff_smoke.js','tools/_program_range_smoke.js','tools/test_skill_aura_compiler.py','tools/test_skill_mode_aura.py','tools/_skill_mode_aura_smoke.js','tools/_skill_aura_membership_smoke.js','tools/_aura_status_consumers_smoke.js','tools/_delayed_attack_body_smoke.js','work/skill-aura-batch-contract.json','work/client-logic/native-aura-overrides/contract.json','tools/skill_mode_ammo.py','tools/test_skill_mode_ammo.py','tools/_skill_mode_ammo_smoke.js','tools/_finite_ammo_programs_smoke.js','work/skill-ammo-controller-contract.json','work/client-logic/skill-ammo-target-enums.json','work/client-logic/native-ammo-controller/contract.json','work/client-logic/native-ammo-selector/contract.json','tools/_source_target_priority_smoke.js'].map(p=>{readText(p);return [p,hashes[p]];}));
 for(const p of ['tools/skill_mode_blockees.py','web/src/simulation/skill-blockees.js',
  'web/src/simulation/enemy-hover.js','web/index.html','tools/test_skill_mode_blockees.py',
  'tools/_skill_mode_blockees_smoke.js','work/skill-blockee-batch-contract.json']){
  readText(p);skillModeBasis[p]=hashes[p];
 }
 live.clientProgramSkills=Object.keys(clientPrograms.profiles);
 for(const p of ['tools/skill_mode_self_buffs.py','web/src/simulation/skill-self-buffs.js',
  'tools/test_skill_mode_self_buffs.py','tools/_skill_mode_self_buffs_smoke.js',
  'tools/_self_buff_consumers_smoke.js','work/skill-self-buff-next-contracts-20260918.json',
  'work/skill-self-buff-batch-contract.json','work/client-logic/native-deployment-buffs/contract.json']){
  readText(p);skillModeBasis[p]=hashes[p];
 }
 for(const p of ['tools/skill_mode_end_effects.py','tools/test_skill_mode_end_effects.py','tools/test_skill_mode_end_integration.py',
  'web/src/simulation/skill-end-effects.js','web/src/simulation/equip-protection.js','web/src/simulation/dollkeeper.js',
  'tools/_skill_end_effects_contract_smoke.js','tools/_skill_mode_end_effects_smoke.js','tools/_skill_end_effect_consumers_smoke.js',
  'work/skill-mode-end-effects-contract.json','work/skill-mode-end-effects-batch-contract.json']){
  readText(p);skillModeBasis[p]=hashes[p];
 }
 for(const p of ['tools/skill_mode_passive.py','tools/test_skill_mode_passive.py','tools/_skill_passive_smoke.js',
  'work/skill-passive-source-contract.json','tools/skill_mode_flow.py','tools/test_skill_mode_flow.py',
  'tools/audit_skill_flows.py','tools/_skill_mode_flow_smoke.js','work/skill-flow-batch-contract.json',
  'tools/skill_mode_flow_warmup.py','tools/test_skill_mode_flow_warmup.py','tools/_skill_mode_warmup_smoke.js',
  'tools/skill_mode_toggle.py','tools/test_skill_mode_toggle.py','tools/_skill_mode_toggle_smoke.js',
  'web/src/simulation/ability-flow.js','web/src/simulation/skill-toggle.js','work/client-logic/native-toggle-skill/evidence.json','work/client-logic/native-block-target-limit/contract.json']){
  readText(p);skillModeBasis[p]=hashes[p];
 }
 const clientProgramNewIds=live.clientProgramSkills.filter(id=>!live.clientStatSkills.includes(id));
 const clientProgramBasis=Object.fromEntries(['tools/build_client_programs.py','web/src/simulation/client-programs.js','web/src/simulation/attributes.js','web/src/simulation/operator-combat.js','web/engine.js','web/mode/rules.js','web/mode/ui.js','tools/_client_programs_smoke.js'].map(p=>{readText(p);return [p,hashes[p]];}));
 const clientStatNewIds=['skchr_astesi_1','skchr_glassb_1','skchr_hsguma_1','skchr_ifrit_1','skchr_lisa_1','skchr_shining_1','skchr_vigna_1','skchr_vigna_2','skchr_gyuki_2'];
 const clientStatBasis=Object.fromEntries(['tools/build_client_stat_buffs.py','tools/test_client_stat_buffs.py','web/client_stat_buff_data.js','web/src/simulation/client-stat-buffs.js','web/src/simulation/operator-combat.js','web/src/simulation/elemental-operators.js','web/engine.js','web/mode/rules.js','web/mode/ui.js','tools/_client_stat_buff_smoke.js'].map(p=>{readText(p);return [p,hashes[p]];}));
 const seasonRosters=Object.fromEntries(Object.entries(live.seasonRosters).map(([sid,rows])=>[sid,new Map(rows.map(o=>[o.id,o]))]));
 const roster=new Map(Object.values(live.seasonRosters).flat().map(o=>[o.id,o])),library=new Map(live.operators.map(o=>[o.id,o]));
 const slots=[],fixed=new Set(),modeIds=new Set(roster.keys());
 for(const [sid,s]of Object.entries(seasons))for(const e of Object.values(s.charShopChessDatas)){
  slots.push({season:sid,...e});for(const id of [e.charId,e.backupCharId])if(id)modeIds.add(id);
  if(e.charId&&!e.isHidden&&['PRESET','NORMAL'].includes(e.chessType))fixed.add(e.charId);
 }
 const sourcePointer=(id,field)=>gd+'excel/character_table.json#'+id+(field?'.'+field:'');
 const shapeNotes={mystic:'标准储存与齐射已接，深靛固定养成另有逐项验收；其他秘术师天赋/技能仍缺，Veen的9份合并能量明确排除通用实现',hunter:'源4/6/8弹仓、装填与普攻耗弹已接，雪猎固定养成另有逐项验收；其他猎手技能和精确动作时序仍待核对',funnel:'基础浮游倍率已有；卡达放飞、澄闪多单元/PRD自爆、洛洛过载已接限定主体，精确飞出/返回时序及模组仍待核',tactician:'狼群、磐蟹与流形分别接入，伺夜/缪尔赛思固定配置另有限定子项；手动战术点/复制窗口及夜半眠兽已接；七名分别有有限验证面；渡桥/隐秘队/可露希尔资料库主机制已接，精确物理与全组合仍待核',dollkeeper:'风丸/归溟幽灵鲨/贝娜/维荻已接标准替身；前两者固定养成另有子项，后两者仅源样例验证。双月/Mortis非标准形态和精确转场时序未接',merchant:'周期费用、无法支付与撤退待核查',bard:'基础持续回血已有；鼓舞/召唤物/生命重分配逐人核查',chain:'通用跳跃已有；跳距/衰减和模组边界需验证',bombarder:'溅射/余震已有；逐段伤害与几何/时间近似需对照',counsellor:'基础分支与技能独立弹道仍待核查'};
 const knownSkillGaps={skchr_silent_2:'一次性医疗装置、库存阻回、手动付费部署和半秒群疗已接；首末跳帧相位、主人再部署/跨轮库存另核；医疗职业攻速光环及模组升级已接限定子项，地面治疗特性另核',skchr_dusk_3:'小自在独立属性、主落点生成/刷新、源持续与退场已有主体；原版前后摇/跨副本刷新、Y和ISW模组及完整特质联动另核',skchr_beewax_2:'尖碑源实体、3阻挡、禁疗及技能结束退场已接；落点均匀随机、出场使用本体攻击与即时命中为当前解释，原版落点优先级及精确伤害时序仍待核',skchr_svash2_3:'仅修正范围选择边界；丹增碰撞弹、朝前发射、协同攻击与费用交换未接',skchr_lisa_3:'范围治疗/停顿已有；天赋脆弱仍缺，不能以此技能处理器代替天赋验证',skchr_aglina_3:'攻击与目标数已有；失重未接',skchr_rockr_2:'原版模式为单浮游且无自爆；两阶段攻速/过载攻击与倍率上限/实际过载时长眩晕已接限定主体，精确飞行/收回时序、模组和完整联动另核'};
 for(const id of ['skchr_gdglow_1','skchr_gdglow_2','skchr_gdglow_3'])knownSkillGaps[id]='源模式2/2/3单元、独立锁敌/叠层、天赋PRD自爆与法抗穿透已接限定主体；精确飞行/返回、跨技能PRD key生命周期、模组和完整联动另核';
 for(const id of ['skchr_shotst_1','skchr_shotst_2'])knownSkillGaps[id]='伤害/目标上限/百分比减防及到期已接；首次命中减防先后和跨技能叠加仍按当前执行约定，未获直接时序证据，保持未验收';
 for(const id of live.nextAttackSkills)knownSkillGaps[id]=(nextAttacks.profiles[id].kind==='next-heal'?'源下一次治疗、血量门槛、目标选择、充能与友方投递主体已接':'完整结构筛选后的源下一击倍率、目标预算、段数和充能主体已接')+'；精确前摇、施法中目标重选、失效目标返SP、原生弹体表现及完整天赋/模组联动另核，不勾完整技能';
 for(const id of live.directSkills)knownSkillGaps[id]='完整源配置的直接施放、目标选择和伤害/治疗主体已接；源黑板、次数、随施放Buff按提供者合同消费；原生逐帧时序、中断退款及完整天赋模组组合另核，不勾完整技能';
 for(const id of live.skillModeSkills)knownSkillGaps[id]=(skillModes.profiles[id].activation==='deploy'?'源部署触发、持续属性/模式与完整附加主体已接；无SP支出，部署两相与首周期是明确的仿真映射':skillModes.profiles[id].action==='none'?'源引导期间停止普攻、自身Buff/回复及结束恢复已接':'完整源模式的攻击/治疗切换、目标规则、倍率/段数和自身Buff已接')+'，共用模式程序执行；原生前后摇、分段帧距、完整弹体及天赋/模组联动另核'+(skillModes.profiles[id].action==='heal'?'；当前沿既有即时治疗时点，源治疗弹道未还原':'')+'，不勾完整技能';
 for(const id of live.skillModeSkills)if(skillModes.profiles[id].capability==='finite-ammo')knownSkillGaps[id]='有限弹药、出手扣量、源选敌与仇恨层、耗尽清理主体已接；精确原生进度源/事件帧和完整天赋模组组合另核，不勾完整技能';
 knownSkillGaps.skchr_yak_1='源生命上限和每秒固定回复已接公共属性程序，跨到期帧按有效时长回血，结束/死亡清理并恢复生命比例；精确原生事件帧、完整天赋/模组和回复修正组合另核，不勾完整技能';
 knownSkillGaps.skchr_texas_2=live.directSkills.includes('skchr_texas_2')?'源回费、范围全选、分轮发射与寿命末尾伤害/眩晕已接；持续施放锁动作和SP，已发投递与未发波次分别清理；ALL全选有源描述交叉推断，精确动画相位与完整天赋模组仍未核':'回费、源13格范围、两段法伤/对空和眩晕已有旧处理；精确原生时序未核';
 for(const id of ['skchr_finlpp_1','skchr_finlpp_2'])knownSkillGaps[id]='源倍率、群体瞬间治疗/随机快速治疗已接；疗养师远距离衰减几何仍沿用已注明的距离近似，完整技能保持待核，明确主体另列子项';
 for(const id of ['skchr_ccheal_1','skchr_ccheal_2','skchr_bldsk_2'])knownSkillGaps[id]='逐等级持续治疗/失血增益主体已接；原版同名复制体叠加、首末跳帧相位、嘉维尔模组/半血检查时点和完整禁疗/孤立来源另核，仅主体子项可验收';
 for(const id of ['skchr_papyrs_1','skchr_papyrs_2','skchr_reckpr_2'])knownSkillGaps[id]='逐等级屏障/锁定链疗/实际受伤回复主体已接；链跃几何、屏障强弱覆盖、跨副本回复叠加、致命伤例外与精确时序未全核，仅主体子项可验收';
 const knownToken={token_10022_kazema_shadow:'源实体/阶段属性、S2增益、出现伤害、主动撤退消耗和结束回收已接；合法落点按敌占格优先再随机，原版嘲讽排序和精确动作时序未复刻',token_10012_rosmon_shield:'有专用实体与测试；合法落点、阻挡、减防、主人退场已接，位置优先级与时序仍为近似'};
 knownToken.token_10000_silent_healrb='源阶段属性、九格群疗、0阻挡/装置不可选、10秒销毁/手动撤退、主人离场保留及两玩家鉴权部署已接；库存跨轮/主人再部署和精确时序另核';
 knownSkillGaps.skchr_snhunt_2='两发特殊弹及逐发移动/等待/阻挡/控制判定已接；特殊入场、复活、失衡、传送与装置类敌人的完整动作分类仍缺，整技能保持未验收';
 const records=[];
 for(const id of sorted([...library.keys(),...modeIds])){
  const c=chars[id];if(!c)throw Error('Missing source character '+id);
  const ownSlots=slots.filter(s=>s.charId===id),backupSlots=slots.filter(s=>s.backupCharId===id&&s.charId!==id);
  const sk=(c.skills||[]).filter(s=>s.skillId).map((s,index)=>{
   const raw=skillSource[s.skillId],current=(choices[id]||[]).find(v=>v.skillId===s.skillId);
   if(!raw)throw Error('Missing source skill '+id+'/'+s.skillId);
   const common=live.commonSkills.includes(s.skillId);
   const specific=live.directSkills.includes(s.skillId)||live.skillModeSkills.includes(s.skillId)||live.clientProgramSkills.includes(s.skillId)||live.clientStatSkills.includes(s.skillId)||live.attackSkills.includes(s.skillId)||live.medicSkills.includes(s.skillId)||live.elementSkills.includes(s.skillId)||live.mysticSkills.includes(s.skillId)||live.dollSkills.includes(s.skillId)||live.tacticalSkills.includes(s.skillId)||common;
   return {id:s.skillId,index:index+1,name:raw.levels.at(-1).name,source:gd+'excel/skill_table.json#'+s.skillId,
    imported:!!current?.normal&&!!current?.elite,explicitHandler:specific,commonHandler:common,legacyEffects:unique((current?.normal?.effects||[]).map(e=>e.type)),
    sourceDescription:raw.levels.at(-1).description,description:current?.normal?.desc||raw.levels.at(-1).description,
    blackboard:raw.levels.at(-1).blackboard,sourceLevelCount:raw.levels.length,importedLevelCount:live.skillLevelCounts[s.skillId]||0,current:current?{normal:current.normal,elite:current.elite}:null,
    codeRefs:live.directSkills.includes(s.skillId)?['web/direct_skill_data.js','web/src/simulation/direct-skill-actions.js',...refs(codeFiles,s.skillId)]:live.skillModeSkills.includes(s.skillId)?['web/skill_mode_data.js','web/src/simulation/skill-modes.js','web/src/simulation/client-programs.js',...refs(codeFiles,s.skillId)]:live.nextAttackSkills.includes(s.skillId)?['web/next_attack_skill_data.js','web/src/simulation/operator-combat.js',...refs(codeFiles,s.skillId)]:refs(codeFiles,s.skillId),testRefs:testRefs(s.skillId),knownGap:knownSkillGaps[s.skillId]||null};
  });
  const ts=(c.talents||[]).map((t,i)=>{
   const candidates=t.candidates||[],zero=candidates.filter(t=>(t.requiredPotentialRank||0)===0),sample=zero.at(-1)||candidates.at(-1)||{};
   const exported=talents[id]?.[i]||[];
   const explicit=!!f.run(`ArkOperatorCombat.handledTalent(${JSON.stringify(sample)},${JSON.stringify(id)})||ArkElementOperators.handledTalent(${JSON.stringify(sample)},${JSON.stringify(id)})||ArkHunter.handledTalent(${JSON.stringify(sample)},${JSON.stringify(id)})||ArkMystic.handledTalent(${JSON.stringify(sample)},${JSON.stringify(id)})||ArkDollkeeper.handledTalent(${JSON.stringify(sample)},${JSON.stringify(id)})||ArkTactician.handledTalent(${JSON.stringify(sample)},${JSON.stringify(id)})||ArkMedicSkills.handledTalent(${JSON.stringify(sample)},${JSON.stringify(id)})`);
   return {index:i+1,names:unique(candidates.map(t=>t.name).filter(Boolean)),description:sample.description,sourceCandidates:candidates,
    imported:candidates.every(t=>exported.some(e=>(e.name||'')===(t.name||'')&&e.phase===Number(t.unlockCondition.phase.slice(-1))&&e.level===t.unlockCondition.level&&e.potential===t.requiredPotentialRank)),
    explicitFilter:explicit,legacyEffects:unique(exported.flatMap(e=>(e.effects||[]).map(x=>x.type))),source:sourcePointer(id,'talents['+i+']')};
  });
  const tokenIds=sorted([...Object.keys(c.displayTokenDict||{}),...(c.skills||[]).map(s=>s.overrideTokenKey).filter(Boolean)]);
  const tokens=tokenIds.map(tid=>({id:tid,name:chars[tid]?.name||tid,sourceExists:!!chars[tid],position:chars[tid]?.position,profession:chars[tid]?.profession,
   source:sourcePointer(tid,''),sourceSkills:(chars[tid]?.skills||[]).map(s=>s.skillId).filter(Boolean),sourceTalentCount:chars[tid]?.talents?.length||0,
   codeRefs:refs(codeFiles,tid),known:knownToken[tid]||null}));
  const traits=[];
  for(const s of ownSlots)for(const [kind,cid]of [['普通',s.chessId],['精锐',s.goldenChessId]]){
   const original=seasons[s.season].charChessDataDict[cid];
   for(const gid of original?.garrisonIds||[]){const entry=garrison.seasons[s.season]?.traits?.[gid];traits.push({season:s.season,variant:kind,chessId:cid,id:gid,imported:!!entry,entry,source:'activity.AUTOCHESS_SEASON.'+s.season+'.garrisonDataDict.'+gid});}
  }
  records.push({id,name:c.name,scope:modeIds.has(id)?'mode':'library',fixed:fixed.has(id),currentRoster:roster.get(id)||null,currentSeasons:Object.fromEntries(Object.entries(seasonRosters).filter(([,rows])=>rows.has(id)).map(([sid,rows])=>[sid,rows.get(id)])),
   library:library.has(id),position:c.position,profession:c.profession,branch:c.subProfessionId,source:sourcePointer(id,''),ownSlots,backupSlots,
   sourceDescription:c.description,profile:live.profiles[id]||null,levelData:!!levelData[id],rangeData:!!ranges[id],skills:sk,talents:ts,tokens,traits,
   module:modules[id]||null,codeRefs:refs(codeFiles,id),testRefs:testRefs(id)});
 }
 function operatorDoc(list,scope){
  const lines=['# '+(scope==='mode'?'卫戍协议干员逐项清单':'其他资料库干员逐项清单'),'',link('README.md','返回总表')+' · 源名单与两季固定名册自动对照；下方行为勾选需要人工验证记录。', '',
   scope==='mode'?'包含两季固定名单、隐藏/替补以及当前额外角色。身份可能跨多个赛季或槽位，不能因一个 charId 存在而宣称槽位已还原。':'这些干员有本地资料，但不在两季源槽位、替补或当前运行名册中。单列保留每个技能/天赋的缺口，不自动加入卫戍商店；优先完成卫戍主表。', '',
   '文案只是核查对象。技能优先显示现有普通变体文案；未导出时显示源最高等级模板。天赋显示最高阶段、未提升潜能的候选预览；实际普通/精锐/本机练度必须分别选候选。处理器或旧分类器的存在均不等于完整实现。', '',
   '检索干员姓名或 `charId`；“测试线索”仅说明测试文件引用了身份，必须阅读相应断言，不能据此勾选整人完成。', '',
   '新增执行机制沿'+link('../research/client-logic-pipeline.md','客户端组件/动作模板/原生方法')+'归并适用ID并批量验证；逐人表保存范围和结果，不要求对同一实现重复手工看技能。带日期的记录保留当时边界，旧“下一批”不作为现行计划。', '', '| 干员 | 源季阶数 / 范围 | 当前名册 | 技能资料 | 专用技能处理器线索 |', '|---|---|---|---|---|'];
  for(const r of list)lines.push('| '+link('#'+r.id,r.name)+' | '+(r.ownSlots.map(s=>seasonName[s.season]+' '+roman[s.chessLevel]+(s.isHidden?' 隐藏':'')).join('；')||'替补/额外/资料')+' | '+(Object.entries(seasonRosters).filter(([,rows])=>rows.has(r.id)).map(([sid,rows])=>seasonName[sid]+' '+roman[rows.get(r.id).tier]).join('；')||'无')+' | '+r.skills.filter(s=>s.imported).length+'/'+r.skills.length+' | '+r.skills.filter(s=>s.explicitHandler).length+'（不是完成数） |');
  for(const r of list){
   const id=r.id,group='operator',basis={source:chars[id],profile:r.profile,...(r.id==='char_4211_snhunt'?{hunter:hunterBasis}:{}),...(r.branch==='mystic'?{mystic:mysticBasis}:{}),...(r.branch==='dollkeeper'?{doll:dollBasis}:{})};
   lines.push('', '<a id="'+id+'"></a>', '## '+r.name+' · '+code(id), '',
    '来源：'+code(r.source)+'；'+r.profession+' / '+r.branch+' / 原生 '+r.position+'。'+(r.backupSlots.length?'另作 '+r.backupSlots.length+' 个源槽位的替补。':''));
   lines.push('',fact(r.library&&r.levelData&&r.rangeData,'身份/阶段属性/范围目录：资料库 '+(r.library?'有':'缺')+'，阶段属性 '+(r.levelData?'有':'缺')+'，范围目录 '+(r.rangeData?'有':'缺')+'。这不是数值一致性验收。'));
   if(r.scope==='mode')lines.push(task('op/'+id+'/roster','**名册**：按各赛季槽位确认招募资格、阶数、替补与模板。当前'+(r.currentRoster?'已出现：'+Object.entries(r.currentSeasons).map(([sid,e])=>seasonName[sid]+' '+roman[e.tier]).join('；'):'未进入普通招募名册')+'；源槽位见'+link('mode-slot-checklist.md','逐槽表')+'。',[r.ownSlots,r.backupSlots,r.currentSeasons],group));
   for(const s of r.ownSlots.filter(s=>!s.isHidden&&!s.tmplId&&['PRESET','NORMAL'].includes(s.chessType)))lines.push(task('op/'+id+'/fixed/'+s.season+'/'+s.chessId,
    '**固定招募与配置 · '+seasonName[s.season]+'** '+code(s.chessId)+'：源身份、阶数、盟约、默认技能、普通/精锐养成、模组属性；实际商店抽取/购买/禁用与跨赛季恢复。此子项不包括技能/天赋执行、隐藏槽和DIY替补选择。',
    [s,r.currentSeasons[s.season],seasons[s.season].charChessDataDict[s.chessId],seasons[s.season].charChessDataDict[s.goldenChessId],modules.bySeason?.[s.season]?.[s.chessId],fixedCode],group));
   lines.push(fact(!!r.profile,'基础特性配置 '+(r.profile?'已有 '+r.profile.action+' / '+(r.profile.kind||'single'):'未导出')+'。'),
    task('op/'+id+'/basic','**基本特性/普攻**：'+short(r.sourceDescription)+'；'+(shapeNotes[r.branch]||'逐项核对目标、范围边界、伤害/治疗类型、阻挡及攻击间隔')+'。',basis,group));
   if(!r.talents.length)lines.push('','天赋：源表没有天赋组，本项不适用。','');
   else{
    lines.push(fact(r.talents.every(t=>t.imported),'天赋阶段/等级/潜能候选：'+r.talents.filter(t=>t.imported).length+'/'+r.talents.length+' 组存在对应导出。'));
    for(const t of r.talents){
     const hidden=!t.names.length,keys=unique(t.sourceCandidates.flatMap(c=>(c.blackboard||[]).map(b=>b.key)));
     lines.push(task('op/'+id+'/talent/'+t.index,'**'+(hidden?'隐藏行为组':'天赋')+' '+t.index+' · '+(t.names.join(' / ')||'源表无公开名称')+'**：'+(short(t.description)||'无公开描述；源 prefab '+unique(t.sourceCandidates.map(c=>c.prefabKey).filter(Boolean)).map(code).join('、')+'；黑板 '+(keys.map(code).join('、')||'空'))+'；现状：'+(t.explicitFilter?'进入专用天赋处理路径，仍需逐条检查覆盖':'旧分类效果 '+(t.legacyEffects.join('、')||'空')+'，条件/对象/触发尚未确认')+'。',[t,basis],group));
     if(t.index===1&&['char_4196_reckpr','char_128_plosis','char_171_bldsk'].includes(id))lines.push(task('op/'+id+'/talent/'+t.index+'/source-body','**技力支援天赋 · 源主体**：'+(id==='char_4196_reckpr'?'真实干员技能开启时自身强制回SP及限时攻速，包含已导出模组天赋升级；重复只刷新、技能锁期间仍回SP':id==='char_128_plosis'?'在场干员全局自然回SP；同天赋多副本取最高，不加速攻回/受回或召唤物，不绕过技能锁':'范围内敌人真正倒下，自身及随机一个其他友方回SP；候选不避开满SP/阻回对象，无队友仍回自身，共用可恢复随机流')+'。范围/部署/死亡/再部署/主机归属恢复；完整孤立来源、跨类技力光环、假被动/吟唱等技能事件、未接模组及帧级时序不在本子项。',[t,basis,medicBasis],group));
    }
   }
   if(['char_4196_reckpr','char_4139_papyrs'].includes(id))lines.push(task('op/'+id+'/module/source-body','**医疗模组 · 1–3级源效果**：'+(id==='char_4196_reckpr'?'低于半血时直接治疗倍率1.15、天赋阶段/潜能攻速升级；生命回复不误乘治疗加成':'链疗每跳倍率0.85，屏障按源潜能/模组倍率和时长强化，不把链疗衰减乘到屏障')+'。真实养成路径逐模块/潜能验证；跨来源治疗倍率/半血检查帧相位、屏障覆盖和精确链距等组合不在本子项。',[basis,medicBasis],group));
   if(['char_128_plosis','char_171_bldsk'].includes(id))lines.push(task('op/'+id+'/module/source-body','**医疗模组 · 1–3级源效果**：'+(id==='char_128_plosis'?'源y-3治疗范围及S2范围还原，范围内自然SP改用0.33/0.35、范围外0.3；同类取最高，不加速攻回/受回/召唤物':'源低于半血直接治疗1.15；按图鉴NORMAL/ELITE/BOSS身份和模组黑板分别给自身与随机队友2/3/4 SP')+'；主机归属和恢复已核。其他SP光环、治疗加成叠加和精确帧相位不在本子项。',[basis,medicBasis],group));
   if(id==='char_108_silent')for(const [key,label]of [
    ['talent/1/source-aura','**强化注射 · 源职业光环主体**：四份阶段/潜能攻速6/8/12/14；全场医疗职业干员，包含咒愈师，排除奶盾/吟游者/召唤物。真实治疗间隔、死亡/未部署/再部署/技能结束及跨玩家恢复；同类副本取最高为当前约定，孤立与其他光环完整组合另核。'],
    ['module/attack-speed','**强化注射模组 · 攻速升级限定子项**：模组1–3级与两档潜能共6变体，命名天赋按源替换为12/14、15/17、17/19，不把光环加两次或常驻折进本体。只核攻速部分；地面治疗15%特性与特殊部署地形判定不在此项。']
   ])lines.push(task('op/'+id+'/'+key,label,[basis,medicBasis],group));
   if(id==='char_344_beewax')for(const [key,label]of [
    ['skill/skchr_beewax_1/source-body','**沙暴扩散 · 1–10级主体**：源SP、初始SP、持续、攻击加成与x-2范围；开技群体法术伤害、对空、结束恢复。资料库10级与盟约II隐藏槽普通/精锐分别核；模组生命变化、天赋加成完整组合与帧级时序另核。'],
    ['talent/1/idle-recovery','**沙原的庇护 · 基础回复主体**：精一2.5%/精二4%最大生命每秒回复，仅未开技能在场时生效，禁直接治疗不阻回复；开技停止、结束/再部署恢复。模组10%/15%最大生命动态变化尚未接。'],
    ['token/token_10011_beewax_oblisk/lifecycle','**沙之碑 · 源实体与退场限定子项**：精一/二四属性端点、3阻挡、0费用/不占位、无普攻/禁疗及禁回复、20秒寿命，技能结束/主人死亡强制退场，手动撤退/击倒不复活；共享归属和签名恢复。落点随机权重、出场伤害归属及精确帧相位不在本子项。']
   ])lines.push(task('op/'+id+'/'+key,label,[basis,beeswaxBasis,levelBasis],group));
   lines.push(fact(r.skills.every(s=>s.imported),'可选技能普通/精锐参数：'+r.skills.filter(s=>s.imported).length+'/'+r.skills.length+'；无技能者不适用。'));
   lines.push(fact(r.skills.every(s=>s.importedLevelCount===s.sourceLevelCount),'逐等级源参数：'+r.skills.reduce((n,s)=>n+s.importedLevelCount,0)+'/'+r.skills.reduce((n,s)=>n+s.sourceLevelCount,0)+' 份；已接账号等级与固定养成取值，执行完成仍以下方逐项验收为准。'));
   for(const s of r.skills){
    if(live.nextAttackSkills.includes(s.id)&&(batchSelection.get(id+'/'+s.id)?.providers.includes('next-attack')||previous.has('op/'+id+'/skill/'+s.id+'/source-next-attack-body'))){
     const binding=nextAttacks.profiles[s.id];
     lines.push(task('op/'+id+'/skill/'+s.id+'/source-next-attack-body','**'+s.name+' · '+(binding.kind==='next-heal'?'下一次治疗':'下一击')+'公共源主体**：完整组件条件筛选、全部等级黑板、倍率/段数、目标预算和源充能类型；'+(binding.kind==='next-heal'?'血量门槛、直接治疗/友方弹体按源图消费，未充能时医疗恢复普通治疗。':binding.spellExtras?'完整并行根、技能期间监听Buff、额外能力别名与治疗选择器闭合；主动作发出仅附加一次治疗，不按命中数重复，不将加伤倍率或暴击乘入治疗。无敌人不消耗充能，无治疗目标不取消主攻击。事件映射与治疗桥接时相为明确模型。':'')+'真实战斗输出及主机恢复按本组记录验收。专属未支持动作拒绝绑定；精确协程帧、失效目标返还、完整天赋/模组与原版表现另核，不勾完整技能。',[s.id,binding,nextAttackBasis,levelBasis],group));
    }
    if(clientProgramNewIds.includes(s.id)){
     const binding=clientPrograms.profiles[s.id],program=clientPrograms.programs[binding.prefabId];
     lines.push(task('op/'+id+'/skill/'+s.id+'/source-body','**'+s.name+' · 公共程序源主体1–10级**：完整源图/全部黑板绑定，自身Buff实例、属性层与生命比例，真实攻击/承伤/面板、独立寿命、结束/死亡/基础重算和双归属鉴权恢复；外部生命链接独立保留。仅源技能主体，未知天赋/模组、精确协程帧、受保护的detach调度及跨版本一致性仍待核。',[s,binding,program,clientProgramBasis,levelBasis],group),'',link('../research/client-program-integration.md','公共程序接入与证据'));
    }
    if(live.directSkills.includes(s.id)){
     const binding=directSkills.profiles[s.id];
     lines.push(task('op/'+id+'/skill/'+s.id+'/source-direct-body','**'+s.name+' · 直接施放源主体**：完整图、全部源等级与目标选择；实际伤害/治疗、施放附加效果、SP/充能和重复施放边界，序列化恢复按本组记录。未知同级动作不放行；精确帧相位、中断退款及完整天赋模组另核，不勾整技能。',[s,binding,directBasis,levelBasis],group),'',link('../mechanics/garrison-skill-batches.md','批量执行合同与边界'));
    }
    if(live.skillModeSkills.includes(s.id)){
     const binding=skillModes.profiles[s.id],program=skillModes.programs[binding.prefabId];
     const aura=binding.capability==='maintained-aura',ammo=binding.capability==='finite-ammo',blockees=binding.capability==='blockee-effects',selfBuffs=binding.capability==='bounded-self-buffs',endEffects=binding.capability==='end-effects';
     const modeBody=binding.capability==='passive-skill'?'常驻完整根属性/模式与有限命中Buff；不创建主动技能状态，不占用SP或施放，死亡/移除撤销常驻属性，已附加有限命中状态独立到期。':binding.capability==='toggle-skill'?'双向切换各扣源SP，开启持续属性/回血及完整近战模式，关闭/死亡撤销自身层并保留外部效果；切换两方向进入共同技能通知。':program.flow?.finalizer?'前摇即附加持续属性及比例回血，准备期眩晕/冻结/沉默免疫；动画结束后进入有阻挡上限的单目标攻击模式，主体结束恢复默认、自身眩晕并清理持续层；死亡取消待执行终态。':binding.capability==='ability-flow'?'完整顺序组按子项完成推进；准备阶段与治疗阶段分别激活Buff和模式，根寿命由全部子项累加。治疗按源动画事件延迟，冻结发出数值并保留动画占用，来源/目标生命周期失效取消待发治疗。':endEffects?'完整源攻击模式和开启武装、结束后自身状态统一执行；有限自身抵抗在结束状态前撤销，概率命中Buff按源等级冻结并每目标判定，0/1端点不消费随机数。结束状态阻止行动/阻挡/施放并进入治疗净化、装备和卫戍通知；死亡取消待执行状态。':selfBuffs?'完整有限父Buff、一次伤害格挡/父终止派生状态/固定及比例穿防/有限周期回费按源图消费；同override的自体状态与外来光环只择优一次，消耗护盾不提前结束独立DEF，恢复后次数/周期不重复。':blockees?'按当前实际阻挡关系消费完整源周期法伤或持续眩晕，保留源攻击模式与属性程序；解除阻挡/结束/死亡按来源撤销并保留外部旧眩晕，周期末尾不重复；敌人前摇中断与结束复攻、来源归属和主机恢复按本组记录核查。':ammo?'源有限弹药控制器及同对象计数器、全部等级数量、选敌和攻击模式完整绑定；空目标保留弹药，主行动发出扣弹并通知卫戍，末发冻结输出，耗尽/结束/死亡撤销Buff及模式。':aura?'源范围/全场、敌我/职业/地空筛选与Buff完整绑定；进入退出、来源撤销、属性/状态抗性实际消费，源模式攻击/双目标治疗或保留基础行动，按源字段延迟直击。':binding.activation==='deploy'?'源AppearSkill按出生/部署两相启动，无SP支出；持续属性、模式、命中状态、衰减护盾/防御、自损及被动项严格依各成员完整源图消费，复活重新启动。':binding.action==='none'?'引导期间停止普攻、自身回复、结束后恢复原行动。':'源模式绑定、属性程序与SP锁定；实际目标选择及攻击/治疗输出，按配置消费目标数、伤害类型/段数和筛选。';
     const modeBoundary=binding.capability==='toggle-skill'?'源两方向扣SP/模式与Buff挂卸已核；切换维持态恢复SP、自动战斗开启后维持为仿真桥接。全源等级、赛季及主机恢复按记录验收，完整天赋模组另核。':['passive-skill','ability-flow'].includes(binding.capability)?'全部源等级、真实赛季配置及主机恢复按本组记录验收；只接完整已支持叶子，未知兄弟行为拒绝。源字段/动画事件与本地帧调度、中断约定分开；完整天赋模组与整技能另核。':endEffects?'源OnTick在能力不再affecting时一次AddBuff已核；本地结束原因映射、同键最长到期和每目标独立随机为模型。全部源等级、真实赛季及结束前/后主机恢复按记录验收；旧专用幽灵鲨不迁移，精确帧相位与完整天赋模组另核。':selfBuffs?'源事件/属性身份与全图字段已核；盾与受伤事件先后、比例后固定穿透、override竞争及精确周期帧为明确模型。全部源等级、实际可达赛季与主机恢复按记录核查，完整天赋模组与整技能另核。':blockees?'checker(0,0,0)映射当前阻挡目标是源字段与中文描述交叉推断；原生阈值/首周期帧、敌受击SP未复现，跨大步按当前帧属性与成员计算。全部源等级和适用赛季按记录验收，完整天赋/模组、原生精确时序及整技能另核，不勾整人。':ammo?'源事件4为ON_SPELL_ON，按单主攻击发出扣一弹是当前语义映射；原生进度源getter与精确帧相位受保护。远程武器筛选优先于飞行，仇恨层进入实际敌方选敌；已有生命周期API清理，不新增手动按钮。赛季配置及主机恢复按记录验收，完整天赋/模组另核，不勾完整技能。':aura?'结束/死亡、来源归属与主机恢复按本组记录验收；独立来源按实例、override竞争胜出/平局和disableOverride并存策略均是模型约定。原生只确定priority数值公式，精确调度/帧相位、完整天赋模组与跨版本一致性未核，不勾完整技能。':'结束/死亡、两玩家归属和鉴权恢复按本组记录验收；原生前后摇、部署首周期和技能开启事件、分段帧距、治疗弹道与完整天赋/模组联动仍未核，不勾完整技能。';
     lines.push(task('op/'+id+'/skill/'+s.id+'/source-mode-body','**'+s.name+' · '+(binding.capability==='toggle-skill'?'切换模式公共':binding.capability==='passive-skill'?'常驻被动公共':binding.capability==='ability-flow'?'顺序控制公共':endEffects?'结束状态公共':selfBuffs?'有限自身Buff公共':blockees?'阻挡目标公共':ammo?'有限弹药':aura?'持续光环':binding.activation==='deploy'?'部署公共':'技能模式')+'源主体全部等级**：'+modeBody+modeBoundary,[s,binding,program,skillModeBasis,levelBasis],group),'',link('../mechanics/garrison-skill-batches.md','公共执行与证据边界'));
    }
    if(s.id==='skchr_svrash_3'){
     const finalDefenseBasis=Object.fromEntries(['web/src/simulation/attributes.js','web/engine.js','web/src/simulation/operator-combat.js','web/src/simulation/elemental-operators.js','web/mode/ui.js','tools/_final_defense_smoke.js','tools/inspect_attack_contracts.py'].map(p=>{readText(p);return [p,hashes[p]];}));
     lines.push(task('op/'+id+'/skill/'+s.id+'/final-defense','**真银斩 · 最终防御乘算子项**：十级源DEF最终因子在既有普通增益和元素平减之后生效；实际承伤、Boss选敌、防御链接和面板共用查询，零因子/平加/基础重算/结束及两玩家鉴权恢复。仅本乘区传播；完整技能攻击、天赋/模组、其他减益类别和帧级顺序未纳入。',[s,basis,finalDefenseBasis],group));
    }
    const status=s.knownGap||(live.clientProgramSkills.includes(s.id)?'公共客户端程序已按完整源图与黑板绑定；已核属性主体和生命周期，完整天赋/模组及原版帧相位另核':!s.imported?'源表已有，尚无可选技能导出':s.commonHandler?'公共技能精确ID白名单已接，固定养成与生命周期验收以本项记录为准；其他技能、天赋与资料库/替补入口不能据此算完成':s.explicitHandler?'已有按技能 ID 的专用处理器，部分时序/目标/联动仍需验收':'旧路径：'+(s.legacyEffects.join('、')||'没有分类效果')+'；仅代表分类结果，可能漏做或误做');
    lines.push(task('op/'+id+'/skill/'+s.id,'**S'+s.index+' · '+s.name+'** '+code(s.id)+'：'+short(s.description)+'；现状：'+status+'。',live.medicSkills.includes(s.id)?[s,basis,medicBasis,levelBasis]:vanguardIds.includes(s.id)?[s,basis,vanguardBasis,levelBasis]:s.commonHandler?[s,basis,costBasis,levelBasis]:[s,basis,levelBasis],group));
    if(clientStatNewIds.includes(s.id))lines.push(task('op/'+id+'/skill/'+s.id+'/source-body','**'+s.name+' · 原图属性主体1–10级**：精确prefab绑定、源SP/持续/全部黑板，真实伤害或治疗、攻防增益/攻击间隔、施放锁定、结束/死亡清理及两玩家鉴权恢复；基础攻击间隔加法在静态与动态攻速前应用，基础重算后不残留。'+(s.id.startsWith('skchr_vigna_')?'模式切换限定所有模式均匹配已核单目标物理近战图、角色身份和原生证据；其他模式/角色不能复用。':s.id==='skchr_gyuki_2'?'源DEF FINAL_SCALER字面0在普通/最终平加后归零；实际承伤、Boss/防御链接选敌与面板/结束恢复，基础重算不破坏。':'')+'天赋/模组完整组合、跨版本一致与原版动作帧相位不在此子项。',[s,basis,clientStatBasis,levelBasis],group), '',link('../mechanics/client-stat-buffs.md','严格原图与Web执行范围'));
    if(['skchr_finlpp_1','skchr_finlpp_2'].includes(s.id))lines.push(task('op/'+id+'/skill/'+s.id+'/source-body','**清流S'+s.index+' · 1–10级主体**：源SP/倍率，'+(s.id==='skchr_finlpp_1'?'范围内所有可直接治疗单位瞬间回复；不额外消耗普通治疗计时':'随机选择受伤目标，间隔乘源0.12，技能期间锁SP，到期/死亡恢复')+'；远距离特性衰减边界和模组不在此项。',[s,basis,medicBasis,levelBasis],group));
    if(['skchr_ccheal_1','skchr_ccheal_2','skchr_bldsk_2'].includes(s.id))lines.push(task('op/'+id+'/skill/'+s.id+'/source-body','**'+s.name+' · 1–10级主体**：源SP/充能/定时参数，'+(s.id==='skchr_bldsk_2'?'自身与范围内随机一名友方加攻、最大HP比例失血；无队友仍能释放，失血不消费伤害盾或触发受击SP':'施加时缓存攻击、逐秒治疗；S1消费普通治疗充能而不触发技能开启，S2覆盖范围内可治疗友方')+'；跨玩家状态/退场清理/鉴权恢复。当前同源刷新、跨副本叠加和首末跳为仿真约定，模组、完整状态来源与原版帧相位不在此项。',[s,basis,medicBasis,levelBasis],group));
    if(['skchr_papyrs_1','skchr_papyrs_2','skchr_reckpr_2'].includes(s.id))lines.push(task('op/'+id+'/skill/'+s.id+'/source-body','**'+s.name+' · 1–10级主体**：源SP/充能/持续，'+(s.id==='skchr_papyrs_1'?'强化下一次链疗与博览古卷屏障，真实抵消伤害':s.id==='skchr_papyrs_2'?'锁定范围内最高生命上限友方，加攻/减治疗间隔/增加跳跃，目标退场立即结束':'治疗后附加限时实际受伤回复，完全抵消不触发，施加者退场后继续')+'；实际赛季普通/精锐、两玩家归属与鉴权恢复。链跃距离、屏障覆盖优先级、多副本回复叠加、致命伤时序例外与完整模组联动不在本子项。',[s,basis,medicBasis,levelBasis],group));
    if(s.id==='skchr_texas_2')lines.push(task('op/'+id+'/skill/'+s.id+'/source-body','**剑雨 1–10级主体**：无敌人可回费，源13格内逐段法伤、对空/免眩晕、边界/睡眠排除、正常攻击范围不变；两段先分别结算，原版段间帧距与前后摇不在此子项。',[s,basis,vanguardBasis,levelBasis],group));
    if(s.id==='skchr_silent_2')lines.push(task('op/'+id+'/skill/'+s.id+'/source-body','**医疗无人机 · 1–10级主体**：精确SP和库存上限1、满库存阻回、候选区拖放确认、5部署费用/5秒部署冷却，不占干员名额。两季普通/精锐与两玩家鉴权恢复；原版跨轮/主人再部署库存、技能结束特殊事件和模组光环另核。',[s,basis,medicBasis,levelBasis],group));
   }
   if(r.tokens.length)for(const t of r.tokens)lines.push(task('op/'+id+'/token/'+t.id,'**召唤物 · '+t.name+'** '+code(t.id)+'：源实体'+(t.sourceExists?'存在，原生 '+t.position:'缺失')+'；'+(t.known||'未完成专属生命周期核验；不能用通用召唤实体代替')+'。核对生成条件、上限、属性/技能、阻挡、受击、回收、主人死亡和共享归属。',[t,chars[t.id],basis],group));
   else lines.push('','召唤物：本体 `displayTokenDict` / 技能 `overrideTokenKey` 未声明；隐藏实体或技能文案提及的机关仍须在对应技能中核查，不能据此证明没有召唤。','');
   if(id==='char_108_silent')lines.push(task('op/'+id+'/token/token_10000_silent_healrb/source-body','**医疗探机 · 一次性装置主体**：源四份阶段关键帧、全部位/九格治疗、0阻挡/不可被常规攻击治疗选中；每0.5秒治疗、10秒销毁，手动撤退消耗，赫默离场仍保留，不套战术家复活。跨玩家治疗和保存恢复；首末跳帧相位、可作用装置的特殊能力与全部光环另核。',[basis,medicBasis],group));
   if(r.traits.length){
    lines.push(fact(r.traits.every(t=>t.imported),'卫戍专属特质：'+r.traits.filter(t=>t.imported).length+'/'+r.traits.length+' 个“赛季×槽位×普通/精锐”关联已导出。'));
    for(const t of r.traits){const e=t.entry;const hint=!e?'缺导出':e.kind==='NONE'?'无通用执行 kind，需个体机制':e.bb?.pool==='pool_equip_rockr'?'定制品池未找到':e.desc?.includes('定制品')?'定制品池内容待获取':'事件 '+e.eventType+' / '+e.kind+'，逐条核对实际分派和上游触发';
     lines.push(task('op/'+id+'/garrison/'+t.season+'/'+t.chessId+'/'+t.id,'**特质 · '+seasonName[t.season]+' '+t.variant+'** '+code(t.id)+'：'+short(e?.desc||'源存在，导出缺失')+'；'+hint+'。',[t,hashes['web/mode/garrison.js']],group));
    }
   }else lines.push('','卫戍特质：当前源槽位未关联；作为替补/DIY/额外角色时需通过槽位规则核查，不自行生成特质。','');
   lines.push(task('op/'+id+'/module','**模组/养成联动**：当前默认 '+(r.module?code(r.module.uniEquipId)+' '+r.module.name:'无导出默认模组')+'；逐季默认模组、等级、特性/天赋替换与技能选择一致，属性存在不能代替机制。',[r.module,r.ownSlots,basis],group),
    task('op/'+id+'/validation','**整体验证**：普通/精锐、所有可选技能、死亡/再部署、两装备、盟约/特质、单机与双玩家归属、保存恢复和 RNG；附明确测试/原版对照记录。',basis,group));
   if(['char_499_kaitou','char_4081_warmy','char_4102_threye'].includes(id)){
    lines.push('','元素接入限定子项（资料库调试入口，不扩充固定商店，不含模组/全部组合或精确弹道时序）：');
    for(const sk of r.skills.filter(s=>s.id!=='skchr_warmy_2'))lines.push(task('op/'+id+'/skill/'+sk.id+'/element-source-levels',
     '**S'+sk.index+' 技能1–10级**：真实资料库练度与源SP/持续/黑板，实际普攻命中后的损伤积累、已有爆发附伤、目标数和技能结束；凛视S1按源充能次数，不在无目标时扣SP。', [elementBasis,sk],group));
    lines.push(task('op/'+id+'/talent/element-source-scope',id==='char_499_kaitou'?'**预先告知条件**：精二1级潜能1源样例，范围内存在凋亡爆发目标时增加攻击，离开/死亡/冷却结束立即失效，和技能攻击加成加算。':id==='char_4081_warmy'?'**难免会溢锅触发**：精二1级潜能1源样例，范围内任意来源灼燃爆发追加源攻击倍率元素伤害；爆发免疫期不重复、范围外不触发。':'**揭示者模式隔离**：该天赋只在探索者的银凇止境生效，卫戍协议中未开技能的普攻不凭此附带凋亡损伤。', [elementBasis,r.talents],group));
    lines.push('',link('../mechanics/elemental-damage.md','元素系统：本批范围、伤害依据与剩余来源'));
   }
   if(id==='char_2015_dusk'){
    lines.push('', '夕的限定主体子项（实际技能、归属和源参数；完整帧时序/跨副本刷新、Y与ISW模组另核）：');
    for(const [key,label]of [
     ['skill/skchr_dusk_1/source-body','**S1 工笔入化 · 1–10级主体**：源SP/充能/倍率，首次攻击点睛联动，1.7溅射与对空；无目标保留技能，命中后范围不残留。'],
     ['skill/skchr_dusk_2/source-body','**S2 泼墨淋漓 · 1–10级主体**：源SP/持续/攻击/攻速/范围，全范围法术攻击与低于半血增伤；首次群攻只触发一次基础点睛，结束恢复范围与增益。'],
     ['skill/skchr_dusk_3/source-body','**S3 写意胜形 · 1–10级主体**：源SP/持续/攻击/3-15范围；间隔乘1.4，优先未阻挡敌人、1.7溅射，主攻击落点生成或同主人刷新小自在，回复满生命并重置25秒。弹速/前后摇仍沿用公共近似。'],
     ['talent/1/source-stacks','**化境 · 基础阶段/潜能主体**：四份源叠层上限10/13/15/18，每次击杀加2%；精二纳入本人的小自在，敌人复活/他人击杀不误计，离场归零，和技能加攻分开累加。'],
     ['talent/2/source-first-attack','**点睛 · 基础首次攻击主体**：精二首次主攻击生成，空中目标下方合法地面也按落点判定；地形/占位不合法仍消耗本次机会，伤害前召唤，退场后重新获得一次机会；旧部署弹道不会重生召唤物。'],
     ['token/token_10015_dusk_drgn/source-body','**小自在 · 源实体主体**：独立源HP1997/ATK398/DEF302/RES50、1.9秒单体法术、十字五格、2地面阻挡/不对空、禁直接治疗但可生命回复；0费用/不占干员名额、25秒或主人退场消失，技能结束保留，撤退/击倒不原地复活。'],
     ['module/x-source-body','**无题长卷 · 1–3级主体**：源3-1基础范围与技能结束恢复；叠层上限15/18、20/23、21/24共6个模组/潜能变体，替换旧天赋且不常驻多加攻击。Y与ISW模组不包含在内。']
    ])lines.push(task('op/'+id+'/'+key,label,[duskBasis,r.skills,r.talents,r.module,r.ownSlots],group));
   }
   if(['char_377_gdglow','char_4040_rockr'].includes(id)){
    lines.push('', '浮游限定子项（JP 36.7.22静态原生分支与当前CN数值对应；未证明运行时无XLua替换。无模组，精确飞行/返回、跨技能PRD key生命周期及完整盟约/装备组合另核）：');
    const scoped=id==='char_377_gdglow'?[
     ['skill/skchr_gdglow_1/client-body','**S1 火花四溅 · 1–10级主体**：源攻击/攻速、两个独立浮游单元，持续锁定范围外旧目标、独立命中叠层；本体普攻不重复附带基础浮游伤害。'],
     ['skill/skchr_gdglow_2/client-body','**S2 电流翻涌 · 1–10级主体**：源攻击/扩大范围、无限持续、两个独立浮游单元；失去目标后按扩大范围重新索敌，锁敌和命中叠层独立。'],
     ['skill/skchr_gdglow_3/client-body','**S3 澄净闪耀 · 1–10级主体**：本体停止攻击，三个独立单元全战场索敌；初始索敌排除隐匿目标，普通浮游命中停顿0.5秒，技能结束清理。原版仇恨排序不在本子项。'],
     ['talent/1/client-prd','**信标的愤怒 · 技能期间放飞单元PRD/自爆主体**：四份无模组阶段/潜能候选；每放飞浮游ability失败次数加一乘源0.015，第40次保底不抽随机，成功清零并替代普通命中；源1.1半径、约0.32秒爆炸，对空且可波及隐匿邻敌。未开技能的基础浮游不自爆；跨部署/技能切换PRD key生命周期另核。'],
     ['talent/2/source-penetration','**精准导流 · 基础法抗穿透**：两份无模组潜能候选15/18，本体/浮游/自爆法伤统一扣除目标法抗且下限为0；不作用于物理伤害。']
    ]:[
     ['skill/skchr_rockr_2/client-overload','**S2 自负此轭 · 1–10级过载主体**：一个浮游单元、全程源攻速；第20秒过载才增加攻击、提高倍率与向上取整层数上限，结束眩晕等于实际过载时间。真实update跨半程/结束及签名恢复；手动结束UI另核。'],
     ['talent/1/source-stacks','**立于磐石 · 基础定时叠层**：四份无模组阶段/潜能候选，部署后每源15秒增加攻击至源上限；死亡/再部署重新计时，不预先折成常驻攻击。']
    ];
    for(const [key,label]of scoped)lines.push(task('op/'+id+'/'+key,label,[funnelBasis,levelBasis,chars[id],r.skills,r.talents,r.profile],group));
    lines.push('',link('../mechanics/funnel.md','浮游：客户端方法、源文件指纹、验证和剩余边界'));
   }
   if(id==='char_4211_snhunt'){
    lines.push('', '固定养成的可独立验收子项（两季普通/精锐；不代替上方全等级、个体联动与整体验证）：');
    for(const [key,label]of [
     ['basic/hunter-fixed','**猎手弹仓与装填**：真实固定配置8发，源阶段4/6/8；普攻120%且每次耗1发，无目标/空仓装填，基础1.6秒不受攻速与间隔增益影响，满仓、受控中断、死亡与再部署。'],
     ['skill/skchr_snhunt_1/fixed','**S1 固定技能4/7**：源SP与倍率，下次普攻消耗一发，强化倍率与猎手120%分别计算，一次施法触发一次独立天赋弹；无目标或空仓不误扣SP。'],
     ['skill/skchr_snhunt_2/fixed-actions','**S2 已实现的动作状态**：固定技能4/7，空仓可施放；两发各自减防并在命中时判断移动/等待/阻挡/控制，天赋另发一弹，保留充能，无目标不误扣SP。此子项不含上述特殊动作分类。'],
     ['talent/1/fixed','**裂云一击固定养成**：一次施法一枚独立物理弹，源倍率/寒冷时间；友方寒冷按两次一组冻结、降攻速与冻结减法抗，直接免疫字段、死亡/复活清理与丢失目标处理。'],
     ['module/fixed-level1','**固定默认模组1级**：仅精锐启用uniequip_002_snhunt，空仓一次装填额外1发，非空仓不额外补弹，不能超过弹仓上限；模组2/3及账号解锁资格不在此项。']
    ])lines.push(task('op/'+id+'/'+key,label,[basis,r.skills,r.talents,r.module,r.ownSlots],group));
    lines.push('','参数、时序近似与剩余范围见'+link('../mechanics/hunter.md','猎手专项')+'。');
   }
   if(id==='char_469_indigo'){
    lines.push('', '固定养成的可独立验收子项（盟约II普通/精锐；不代替全等级、个体联动与整体验证）：');
    for(const [key,label]of [
     ['basic/mystic-fixed','**标准秘术师蓄存**：无目标按实际攻击间隔储存，满仓等待；普攻加独立能量弹齐射并清仓，储存共用行动与部署门禁，技能结束保留、死亡与再部署清空。精确前后摇仍属近似。'],
     ['skill/skchr_indigo_1/fixed','**S1 固定技能4/7**：源SP/持续/范围/倍率，攻击与储存间隔缩至20%；普通弹按攻击计划倍率，储存弹按命中时技能是否有效取35%/40%，结束恢复范围。'],
     ['skill/skchr_indigo_2/fixed','**S2 固定技能4/7**：源SP/持续，间隔70%/65%，束缚概率翻2/2.5倍；每0.5秒对范围内已束缚敌人造成12%/15%法术持续伤害，不触发普攻天赋，不把自缚/等待当束缚。'],
     ['talent/1/fixed','**柔光缚目固定养成**：普通12%、精锐18%，每发独立判定4秒束缚；不选择已束缚目标，已发能量仍命中；束缚只限制移动、保留敌人攻击与阻挡，致死复活清状态。'],
     ['module/fixed-level1','**固定默认模组1级**：精锐uniequip_002_indigo提供源攻击45、攻速3及储存上限4；普通上限3。仅模组0/1，本项不含模组2/3天赋替换及账号资格。']
    ])lines.push(task('op/'+id+'/'+key,label,[basis,r.skills,r.talents,r.module,r.ownSlots],group));
    lines.push('', '参数、证据与剩余范围见'+link('../mechanics/mystic.md','秘术师与深靛专项')+'。');
   }
   if(['char_4016_kazema','char_1023_ghost2'].includes(id)){
    lines.push('', '固定养成的限定子项（两季普通/精锐；不含精确转场无敌帧、全养成、其他天赋或整人验收）：');
    const scoped=[
     ['basic/dollkeeper-fixed','**标准替身生命周期**：本体致死转20秒替身并释放阻挡；替身0阻挡、停SP/技能、自然返回满血本体；替身再次致死走正常死亡/付费再部署。转场即时处理，原版动作帧未复刻。'],
     ['talent/1/fixed',id==='char_4016_kazema'?'**折纸生花固定养成**：转替身时对源x-4范围造成源倍率法伤；移除旧分类常驻增益。':'**拥抱自我固定养成**：替身不普攻，源x-4范围地面敌人受到法术持续伤害和减速；首tick暂设1秒，结束停止。'],
     ['module/fixed-level1','**默认模组1级的替身攻击加成**：普通无模组，精锐源模组1级替身攻击+15%；读取源附加攻击/防御。此项不包括所有生命修正叠加、模组2/3或账号资格。']
    ];
    for(const sk of r.skills)scoped.push(['skill/'+sk.id+'/fixed','**S'+sk.index+' 固定技能4/7执行**：源SP、持续、范围、全部黑板与专属动作；自损/命中/结束/替身联动按专项验证。生命上限变化沿用现有属性层，精确前后摇与所有组合未验收。']);
    if(id==='char_4016_kazema')scoped.push(['token/token_10022_kazema_shadow/fixed-placement','**纸偶固定源实体与生命周期**：真实阶段等级、S2攻击加成、出现法伤、地面普攻、合法相邻落点与独立归属，主动撤退消耗、主人转形/技能结束回收；敌占格优先加随机为近似，原版嘲讽排序未还原。']);
    for(const [key,label]of scoped)lines.push(task('op/'+id+'/'+key,label,[basis,r.skills,r.talents,r.module,r.ownSlots],group));
    lines.push('', '源事实、实现近似和未完成项见'+link('../mechanics/dollkeeper.md','傀儡师专项')+'。');
   }
   if(['char_427_vigil','char_249_mlyss'].includes(id)){
    const flow=id==='char_249_mlyss',scoped=[['basic/tactical-point','**战术点生命周期**：源属性独立实体、死亡休眠、定时满血返回、主人离场回收、归属和暂停恢复；候选手动拖放、朝向确认、主人范围/部署类型检查；主动撤退转原位恢复，不回候选。']];
    if(!flow){
     scoped.push(['token/wolf-source','**狼群源属性**：固定普通/精锐阶段等级插值、独立地面攻击与禁疗；不复制本体装备、盟约和天赋。'],['talent/1/fixed-stacks','**狼群领袖固定养成**：初始2狼影，25秒增加至多3；阻挡/连击随层数，致死减1与0层休眠。'],['talent/2/fixed-blocker','**狼群天性固定养成**：仅自身狼群阻挡目标获得175穿防；伺夜自身150%攻击特性，排除其他队友援军及未阻挡目标。']);
     for(const sk of r.skills)scoped.push(['skill/'+sk.id+'/fixed','**S'+sk.index+' 固定技能执行**：源全黑板/SP/持续、费用与狼影/下一次攻击/三连击附加法伤；15秒费用末tick按小于一逻辑帧的源舍入差归一。精确动作帧未验收。']);
    }else{
     scoped.push(['token/flow-copy','**流形复制属性**：满技力开启20秒窗口，本席候选拖入后复制；复制白名单属性/原始范围与近远程分类，排除技能、天赋执行器和群攻/治疗行为。超时/主动取消/主人技能中止，重新充能可重选；候选不消耗。'],['token/melee-steal','**近战复制体**：每次命中偷取10攻防、各自250上限，最终加算；敌方同类取最高，重复制清除自身积累，休眠保留已复制形态。'],['token/ranged-split','**远程复制体**：10次攻击计数、相邻合法格顺序分裂、25秒临时实体、不再分裂/休眠；主人离场清除，S2每次独立选敌。']);
     for(const sk of r.skills)if(sk.index<3)scoped.push(['skill/'+sk.id+'/fixed','**S'+sk.index+' 固定技能执行**：源SP/持续/全部黑板、费用、共同攻击加成及近远程分支；S1攻速/持续回费，S2近战回血庇护与远程逐发随机二连击。']);
     scoped.push(['skill/skchr_mlyss_3/ranged-and-stun','**S3 刷新/束缚/阻挡眩晕**：固定源参数与费用，远程刷新临时体并命中束缚、近战控制自身阻挡者；此勾选不包括小力度拖拽，现位移为明确仿真近似。']);
    }
    scoped.push(['module/fixed','**源默认模组**：逐固定配置读取实际等级，援军仅对自身阻挡者减伤；流形源模组3级100%复制与首次5SP，不按统一模组1级处理。']);
    lines.push('','战术实体限定子项；包含已核手动落点/复制流程，不代表整人、全养成组合或精确位移完成：');
    for(const [key,label]of scoped)lines.push(task('op/'+id+'/'+key,label,[tacticalBasis,r.skills,r.talents,r.module,r.ownSlots],group));
    lines.push('',link('../mechanics/tactician.md','狼群、磐蟹和流形专项：源参数、手动操作与未完成项'));
   }
   if(['char_476_blkngt','char_452_bstalk'].includes(id)){
    const night=id==='char_476_blkngt',scoped=[
     ['basic/library-point','**资料库手动战术点**：单人调试按资料库练度加入，候选落点与朝向、独立源实体、阶段恢复周期、休眠不占阻挡、原位复活；不扩充任一赛季商店。'],
     ['skill/'+(night?'skchr_blkngt_1':'skchr_bstalk_1')+'/source-levels',night?'**半醒 1–10级**：源SP/黑板、即时11费；眠兽休眠继续阻挡，百分比再生、受实际伤害后醒来并获得10秒攻击/攻速加成。主人不占用10秒技能状态。':'**定点指令 1–10级**：真实资料库入口按所选技能等级取源参数，8费、恢复主磐蟹；固定源样例另检查阵亡时刷新。'],
     ['skill/'+(night?'skchr_blkngt_2':'skchr_bstalk_2')+'/source-levels',night?'**安眠 1–10级**：源SP/充能/持续/倍率，4费，十字范围睡眠、1.1半径群体法伤、眠兽优先选睡眠者；飞行/源睡眠免疫排除。自动施法保留现存效果期的下一充能，精确几何边框/动作时序不在本项。':'**大家一起上 1–10级**：真实资料库入口按源SP/持续/黑板，四邻合法格临时磐蟹和源防御，结束回收；原专项另核12费与15秒周期。'],
     ['module/'+(night?'x':'y')+'-effects',night?'**X模组效果执行器**：源阻挡者减伤、点梦攻击增益条件，提供者死亡立即失效与0.1秒检测；模组原始属性、账号解锁界面及精确扫描相位不在本项。':'**Y模组效果执行器**：源165%特性、被自身援军阻挡的敌方目标优先、阻挡时才增加磐蟹防御；模组属性与账号解锁界面不在本项。']
    ];
    if(night)scoped.push(['token/sleep-ownership','**眠兽睡眠归属与恢复**：战术点形态仍可施加安眠；变形/撤退只解除自身睡眠，保留另一点及外部来源。普通攻击/直接持续伤害尊重睡眠无敌；签名快照保存归属并实际推进恢复。']);
    lines.push('','资料库限定验证子项（不等于全部属性、模组资格或整人完成）：');
    for(const [key,label]of scoped)lines.push(task('op/'+id+'/'+key,label,[tacticalBasis,r.skills,r.talents,r.module],group));
   }
   if(['char_4147_mitm','char_4215_buddy','char_4228_closur'].includes(id)){
    const scoped=[['basic/library-point','**独立资料库战术点**：实际单人调试入口、原生部署类型、源实体与归属、原位恢复和主人退场；'+(id==='char_4228_closur'?'此子项只核调试入口，正式六星甄选另见槽位清单。':'不进入两季商店。')]];
    if(id==='char_4147_mitm')scoped.push(
     ['token/cherry-remnants','**樱桃残骸**：手撤/击倒主点后下一逻辑帧生成四邻合法残骸，半血、零攻防、阻挡1、不攻击；临时体消耗，主点15秒复活互不清除；主人退场回收。'],
     ['skill/skchr_mitm_1/source-levels','**过载模式 1–10级**：源SP/范围/倍率，6费、按本体攻击在樱桃位置造成物伤后转战术点；缺主点仍回费。精确动作帧未验收。'],
     ['skill/skchr_mitm_2/source-levels','**承压功率 1–10级**：源SP/持续，本体攻击、主樱桃停攻/增防/阻挡+1，15秒12费，结束销毁主点；残骸不继承技能增益。未确认的hp黑板语义不据此勾全技能。'],
     ['module/y-remnants','**Y模组效果**：165%特性、所阻挡敌人优先级、残骸生命65%/70%；仅核效果执行器，不含资料库模组选择/资格或全部属性叠加。']);
    if(id==='char_4215_buddy')scoped.push(
     ['talent/bombs-source','**六潜能起爆龙弹**：前三个不同敌人的首次攻击替换挂弹，本体不能引爆，牙猎犬/其他有来源友方伤害可引爆；倍率/眩晕/1费/30秒按源，过期不返费。致死触发顺序与所有多来源组合仍待对照。'],
     ['token/hound-source','**牙猎犬**：只普攻自身阻挡者；落地周围8格至多3目标斩击可对空，60秒原位恢复后再次触发。拉力沿用明确终点近似，精确受力/碰撞不在本项。']);
    if(id==='char_4228_closur')scoped.push(
     ['token/command-zone','**指挥中心与援军**：全地形位、源支援范围随技能取5/9/9格，不攻击；范围内友方临时被视为本体援军，休眠/主人离场立即失去标记。'],
     ['skill/skchr_closur_1/source-levels','**递归策略 1–10级**：单次护盾不叠加、每次施放提高费用至源上限，首tick半间隔；计数每次部署重新开始。'],
     ['skill/skchr_closur_2/source-levels','**模型扩展 1–10级**：源立即/持续回费、本体双目标与攻击、援军防御/阻挡、援军阻挡者越界选敌；部署下一帧返当前费用40%向上取整，重复推进不重复返费。'],
     ['skill/skchr_closur_3/source-levels','**Q.E.D. 1–10级有限执行面**：源攻击倍率/间隔、援军原范围联合、每9次攻击加目标至7、18费、迟钝叠层封顶/到期；已接普通移动/攻击及寒冷/冻结/眩晕/睡眠/沉默时钟，其他特殊动画/状态仍待核。'],
     ['talent/carry-floor','**极限调度**：本席携带含候选，罗德岛攻击加成、负费用下限；负值自然回费减半，技能回费正常。源模组2/3级边界与援军被自身阻挡者攻击时15%减伤；模组资格界面未核。']);
    lines.push('','新增专属执行器的限定验收面；精确物理、未确认黑板及全组合见'+link('../mechanics/tactician.md','战术实体专项')+'：');
    for(const [key,label]of scoped)lines.push(task('op/'+id+'/'+key,label,[tacticalBasis,r.skills,r.talents,r.module],group));
   }
   if(id==='char_249_mlyss')lines.push(task('op/'+id+'/talent/2/carry-mode','**开源节流的本模式再部署减费**：本席候选或场上携带缪尔赛思，源莱茵生命身份的再部署费用-2；同类不叠加，移除携带者后重算。开场布阵在本项目免费，首名额外折扣无费用可扣，不将其转成额外回费。',[tacticalBasis,r.talents],group));
   const hints=unique([...r.testRefs,...r.skills.flatMap(s=>s.testRefs)]);
   if(hints.length)lines.push('','测试线索：'+hints.map(p=>link('../../'+p,path.basename(p))).join('、')+'（存在引用，不自动认定断言覆盖）。');
  }
  return lines;
 }
 const order=(a,b)=>Math.min(...a.ownSlots.map(s=>s.chessLevel),99)-Math.min(...b.ownSlots.map(s=>s.chessLevel),99)||a.id.localeCompare(b.id);
 const mode=records.filter(r=>r.scope==='mode').sort(order),other=records.filter(r=>r.scope==='library').sort((a,b)=>a.id.localeCompare(b.id));
 doc('docs/checklists/operator-checklist.md',operatorDoc(mode,'mode'));
 doc('docs/checklists/library-checklist.md',operatorDoc(other,'library'));
 const slotLines=['# 赛季商店槽位、隐藏与替补清单','',link('README.md','返回总表')+' · '+slots.length+' 个源槽位逐项列出，不能把槽位数当作干员人数。','',
  '默认技能索引显示为玩家可读的 S1/S2/S3（源索引 +1）。同 charId 不同 tmplId、隐藏、DIY、自选原型和替补按各自限定子项读取完成状态；四槽甄选已有实现，不能继续整体写成未接。普通与精锐数据必须跟随该槽位；不按名字查另一季的阶数。'];
 for(const sid of ['act2autochess','act1autochess']){
  slotLines.push('','## '+seasonName[sid],'');
  for(const s of slots.filter(s=>s.season===sid).sort((a,b)=>a.chessLevel-b.chessLevel||a.shopLevelSortId-b.shopLevelSortId)){
   const current=s.isHidden?null:seasonRosters[sid].get(s.charId),name=chars[s.charId]?.name||'自选/空角色槽';
   slotLines.push(task('slot/'+sid+'/'+s.chessId,roman[s.chessLevel]+' · '+name+' '+code(s.chessId)+' / 精锐 '+code(s.goldenChessId)+'；'+s.chessType+(s.isHidden?' / 隐藏':' / 非隐藏')+'；'+code(s.charId)+'，模板 '+code(s.tmplId)+'，默认 S'+(s.defaultSkillIndex+1)+' / '+code(s.defaultUniEquipId)+'；替补 '+(chars[s.backupCharId]?.name||'—')+' '+code(s.backupCharId)+' / 模板 '+code(s.backupTmplId)+' / S'+(s.backupCharSkillIndex+1)+'；本季普通招募身份'+(current?'存在 '+roman[current.tier]+(current.tier!==s.chessLevel?'（阶数不符）':''):'不在名册')+'，赛季隔离与资格待验收。',[s,current,seasons[sid].charChessDataDict[s.chessId],seasons[sid].charChessDataDict[s.goldenChessId]],'slot'));
   if(s.chessType==='DIY')slotLines.push(task('slot/'+sid+'/'+s.chessId+'/owned-six-star','**持有六星甄选子项**：排除当季固定/隐藏/替补身份；不重复占槽，来源阶数、技能选择、普通/精锐养成、模组与无卫戍特质。实际刷出、购买、合成与恢复；不含原型/好友助战资格，也不代表所选干员全部机制完成。',[s,diy.seasons[sid],diy.operators],'slot'));
  }
 }
 slotLines.push('','## 甄选共同规则','',
  task('diy/core-and-fallback','**势力与协防**：主/隐藏势力匹配当季核心；无匹配才协防。两季激活阈值、减伤、普通/精锐最终伤害与受益对象独立核验。',diy.seasons,'slot'),
  task('diy/private-snapshot','**本席编队与恢复**：本地按季保存、开局锁定；单人不建立房间，双人独立阶数/技能/潜能/模组，快照签名和资格拒绝；局内不受之后本机改配影响。',diy,'slot'),
  '',link('../mechanics/diy-roster.md','甄选来源、使用与剩余边界'));
 doc('docs/checklists/mode-slot-checklist.md',slotLines);
 const deathSpawnData=JSON.parse(f.run('JSON.stringify(window.ArkEnemyDeathSpawnData)'));
 const passiveData=JSON.parse(f.run('JSON.stringify(window.ArkEnemyPassiveData)'));
 const passiveBasis=Object.fromEntries(['tools/build_enemy_passives.js','web/enemy_passive_data.js','web/src/simulation/enemy-passives.js','web/engine.js','tools/_enemy_passives_smoke.js'].map(p=>{readText(p);return [p,hashes[p]];}));
 const transferBasis={...passiveBasis,...Object.fromEntries(['tools/lib/source-battle.js','tools/_enemy_transfer_smoke.js'].map(p=>{readText(p);return [p,hashes[p]];}))};
 const deathSpawnBasis=Object.fromEntries(['tools/build_enemy_death_spawn.js','web/enemy_death_spawn_data.js','web/src/simulation/enemy-death-spawn.js','web/engine.js','tools/_enemy_death_spawn_smoke.js'].map(p=>{readText(p);return [p,hashes[p]];}));
 const propLikeBasis=Object.fromEntries(['web/src/simulation/operator-combat.js','web/src/simulation/mystic.js','web/src/simulation/dollkeeper.js','web/src/simulation/tactical-specials.js','web/src/simulation/elemental-operators.js','tools/_enemy_prop_smoke.js'].map(p=>{readText(p);return [p,hashes[p]];}));
 // Retain level-specific variants instead of flattening them to a global base.
 const enemyIds=new Set(Object.keys(encounters.enemies)),variants=new Map(),spawns=new Map();
 for(const [level,l]of Object.entries(sourceBattles.levels)){
  for(const [id,e]of Object.entries(l.enemies)){enemyIds.add(id);if(!variants.has(id))variants.set(id,[]);variants.get(id).push({level,data:e});}
  for(const w of l.waves)for(const fr of w.fragments)for(const a of fr.actions)if(a.actionType==='SPAWN'){if(!spawns.has(a.key))spawns.set(a.key,[]);spawns.get(a.key).push({level,action:a});}
 }
 const database=new Map(db.enemies.map(e=>[e.Key,e.Value]));
 const enemyRecords=[];
 for(const id of sorted([...enemyIds])){
  const v=variants.get(id)||[],base=encounters.enemies[id]||v[0]?.data,raw=database.get(id)||[];
  const skills=new Map(),bbs=new Set();
  for(const e of [base,...v.map(v=>v.data)]){
   for(const s of e?.sourceSkills||[]){const key=s.prefabKey;if(!skills.has(key))skills.set(key,[]);if(!skills.get(key).some(x=>digest(x)===digest(s)))skills.get(key).push(s);}
   for(const b of e?.sourceTalentBlackboard||[])bbs.add(b.key);
  }
  const memberships=Object.entries(seasons).flatMap(([sid,s])=>Object.entries(s.enemyInfoDict).filter(([,ids])=>ids.includes(id)).map(([type])=>({season:sid,type,name:encounters.types[type]?.name||type})));
  const special=Object.entries(seasons).flatMap(([sid,s])=>Object.entries(s.specialEnemyInfoDict).filter(([,e])=>[e.specialEnemyKey,...e.attachedNormalEnemyKeys,...e.attachedEliteEnemyKeys].includes(id)).map(([key,e])=>({season:sid,key,role:e.specialEnemyKey===id?'主敌':e.attachedEliteEnemyKeys.includes(id)?'精英随从':'普通随从'})));
  const runtime=live.enemies[id],abilities=handbook[id]?.abilityList||[];
  enemyRecords.push({id,name:handbook[id]?.name||base?.name||id,sourceExists:raw.length>0,sourceLevels:raw.map(e=>e.level),base,variants:v,memberships,special,
   spawns:spawns.get(id)||[],runtimeExists:!!runtime,legacySkills:runtime?.skills||[],legacyTalents:runtime?.talents||[],
   skills:[...skills].map(([id,variants])=>({id,variants})),talentKeys:sorted([...bbs]),abilities,boss:bosses.profiles[id]||null,
   testRefs:testRefs(id),codeRefs:refs(codeFiles,id)});
 }
 const enemyLines=['# 敌人逐项清单','',link('README.md','返回总表')+' · 覆盖完整敌群输入和模式关卡引用，不把源属性存在等同能正确登场。','',
  '同 enemyId 的源等级、关卡覆写定位和摘要保留在 JSON 的 variants 中；能力从prefab/模式、Buff动作和原生方法追踪，并回到所列关卡字段检查差异。图鉴技能文字与源 prefabKey 分别列项，可能描述同一能力，验证时可共用记录，不统计为不同敌人数。', '',
  '标签“主波次出现”只说明模板 SPAWN 提到了该 ID，不证明最终应生成它。全库其他剧情敌人未纳入卫戍实施范围；源引用的子实体另在对应能力中核查。','',
  '| 敌人 | 源等级 | 分组归属 | 主波次声明 | 源主动技能 | 图鉴能力 |','|---|---|---|---|---|---|'];
 for(const e of enemyRecords)enemyLines.push('| '+link('#'+e.id,e.name)+' | '+e.sourceLevels.join('/')+' | '+unique(e.memberships.map(m=>m.name)).join('、')+' | '+e.spawns.length+' 动作 | '+e.skills.length+' | '+e.abilities.length+' |');
 for(const e of enemyRecords){
  const id=e.id,basis={base:e.base,variants:e.variants,...(['enemy_1067_snslime','enemy_1069_icebrk','enemy_1069_icebrk_2'].includes(e.id)?{cold:coldBasis}:{})},group='enemy';
  enemyLines.push('','<a id="'+id+'"></a>','## '+e.name+' · '+code(id),'',
   '归属：'+(e.memberships.map(m=>seasonName[m.season]+' '+m.name).join('；')||'关卡/随机属性池引用，非七类成员')+'。特训关联 '+e.special.length+' 条；关卡定义 '+e.variants.length+' 份。','',
   fact(e.sourceExists&&e.runtimeExists,'原始定义 '+(e.sourceExists?'有':'缺')+'；运行期基础定义 '+(e.runtimeExists?'有':'缺')+'；源等级 '+e.sourceLevels.join('/')+'。'),
   task('enemy/'+id+'/spawn','**出怪资格/数量/路线**：静态源主 SPAWN 中 '+e.spawns.length+' 条声明；六模板替换和逐轮计划已接，仍按本项核此敌人的实际池、前后半、权重、随从、禁用与路线。'+(e.memberships.length?'公共替换通过不等于此敌人的所有入场分支已验收；范围见总表 B02。':'检查此条目的实际关卡/池引用，不因目录存在就塞进波次。'),[e.memberships,e.special,e.spawns,encounters.constants],'enemy'),
   task('enemy/'+id+'/base','**基础行为**：源 motion='+e.base.motion+'，canAttack='+e.base.canAttack+'，applyWay='+e.base.applyWay+'；核查地面/飞行、阻挡占用、索敌范围、伤害类型、移速、漏怪伤害和覆写；不能仅按 ATK 非零判断会攻击。',basis,group));
  if(e.base.attackSpeedAura)enemyLines.push('','专用路径：寒霜攻速削减光环已有；源图鉴没有“必定冻结”这条描述，冻结效果必须另有来源。','');
  if(e.base.bombAttack)enemyLines.push('','专用路径：已有单次投弹；源动画前摇、3×3区域和移速乘区参数已修正。飞行轨迹、加速时点与完整模式/FSM仍未完成，见[暴鸰参数](../mechanics/enemy-skills.md#暴鸰参数修正2026-09-15)。','');
  if(id==='enemy_1005_yokai')enemyLines.push('','未解决反馈：用户报告飞行妖怪挤占地面阻挡。当前与143911旧包的隔离回归均未复现，仍需原阵容/当轮状态或录像；不得勾成已修复。','');
  for(let i=0;i<e.abilities.length;i++){
   const a=e.abilities[i];enemyLines.push(task('enemy/'+id+'/ability/'+i,'**图鉴能力 '+(i+1)+'**：'+clean(a.text)+'；标记 '+code(a.textFormat)+'。核查触发、目标、数值、状态免疫/沉默、死亡与表现。',[a,basis],group));
  }
  if(!e.abilities.length)enemyLines.push('','图鉴：本地未列 abilityList；仍需查角色prefab的模式/能力、Buff动作和方法引用，再结合黑板；不能据此判定没有特殊机制。','');
  for(const s of e.skills){
   const legacy=e.legacySkills.filter(x=>x.prefabKey===s.id).map(x=>x.skillType),bbs=unique(s.variants.flatMap(v=>(v.blackboard||[]).map(b=>b.key)));
   enemyLines.push(task('enemy/'+id+'/skill/'+s.id,'**主动技能** '+code(s.id)+'：'+s.variants.length+' 份不同参数；黑板 '+bbs.map(code).join('、')+'；旧分类 '+(legacy.join('/')||'无')+'。核查 initCooldown/cooldown/SP、多技能共存、范围/弹道/召唤及逐阶段生命周期。',[s,basis],group));
  }
  if(e.talentKeys.length)enemyLines.push(task('enemy/'+id+'/talents','**被动黑板**：'+e.talentKeys.length+' 个键 '+e.talentKeys.map(code).join('、')+'；旧分类 '+(unique(e.legacyTalents.map(t=>t.type)).join('、')||'无')+'。逐键确认条件、概率、单位、免疫、复活/分裂、Buff 结束和子实体来源，不可关键词命中就常驻加成。',basis,group));
  if(passiveData.enemies[id]?.blockFree)enemyLines.push(task('enemy/'+id+'/passive/block-free','**公共被动 · BLOCK_FREE限定主体**：根_commonAbilities明确挂载启用的永久/不可沉默PassiveBuffAbility，实际出生、更新及恢复释放旧阻挡占用，不受仅阻挡/自身阻挡选敌命中；普通攻击仍可命中。保留关卡覆写和路线；不把此标志扩为飞行、隐身、无敌或全状态免疫，其余能力不在本子项。',[basis,passiveData.enemies[id],passiveBasis],group), '',link('../mechanics/enemy-passives.md','根被动来源与执行范围'));
  if(passiveData.enemies[id]?.damageTransfer)enemyLines.push(task('enemy/'+id+'/passive/damage-transfer','**受伤传递 · 唯一胄首领主体**：ON_TAKE_DAMAGE在扣自身HP前以Modifier.value传递，不截断过量伤害；经真实BossSelector/常驻标记及当前BOSS等级筛到唯一首领，纯伤害不二次触发modifier事件或攻击者伤害收益。关卡等级/HP覆写、无目标/歧义拒绝、实际弹体及鉴权恢复；其他事件、动态标记、同标记多Boss排序与完整子实体能力不在本子项。',[basis,passiveData.enemies[id].damageTransfer,transferBasis],group), '',link('../mechanics/enemy-passives.md','转伤原生顺序与执行边界'));
  if(deathSpawnData.enemies[id])enemyLines.push(task('enemy/'+id+'/death-spawn/source-body','**死亡生成 · 源事件与数量主体**：真实PassiveBuffAbility与enemy_dead_spawn绑定，使用当前覆写DeadSpawn.enemy_key/cnt；最终死亡生成，坠落/漏怪/首次复活不生成，不受沉默抑制且幂等。延迟队列与路线检查点保存、阻波/清场/超时及主机签名恢复已接。原版散布选格、随机延迟序列与精确出场时序不在本子项，当前沿原位置继续路线。',[basis,deathSpawnData.enemies[id],deathSpawnData.template,deathSpawnBasis],group), '',link('../mechanics/enemy-death-spawn.md','死亡生成来源、验证和未完成边界'));
  if(deathSpawnData.children[id]?.propLike)enemyLines.push(task('enemy/'+id+'/prop-like/source-body','**器物生命 · 有效命中次数主体**：真实PropLikeEnemy按当前HP每次有效负生命修正扣1，不因大伤害一次清空；特定类型只接受法术/真伤，非负生命修正不治疗。保留当前关卡HP/生命修正、真实普攻/技能/弹体/持续伤害类型和恢复后剩余次数；不凭此规则赋予元素积累免疫。原版动画、其他子敌能力与尚未接入的HP修改器不在本子项。',[basis,deathSpawnData.children[id],deathSpawnBasis,propLikeBasis],group), '',link('../mechanics/enemy-death-spawn.md','器物生命原生规则与执行边界'));
  if(e.boss)enemyLines.push(task('enemy/'+id+'/boss','**Boss 专属**：已配置 '+e.boss.movement+' / 受击区 '+e.boss.hitbox?.width+'×'+e.boss.hitbox?.height+'；自动阶段、分支/预设装置、联防双人归属、共享血量和死亡胜利逐条核查。现有5条 profile 不是5个全完成 Boss。',[e.boss,basis],group));
  enemyLines.push(task('enemy/'+id+'/validation','**整体验证**：实际关卡覆写与生成、阻挡/攻击/死亡、效果可视化、重复触发和单机/联机快照恢复；附对应断言与原版对照。',basis,group));
  if(id==='enemy_9017_achunt'){
   const cleanupBasis=Object.fromEntries(['tools/build_enemy_passives.js','web/enemy_passive_data.js','web/src/simulation/enemy-passives.js','web/engine.js','tools/inspect_achunt_cleanup.py','tools/_achunt_cleanup_smoke.js'].map(p=>{readText(p);return [p,hashes[p]];}));
   enemyLines.push(task('enemy/'+id+'/passive/marked-death-cleanup','**首领最终死亡 · 根标记清理子项**：按实际永久achunt_mark选择同场合格目标，最终死亡触发InstantKill直接置零及正常死亡/复活；不变成伤害或派发转伤，漏怪不触发，保留分级覆写、坠落原因、幂等和鉴权恢复。三个子体自身转伤的TARGET上下文及首领全部技能/阶段未纳入。',[basis,cleanupBasis],group));
  }
  if(e.testRefs.length)enemyLines.push('','测试线索：'+e.testRefs.map(p=>link('../../'+p,path.basename(p))).join('、')+'（不自动勾选）。');
 }
 doc('docs/checklists/enemy-checklist.md',enemyLines);
 const stats={modeOperators:mode.length,fixedOperators:fixed.size,libraryOnly:other.length,library:library.size,slots:slots.length,enemies:enemyRecords.length,
  modeSkills:mode.reduce((n,r)=>n+r.skills.length,0),modeExplicitSkills:mode.reduce((n,r)=>n+r.skills.filter(s=>s.explicitHandler).length,0),
  fixedSkills:mode.filter(r=>r.fixed).reduce((n,r)=>n+r.skills.length,0),fixedExplicitSkills:mode.filter(r=>r.fixed).reduce((n,r)=>n+r.skills.filter(s=>s.explicitHandler).length,0),
  modeTalents:mode.reduce((n,r)=>n+r.talents.length,0),modeHiddenTalentGroups:mode.reduce((n,r)=>n+r.talents.filter(t=>!t.names.length).length,0),modeTokenAssociations:mode.reduce((n,r)=>n+r.tokens.length,0),
  sourceLevelFiles:Object.keys(sourceBattles.levels).length,
  seasonMissing:Object.fromEntries(Object.keys(seasons).map(sid=>[sid,unique(slots.filter(s=>s.season===sid&&!s.isHidden&&['PRESET','NORMAL'].includes(s.chessType)&&s.charId&&!seasonRosters[sid].has(s.charId)).map(s=>s.charId))]))};
 const commonSkills=new Map();for(const r of mode)for(const s of r.skills)if(s.id.startsWith('skcom_')){if(!commonSkills.has(s.id))commonSkills.set(s.id,[]);commonSkills.get(s.id).push({operator:r.id,name:r.name,skill:s.name});}
 const index=['# 干员与敌人实施总清单','',
  '建立于 2026-09-12。**按清单逐项审计和分批修复；每项实现并验证后才能勾选，部分完成保留未勾并记录进展，不以数据存在宣称机制补全。发布按用户当次指令执行。**','',
  '推进顺序见 '+link('../plan.md','当前计划')+'；本表是个体完成情况的唯一追踪入口。数据问题分类见 '+link('../research/data-inventory.md#priority','数据问题表')+' 维护。旧的覆盖报告保留为事实快照，不复制人工完成勾选。','',
  '跨干员/敌人/模式的共用机制取证与迁移记录见'+link('mechanism-research.md','机制研究总清单（R01–R12）')+'；它连接原始调用链和适用对象，本表保留逐人/逐敌验收，先后顺序仍只由当前计划决定。','',
  '取证与实现按'+link('../research/client-logic-pipeline.md','客户端逻辑流水线')+'批量推进：同一组件/动作模板/原生方法先明确一次，再按适用ID、源等级和差异展开验证。描述与录像用于交叉核对，不作为逐个猜技能的默认入口。数据齐全、处理器登记和限定验收是不同计数。','',
  '## 范围与入口','',
  '| 清单 | 本次范围 | 用途 |','|---|---:|---|',
  '| '+link('operator-checklist.md','卫戍干员逐项 checkbox')+' | '+stats.modeOperators+' 人 | 两季固定 '+stats.fixedOperators+' 人，另含隐藏/替补和当前额外身份 |',
  '| '+link('mode-slot-checklist.md','赛季槽位逐项 checkbox')+' | '+stats.slots+' 槽 | 普通/精锐、阶数、模板、默认技能/模组、隐藏与替补独立核查 |',
  '| '+link('enemy-checklist.md','敌人逐项 checkbox')+' | 审计目录 '+stats.enemies+' 种 ID | 保留通用属性与'+stats.sourceLevelFiles+'份模式关卡的原审计身份；实际出场范围以'+link('../generated/garrison-foundations.md','卫戍基础优先表')+'为准，目录总数不作卫戍敌人数 |',
  '| '+link('library-checklist.md','其他资料库干员 checkbox')+' | '+stats.libraryOnly+' 人 | 非固定名册，保留技能/天赋；符合资格者可经四槽甄选加入商店 |',
  '| '+link('implementation-checklist.json','机器可读事实与任务索引')+' | 原始 ID / 参数定位 / 代码线索 | 供后续脚本批量处理，不复制整套源表，不是自动完成评分 |','',
  '卫戍主表共 '+stats.modeSkills+' 个技能、'+stats.modeTalents+' 组天赋/行为数据（其中 '+stats.modeHiddenTalentGroups+' 组没有公开名称）、'+stats.modeTokenAssociations+' 个本体声明的召唤物关联。'+stats.modeExplicitSkills+' 个技能有专用攻击/元素/公共技能处理器线索；这不是已完成技能数。所有 '+stats.library+' 名本地资料角色均落入且只落入一张干员表。','',
  '## 怎么读与维护','',
  '- `[x] 资料检查` 只表示脚本直接确认该字段/身份/导出候选存在。它不是“天赋或技能已正确实现”。','- 其他 `[ ]` 是行为验收：状态在同一行注明“缺导出 / 旧分类待核 / 专用路径待验收 / 已知缺口”。当前不凭函数名或测试文件名批量勾完成。',
  '- 完成一项后在 Markdown 勾 `[x]`，并在紧接的下一行添加 `  - 记录：实现位置；测试命令与具体断言；原始依据/仍有的近似；日期`。部分完成保持未勾，用同样的记录行写进展。',
  '- 行末隐藏的 `review:... basis:...` 是稳定 ID 和依据摘要。重建保留勾选和记录；源字段、可观测目录或处理器登记变化会重新打开相关项；删除已记录的对象会报错，防止丢进度。共享执行代码改动时须沿影响范围重新核查，脚本不宣称理解代码语义。不要删这些标记。','- 行为记录先区分“源表已确认的规则”和“当前仿真实现/近似”；泛化 smoke 通过不能升级为原版一致。专项源码命中、测试引用只用作定位线索。',
  '- 纯说明整理不改变既有验收；若生成摘要因文案变动而变化，先确认源数据与运行逻辑未变，再保留原稳定ID、勾选和记录。共享文件哈希变化本身不证明所有依赖行为失效，不因此重做无关源码研究。',
  '- 原文中某些技能名字随等级/版本变化，统一以 charId / skillId / chessId 追踪；“未列出召唤物”不证明没有隐藏实体。临时借用另一干员的召唤物数值不能勾选完成。','',
  '```powershell','node tools/audit_implementation_checklist.js','node tools/audit_implementation_checklist.js --check','node tools/check_docs.js','```','',
  '以上只读源数据与隔离 VM，写 docs 清单；不会重建游戏数据、启动浏览器/房间、改用户配置或生成发行包。','',
  '## B01–B09 批次验收记录','', '批次标签说明当前范围；带日期的记录保留当时证据、版本和未核边界，其中旧“下一步/下一批”及当时现状不作为现行顺序。历史缺口被后续记录补齐时，按当前子项状态读取，不删除原验收过程。',''];
 const batchBasis={activity:hashes[gd+'excel/activity_table.json'],encounters:hashes['web/enemy_encounters.json'],roster:live.seasonRosters};
 const batches=[
  ['B01','**名册与赛季隔离（F04）**：两季固定身份/阶数和四槽甄选已接；隐藏、原型、助战与替补完整继承继续按逐槽表核。按 charId/chessId 保留独立养成、技能与模组，不把资料库454人全塞进商店。'],
  ['B02','**敌群模板替换（F03）**：开局3类、逐轮主敌/随从、前后半/权重/禁用及六模板数量/间隔已按原生逻辑接入，预览与运行共用持久化计划；原版随机流/热更新/服务器、token与extraEnemy分支仍待核，不勾整个敌群流程。'],
  ['B03','**结构化字段批量核对**：阶段/等级/潜能、技能SP/持续/范围、普通/精锐、模组属性、召唤源实体、敌方motion/applyWay/免疫及关卡覆写。保留每条源身份和失败名单；只补可确定的数据缺口。'],
  ['B04','**公共技能白名单**：对下表同 skillId 的 skcom 技能先核实一个完整执行器，再批量绑定对应角色；不得把 desc 分类非空当作技能完成，也不把复杂技能简化为 buff_atk。'],
  ['B05','**基础职业分支**：猎手装弹、标准秘术师蓄存、战术家/标准傀儡师及本批浮游已有各自限定主体；继续核非标准形态、个体例外和全生命周期，群攻/链攻/治疗/阻挡共用部分按适用ID展开验证。'],
  ['B06','**敌方技能执行器**：冰系条件能力与部分Boss多技能/模式已有专用路径；其余敌人仍含只选首技能或关键词误分类的旧路径。按实际组件/动作/原生调用接触发、目标、生命周期和多技能调度，再展开对应敌人/关卡验证。sourceSkills 原始数组存在不能勾完成。'],
  ['B07','**专属机制与差异**：天赋条件/对象/光环、S1/S2/S3、召唤物/替身/浮游/弹道、特质触发源及模组替换。按组件与原生方法归并共用实现，逐人清单保留特例和验收范围；不从描述逐个重猜，也不重复已验主体。'],
  ['B08','**Boss 与取证项**：昆图斯自动阶段/预设子代、胄分支召唤/伤害传递、萨米列攻击、帝国余晖技能；本地已知边界见Boss说明。洛洛定制品池、原版随机权重、精确前后摇没有结论时记录所缺证据，不编数值。'],
  ['B09','**每批集成验证后再考虑发布**：单机与多人共用规则、两名玩家归属、死亡/再部署/技能结束、保存恢复/RNG与简易特效；每批修复并验证；打包按用户当次要求执行。']
 ];
 for(const [id,label]of batches)index.push(task('batch/'+id,id+' '+label,batchBasis,'batch'));
 index.push(task('batch/B03/skill-levels','**干员技能逐等级数据子项**：454资料身份按原始技能索引关联；917技能/9125等级的SP、持续、范围、黑板与文案，账号上限、固定养成和详情共用取值。此项不包括技能执行、天赋、召唤实体和模组效果。',levelBasis,'batch'));
 const trainingRuntimeBasis=Object.fromEntries(['tools/extract_training_config.py','web/training_config.json','web/mode/strategy.js','web/mode/save.js','tools/_training_runtime_smoke.js'].map(p=>{readText(p);return [p,hashes[p]];}));
 index.push(task('batch/B03/training/act1/initial-hp','**第一季训练初始生命子项**：act1autochess/mode_training_1只在开局消费源initialHp=45；过轮不重置，休整及鉴权快照保留当前生命，第二季/正式模式隔离。NPC部署、四人轮选、Boss完整流程与同版缺道具不在本子项。',trainingRuntimeBasis,'batch'));
 const equipProtectionBasis=Object.fromEntries(['tools/build_equip_protection.js','web/equip-protection-data.js','web/src/simulation/equip-protection.js','web/engine.js','web/mode/data.js','web/mode/equip.js','web/mode/save.js','web/shop_items.json','tools/_equip_protection_smoke.js'].map(p=>{readText(p);return [p,hashes[p]];}));
 index.push(task('batch/B07/equip/eff_acarm060/source-body','**防暴盾单件源主体**：按赛季源effectId消费减伤系数，仅有自身实际阻挡且伤害来自非自身阻挡敌人时，在命中时核真实来源/动态阻挡；取消/免事件/未知来源不误用。源商店购买/穿戴、弹体飞行中阻挡变化、合法空槽休整及鉴权恢复；多件去重仍是本地约定，未知来源DOT、自损、死亡爆炸和完整Buff优先级组合不在本子项。',equipProtectionBasis,'batch'));
 const skillStackBasis=Object.fromEntries(['tools/build_equip_skill_stacks.js','tools/build_equip_data.js','web/equip-skill-stacks-data.js','web/src/simulation/equip-skill-stacks.js','web/equips.json','web/engine.js','web/mode/data.js','web/mode/rules.js','web/mode/equip.js','web/mode/save.js','tools/_equip_skill_stacks_smoke.js'].map(p=>{readText(p);return [p,hashes[p]];}));
 for(const effectId of ['eff_acarm040','eff_acgarm040'])index.push(task('batch/B07/equip/'+effectId+'/skill-stacks','**炎国短刀'+(effectId==='eff_acgarm040'?'进阶款':'普通款')+' · 单件技能叠层主体**：成功技能启动后每层攻击+'+(effectId==='eff_acgarm040'?'8%':'5%')+'，最多10层，源Dice在概率1与满层仍消耗随机数；零层无常驻加成，结束技能保留、真正死亡重置。按实际源身份清旧mods、购买/奖励/穿戴/休整和主机恢复；多件归并与当次瞬发技能伤害优先级未验，不能计完整装备。',skillStackBasis,'batch'));
 index.push('','## 推进顺序','',link('../plan.md','当前推进计划')+' 集中维护先后顺序与取证阻塞；本表只维护批次和逐项验收记录。','');
 index.push('','## 源名单中缺失的固定干员','');
 for(const [sid,missing]of Object.entries(stats.seasonMissing))index.push('**'+seasonName[sid]+'：'+missing.length+' 人**。'+(missing.map(id=>link('operator-checklist.md#'+id,chars[id].name)).join('、')||'当前固定身份均存在；仍须验收赛季隔离和个体机制')+'。','');
 index.push('## 可脚本复用的同 ID 技能候选','', '以下只识别结构化复用候选，所有效果仍须先按源语义审核。每名干员最终勾选仍在个人表中。','', '| 技能 ID | 名称 | 主表关联人数 | 干员 |','|---|---|---:|---|');
 for(const [id,rows]of [...commonSkills].sort((a,b)=>b[1].length-a[1].length||a[0].localeCompare(b[0])))index.push('| '+code(id)+' | '+rows[0].skill+' | '+rows.length+' | '+rows.map(r=>r.name).join('、')+' |');
 index.push('','## 核对依据与现有边界','',
  '| 领域 | 直接依据 | 实现/缺口说明 |','|---|---|---|',
  '| 干员身份/技能/天赋/召唤 | '+code(gd+'excel/character_table.json')+'、'+code(gd+'excel/skill_table.json')+' | '+link('../mechanics/operator-mechanics.md','攻击机制')+'、'+link('../mechanics/basic-actions.md','基础行动')+' |',
  '| 赛季名册、养成、专属特质 | '+code(gd+'excel/activity_table.json')+' / AUTOCHESS_SEASON | '+link('../mechanics/garrison-implementation.md','特质实现边界')+' |',
  '| 敌群/源波次/能力 | '+code('enemy_database.json')+'、'+code('enemy_handbook_table.json')+'、'+code('web/enemy_encounters.json')+'、'+code('web/source_battles.json')+' | '+link('../generated/content-coverage.md','覆盖核对')+' |',
  '| Boss | 源表 + 已提取 prefab 组件 | '+link('../generated/boss-mechanics.md','Boss阶段与数据缺口')+' |',
  '| 元素损伤 | 源buff/敌人目录 + 执行器 | '+link('../mechanics/elemental-damage.md','元素系统边界')+' |','',
  '源字段、组件与已解析原生分支分别记录版本和直接依据；本表对本项目代码路径的观察只是实现现状。未知时序/优先级从已有原始引用链定向追踪，按实际共用机制批量验证；测试不自证原版一致。','',
  '已有验收需要更新依据时，生成器可用 `--revalidation <receipt.json>` 接受一次集中复核；必须同时匹配旧/新basis、实际代码哈希和完整测试命令证据，原记录保持原样。未覆盖项继续重开，新行为独立验收。'+link('../research/client-program-integration.md','当前程序批次与集中复核方式')+'。');
 doc('docs/checklists/README.md',index);
 if(!scopeSkillModes&&!scopeGarrisonBatches)for(const [id,p]of previous)if(!seen.has(id)&&(p.done||p.notes.length))throw Error('Recorded task disappeared; preserve/archive its record before rebuilding: '+id);
 if(records.length!==library.size||mode.length+other.length!==library.size)throw Error('Character coverage mismatch');
 if(enemyRecords.length!==enemyIds.size||slots.length!==Object.values(seasons).reduce((n,s)=>n+Object.keys(s.charShopChessDatas).length,0))throw Error('Source coverage mismatch');
 // Store locators and relevant fields, not another copy of all source tables.
 const compactLevel=v=>v&&Object.fromEntries(['spType','spCost','initSp','duration','durationType','skillType','maxCharge','rangeId'].map(k=>[k,v[k]]));
 const compactOperators=records.map(r=>({...r,profile:r.profile?{action:r.profile.action,kind:r.profile.kind||'single',source:r.profile.source}:null,
  skills:r.skills.map(({sourceDescription,blackboard,...s})=>({...s,blackboardKeys:(blackboard||[]).map(b=>b.key),current:s.current?{normal:compactLevel(s.current.normal),elite:compactLevel(s.current.elite)}:null})),
  talents:r.talents.map(({sourceCandidates,...t})=>({...t,candidateCount:sourceCandidates.length,blackboardKeys:unique(sourceCandidates.flatMap(c=>(c.blackboard||[]).map(b=>b.key)))}))}));
 const compactEnemies=enemyRecords.map(e=>{
  const uniqueVariants=new Map();for(const v of e.variants){const key=digest(v.data);if(!uniqueVariants.has(key))uniqueVariants.set(key,{levels:[],sourceLevel:v.data.sourceLevel,contentDigest:key});uniqueVariants.get(key).levels.push(v.level);}
  return {...e,base:Object.fromEntries(['motion','applyWay','canAttack','sourceLevel','maxHp','atk','def','magicRes','attackTime','moveSpeed','attackSpeedAura','bombAttack'].map(k=>[k,e.base[k]])),
   variantSource:'web/source_battles.json#levels.<level>.enemies.'+e.id,variants:[...uniqueVariants.values()]};
 });
 let report={schemaVersion:1,scope:'local source snapshot; observed data/path presence is not semantic completion',sourceHashes:hashes,stats,operators:compactOperators,enemies:compactEnemies,slots,commonSkills:Object.fromEntries(commonSkills),tasks:reviewTasks};
 if(scopeSkillModes||scopeGarrisonBatches){
  // Update one explicit provider without declaring old shared-file receipts
  // revalidated. Historical task text, notes and basis stay byte-for-byte.
  const indexPath='docs/checklists/implementation-checklist.json';
  const old=JSON.parse(fs.readFileSync(path.join(root,indexPath),'utf8'));
  const batch=scopeGarrisonBatches?batchReport:null;
  if(scopeGarrisonBatches&&!batch)throw Error('Build the Garrison batch report before updating its checklist');
  const members=batch?[...batchSelection.values()]:live.skillModeSkills.flatMap(skillId=>skillModes.profiles[skillId].charIds.map(charId=>({charId,skillId,providers:['skill-modes']})));
  const ids=new Set(members.map(row=>row.skillId)),owners=new Set(members.map(row=>row.charId));
  const selectedTasks=new Set(),selectedSkills=new Map();
  for(const member of members){
   const prefix='op/'+member.charId+'/skill/'+member.skillId;
   selectedTasks.add(prefix);
   for(const provider of member.providers)selectedTasks.add(prefix+'/'+providerSuffix[provider]);
   if(!selectedSkills.has(member.charId))selectedSkills.set(member.charId,new Set());
   selectedSkills.get(member.charId).add(member.skillId);
  }
  const isSelected=id=>selectedTasks.has(id);
  const freshTaskIds=new Set(report.tasks.map(t=>t.id));
  for(const id of selectedTasks)if(!freshTaskIds.has(id))throw Error('Selected provider task was not generated: '+id);
  // Old tasks remain authoritative outside this exact member/provider set,
  // including historical tasks the full fresh generator no longer emits.
  const nextTaskMap=new Map(old.tasks.map(t=>[t.id,t]));
  for(const t of report.tasks)if(isSelected(t.id))nextTaskMap.set(t.id,t);
  const nextTasks=[...nextTaskMap.values()];
  function taskBlocks(text){const result=new Map(),lines=text.split('\n');for(let i=0;i<lines.length;i++){
   const m=/<!-- review:([^ ]+) basis:/.exec(lines[i]);if(!m)continue;
   const block=[lines[i]];while((lines[i+1]||'').startsWith('  - 记录：'))block.push(lines[++i]);result.set(m[1],block.join('\n'));
  }return result;}
  for(const p of Object.keys(files)){
   const prior=fs.readFileSync(path.join(root,p),'utf8');
   if(!p.endsWith('operator-checklist.md')&&!p.endsWith('library-checklist.md')){files[p]=prior;continue;}
   let text=prior;const blocks=taskBlocks(prior),freshBlocks=taskBlocks(files[p]);
   for(const [taskId,block]of freshBlocks)if(isSelected(taskId)){
    if(blocks.has(taskId))text=text.replace(blocks.get(taskId),block);
    else{
     const parentId=taskId.replace(/\/(?:source-body|source-mode-body|source-next-attack-body|source-direct-body)$/,''),parent=taskBlocks(text).get(parentId);
     if(parentId===taskId||!parent)throw Error('Missing parent for new scoped task '+taskId);
     text=text.replace(parent,block+'\n'+parent);
    }
   }
   for(const id of owners){
    const freshRow=files[p].split('\n').find(line=>line.startsWith('| ')&&line.includes('](#'+id+')'));
    if(freshRow)text=text.split('\n').map(line=>line.startsWith('| ')&&line.includes('](#'+id+')')?freshRow:line).join('\n');
   }
   files[p]=text;
  }
  const freshOperators=new Map(report.operators.map(o=>[o.id,o]));
  const scopedOperators=old.operators.map(o=>{
   if(!owners.has(o.id))return o;const fresh=freshOperators.get(o.id);
   return {...o,skills:o.skills.map(s=>selectedSkills.get(o.id)?.has(s.id)?fresh.skills.find(x=>x.id===s.id):s)};
  });
  const scopedStats={...old.stats};
  scopedStats.modeExplicitSkills=scopedOperators.filter(o=>o.scope==='mode').reduce((n,o)=>n+o.skills.filter(s=>s.explicitHandler).length,0);
  scopedStats.fixedExplicitSkills=scopedOperators.filter(o=>o.fixed).reduce((n,o)=>n+o.skills.filter(s=>s.explicitHandler).length,0);
  report={...old,stats:scopedStats,operators:scopedOperators,tasks:nextTasks,scopedAudits:{...old.scopedAudits,[batch?'garrisonBatches':'skillModes']:{
   skillIds:[...ids].sort(),charIds:[...owners].sort(),sourceFingerprint:batch?digest(batch.providers):skillModes.sourceFingerprint,
   sourceHashes:batch?{...skillModeBasis,...clientProgramBasis,...nextAttackBasis,...directBasis}:skillModeBasis,levelSourceHashes:levelBasis,
   memberProviders:members.map(({charId,skillId,providers})=>({charId,skillId,providers})),
   boundary:'Only exact operator/skill facts and the changed provider own source-body tasks were refreshed. Other provider tasks, unrelated character metadata, historical acceptance text, notes and basis remain unchanged; this run does not revalidate historical shared-code scopes.'}}};
  const readme='docs/checklists/README.md';
  files[readme]=files[readme].replace(/。\d+ 个技能有专用攻击\/元素\/公共技能处理器线索；/,'。'+scopedStats.modeExplicitSkills+' 个技能有专用攻击/元素/公共技能处理器线索；');
  const note=batch?'卫戍批量增量更新使用 `node tools/audit_implementation_checklist.js --scope-garrison-batches`：按批量回执只更新新绑定技能事实和各提供者的限定主体；旧人工记录、无关依据及未重验范围保持，机器索引 `scopedAudits.garrisonBatches` 保留输入摘要。':'技能模式增量更新使用 `node tools/audit_implementation_checklist.js --scope-skill-modes`（检查加 `--check`）：只刷新模式提供者的技能事实与独立 `source-mode-body`；其他历史验收原文、记录和依据摘要保留，本轮没有重新验证这些历史范围。机器索引 `scopedAudits.skillModes` 保存本组输入摘要。';
  if(!files[readme].includes(note))files[readme]=files[readme].trimEnd()+'\n\n'+note+'\n';
 }
 files['docs/checklists/implementation-checklist.json']=JSON.stringify(report,null,2)+'\n';
 for(const [p,text]of Object.entries(files)){
  const dest=path.join(outputRoot,p);if(check){if(!fs.existsSync(dest)||fs.readFileSync(dest,'utf8')!==text)throw Error('STALE '+p);}
  else {fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,text);}
 }
 console.log('IMPLEMENTATION CHECKLIST '+JSON.stringify({...report.stats,reviewTasks:report.tasks.length,mode:scopeSkillModes||scopeGarrisonBatches?'scoped provider facts/tasks; historical acceptances unchanged':'audit only; no game or package changes'}));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
