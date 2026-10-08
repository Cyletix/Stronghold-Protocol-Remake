'use strict';
// Read the actual enemy prefab components. Database moveSpeed alone is not a
// movement permission: these prefabs attach a permanent self-binding buff.
const fs=require('fs'),path=require('path'),crypto=require('crypto'),{spawnSync}=require('child_process');
const root=path.join(__dirname,'..');
const sourceFiles={handbook:'data/ArknightsGameData/zh_CN/gamedata/excel/enemy_handbook_table.json',database:'data/ArknightsGameData/zh_CN/gamedata/levels/enemydata/enemy_database.json',activity:'data/ArknightsGameData/zh_CN/gamedata/excel/activity_table.json'};
const read=f=>JSON.parse(fs.readFileSync(path.join(root,f),'utf8'));
const extract=String.raw`
import sys, json, zipfile, hashlib
sys.path.insert(0, 'tools')
from decompress_ab import parse_ab
from UnityPy.environment import Environment
from UnityPy.helpers.ImportHelper import parse_file
from UnityPy.streams import EndianBinaryReader
targets={'enm_pfb_18':['enemy_1521_dslily'], 'enm_pfb_28':['enemy_9013_acstmk'], 'enm_pfb_29':['enemy_9032_aclionk','enemy_9033_acdeer']}
def subset(obj, keys): return {k:obj[k] for k in keys if k in obj}
def short_buff(b): return subset(b,['buffKey','templateKey','attributes','lifeTimeType','durationKey','lifeTime','triggerLifeType','triggerCnt','triggerInterval','waitFirstTriggerInterval','firstTriggerInterval','blackboard'])
results={}
with zipfile.ZipFile('work/main.obb') as z:
 for group,names in targets.items():
  bundle='assets/AB/Android/battle/'+group+'.ab'; blob=z.read(bundle); env=Environment()
  for p,b in parse_ab(blob):
   if p.endswith('.resS'):continue
   f=parse_file(EndianBinaryReader(b),env,p);env.register_cab(p,f);env.files[p]=f
  objects={o.path_id:o for o in env.objects}
  def tree(pid):return objects[pid].read_typetree() if pid in objects else {}
  def pointer(p):return tree(p.get('m_PathID',0)) if p.get('m_FileID',0)==0 else {}
  def hierarchy(go):
   transform=next((pointer(c['component']) for c in go.get('m_Component',[]) if objects[c['component']['m_PathID']].type.name=='Transform'),{})
   names=[go.get('m_Name','')]
   while transform.get('m_Father',{}).get('m_PathID'):
    transform=pointer(transform['m_Father']);names.append(pointer(transform.get('m_GameObject',{})).get('m_Name',''))
   return '/'.join(reversed(names))
  for o in env.objects:
   if o.type.name!='GameObject':continue
   go=o.read_typetree()
   if go['m_Name'] not in names:continue
   record={'bundle':bundle,'bundleSha256':hashlib.sha256(blob).hexdigest(),'rootPathId':str(o.path_id),'collider':None,'commonBuffs':[],'attacks':[]}
   for component in go['m_Component']:
    ref=component['component'];pid=ref['m_PathID'];obj=objects[pid];t=tree(pid)
    if obj.type.name=='BoxCollider2D':record['collider']={'pathId':str(pid),**subset(t,['m_Size','m_Offset','m_IsTrigger'])}
    if obj.type.name=='Rigidbody2D':record['bodyType']=t['m_BodyType']
    if '_modes' not in t:continue
    record['controllerPathId']=str(pid)
    for ref in t.get('_commonAbilities',[]):
     ability=pointer(ref)
     for buff in ability.get('_buffs',[]):record['commonBuffs'].append({'pathId':str(ref['m_PathID']),**short_buff(buff)})
    for i,ref in enumerate(t['_modes']):
     mode=pointer(ref);attackRef=mode.get('_attack',{});attack=pointer(attackRef);selectorRef=attack.get('_selector',{});selector=pointer(selectorRef)
     # Preserve just the directly used fields. Full prefab trees remain in OBB.
     record['attacks'].append({'mode':i,'modePathId':str(ref['m_PathID']),'pathId':str(attackRef.get('m_PathID',0)),**subset(attack,['_animKey','_damageType','_atkScale','_attackType','_epDamageRatio']), 'buffs':[short_buff(b) for b in attack.get('_activeBuffs',[])], 'selector':{'pathId':str(selectorRef.get('m_PathID',0)),**subset(selector,['_postFilter','_maxNum','_limitTargetNum','_sortByTauntAtLast'])}})
   if go['m_Name']=='enemy_1521_dslily':
    record['specialSkills']={}
    record['phaseBindings']={}
    record['skillTriggers']={}
    for abilityObject in env.objects:
     if abilityObject.type.name!='MonoBehaviour':continue
     ability=abilityObject.read_typetree()
     abilityGo=pointer(ability.get('m_GameObject',{}));abilityName=abilityGo.get('m_Name','')
     if abilityName in ['GrowUp1','GrowUp2','AtkUp1','AtkUp2'] and '_buffs' in ability:
      parentPath=hierarchy(abilityGo)
      if parentPath.startswith('enemy_1521_dslily/'):
       record['phaseBindings'][abilityName]={'pathId':str(abilityObject.path_id),'hierarchy':parentPath,'metadata':ability.get('_metadata',{}),'buffs':[short_buff(b) for b in ability['_buffs']]}
     if abilityName not in ['Tidewater','TidewaterG1','TidewaterG2','Rockfall','RockfallG1','RockfallG2']:continue
     if not hierarchy(abilityGo).startswith('enemy_1521_dslily/'):continue
     if '_resetCdWaitFirstPeriod' in ability:
      record['skillTriggers'][abilityName]={'pathId':str(abilityObject.path_id),'hierarchy':hierarchy(abilityGo),**subset(ability,['_checkParentActive','_resetMainAbilityCdWhenCastEnd','_resetCdWaitFirstPeriod','_overwriteInitCooldown'])}
     if '_damageType' not in ability:continue
     selectorRef=ability.get('_selector',{});selector=pointer(selectorRef)
     record['specialSkills'][abilityName]={'pathId':str(abilityObject.path_id),**subset(ability,['_damageType','_elementDamageType','_atkScale','_atkScaleKey']), 'buffs':[short_buff(b) for b in ability.get('_activeBuffs',[])], 'selector':{'pathId':str(selectorRef.get('m_PathID',0)),**subset(selector,['_postFilter','_maxNum','_limitTargetNum'])}}
   results[go['m_Name']]=record
 # Only the two already referenced phase templates are exported. Their action
 # nodes identify the next code entry; serialization does not supply its body.
 bundle='assets/AB/Android/config/buff_template_holder.ab';blob=z.read(bundle);env=Environment()
 for p,b in parse_ab(blob):
  if p.endswith('.resS'):continue
  f=parse_file(EndianBinaryReader(b),env,p);env.register_cab(p,f);env.files[p]=f
 phaseTemplates={'bundle':bundle,'bundleSha256':hashlib.sha256(blob).hexdigest(),'templates':{}}
 for obj in env.objects:
  if obj.type.name!='MonoBehaviour':continue
  holder=obj.read_typetree()
  for index,template in enumerate(holder.get('_templates',[])):
   if template.get('templateKey') not in ['dslily_growup_hp_ratio','dslily_growup[countdown]']:continue
   phaseTemplates['holderPathId']=str(obj.path_id)
   phaseTemplates['templates'][template['templateKey']]={'index':index,'events':[{'eventKey':item['key'],'actions':json.loads(item['value']['SerializedState'])} for item in template['eventToActions']['_items']]}
 results['enemy_1521_dslily']['phaseTemplates']=phaseTemplates
print(json.dumps(results, ensure_ascii=True, sort_keys=True))
`;
const command=process.env.ARK_PYTHON||'python';
const result=spawnSync(command,['-c',extract],{cwd:root,encoding:'utf8',maxBuffer:8*1024*1024});
if(result.error||result.status!==0)throw Error('Boss prefab extraction failed: '+(result.error?.message||result.stderr));
const prefabs=JSON.parse(result.stdout),handbook=read(sourceFiles.handbook).enemyData,activity=read(sourceFiles.activity);
const db=new Map(read(sourceFiles.database).enemies.map(x=>[x.Key,x.Value]));
const profiles={},ids=['boss_1','boss_4','boss_6','boss_7','boss_8'];
function must(ok,message){if(!ok)throw Error(message);}
for(const bossId of ids){
 const mapped=activity.autoChessData.bossInfoDict[bossId],enemyId=mapped.enemyId,raw=db.get(enemyId)?.[0]?.enemyData;
 const prefabKey=raw?.prefabKey?.m_value,prefab=prefabs[prefabKey];must(prefab,'Missing prefab '+enemyId);
 const collider=prefab.collider;must(collider?.m_IsTrigger,'Missing target collider '+enemyId);
 // Flag 22 occurs in dslily_common_unmove / enemy_vtlionk_unmove and the
 // equivalent common buffs of the other audited bosses. Do not infer this for
 // unaudited enemy prefabs from low/zero speed or visual size.
 const bind=prefab.commonBuffs.find(b=>b.attributes?.abnormalFlags?.includes(22));must(bind,'Missing common self-binding '+enemyId);
 const entry=handbook[enemyId];must(entry?.abilityList,'Missing handbook '+enemyId);
 const profile={bossId,name:entry.name,prefabKey,movement:'fixed',hitbox:{width:collider.m_Size.x,height:collider.m_Size.y,offsetX:collider.m_Offset.x,offsetY:collider.m_Offset.y},evidence:{level:'Verified',prefab:prefab.bundle,rootPathId:prefab.rootPathId,colliderPathId:collider.pathId,commonBuffPathId:bind.pathId,commonBuffKey:bind.buffKey,handbook:sourceFiles.handbook+'#enemyData.'+enemyId+'.abilityList'}};
 const text=entry.abilityList.map(x=>x.text).join('\n');
 if(enemyId==='enemy_1521_dslily'){
  must(text.includes('同时攻击防御最高的两个单位'),'Quintus target description changed');
  const attacks=prefab.attacks;must(attacks.every(a=>a.selector._maxNum===2&&a.selector._postFilter===8&&a._damageType===1),'Quintus attack prefab changed');
  profile.attack={selection:'highestDefense',targets:2,damageType:'phys',damageDelay:attacks[0].buffs.find(b=>b.buffKey==='dslily_attack[damage]').triggerInterval};
  profile.skills={};
  for(const [name,ability]of Object.entries(prefab.specialSkills)){
   const tide=name.startsWith('Tidewater'),mode=name.endsWith('G2')?2:name.endsWith('G1')?1:0;
   must(tide?ability._damageType===2&&!ability.selector._limitTargetNum:ability._damageType===1&&ability.selector._postFilter===8,'Quintus skill prefab changed '+name);
   profile.skills[name]={mode,selection:tide?'all':'highestDefense',targets:tide?null:ability.selector._maxNum,damageType:tide?'arts':'phys',damageDelay:tide?0:ability.buffs.find(b=>b.buffKey==='dslily_rockfall[damage]').triggerInterval,elementType:tide?'nervous':null,sourcePathId:ability.pathId};
  }
  for(const[name,mode]of Object.entries({GrowUp1:'Default',GrowUp2:'G1',AtkUp1:'G1',AtkUp2:'G2'})){
   must(prefab.phaseBindings[name]?.hierarchy===`enemy_1521_dslily/Modes/${mode}/Talents/${name}`,'Quintus phase binding changed '+name);
  }
  const phaseActions=prefab.phaseTemplates.templates['dslily_growup_hp_ratio']?.events[0]?.actions;
  must(phaseActions?.[0]?.$type==='Torappu.Battle.Action.Nodes+HpRatioTrigger'&&phaseActions[0]._condType==='GT'&&phaseActions[1]?._restartFSM===true,'Quintus phase action chain changed');
  for(const[name,skill]of Object.entries(profile.skills))must(prefab.skillTriggers[name]?._checkParentActive===(skill.mode===0?0:1)&&prefab.skillTriggers[name]._resetCdWaitFirstPeriod===1&&prefab.skillTriggers[name]._overwriteInitCooldown===-1,'Quintus mode skill trigger changed '+name);
 }else if(enemyId.startsWith('enemy_9013_acstmk')){
  must(/随机选择目标/.test(text)&&/法术/.test(text),'Steam armour description changed');
  must(prefab.attacks[0]._damageType===2,'Steam armour attack type changed');
  profile.attack={selection:'random',targets:1,damageType:'arts'};
  profile.damageReduction={thresholdKey:'1.hp_ratio',scaleKey:'1.damage_scale',inclusive:false};
 }else if(enemyId==='enemy_9032_aclionk'){
  must(text.includes('生命值降至一半及以下时，防御力及法术抗性提升'),'Lion king condition changed');
  profile.defensePhase={thresholdKey:'advance.hp_ratio',defenseKey:'advance.def',resistanceKey:'advance.magic_resistance',inclusive:true};
 }
 profiles[enemyId]=profile;
}
const catalog={schemaVersion:1,generatedBy:'tools/build_boss_mechanics.js',sourceHashes:Object.fromEntries(Object.values(sourceFiles).map(f=>[f,crypto.createHash('sha256').update(fs.readFileSync(path.join(root,f))).digest('hex')])),profiles,prefabEvidence:prefabs};
const rows=Object.entries(profiles).map(([id,p])=>'| '+p.name+' / `'+id+'` | '+p.hitbox.width.toFixed(2)+' × '+p.hitbox.height.toFixed(2)+'，源偏移 ('+p.hitbox.offsetX+', '+p.hitbox.offsetY+') | '+(p.attack?.selection==='highestDefense'?'防御最高的2人，物理':p.attack?.selection==='random'?'随机1人，法术':'保留现有普攻；仅修固定站位和受击区')+' |');
const doc='# Boss机制：直接提取与执行边界\n\n生成：`node tools/build_boss_mechanics.js`；核对：追加 `--check`。\n\n[Verified] 本表直接读取 `work/main.obb` 内3个 enemy prefab AB 的根 BoxCollider2D、公共Buff和模式普通攻击组件，并以 enemy_database / enemy_handbook / activity 表确认敌人身份和规则语义。路径ID与被使用的原始字段在 `web/boss_mechanics.json.prefabEvidence`。仅导出少量组件字段，未复制AB。\n\n| 对象 | 受击矩形（格） | 本次普攻支持 |\n|---|---|---|\n'+rows.join('\n')+'\n\n以上5个逻辑敌人均保持源出场位置：prefab公共能力含持续的自缚标记，不能把 moveSpeed=0.1 或 1 当作允许沿路线行走。几何位置使用原始出场中心；源坐标向上为正，渲染数组坐标将 offsetY 取负。受击区域不是干员占格，不能把它改成实体墙或据此改变地图通行。隐秘核心胄与普通胄共享同一prefab，因此使用相同碰撞区；不照搬外部页面与本地prefab冲突的尺寸。\n\n[Verified] 昆图斯3个模式的普攻selector均为2目标、postFilter=8；图鉴明确防御最高的2个单位。普通攻击附带伤害Buff的延迟为0.4秒。胄普攻组件damageType=2，图鉴明确随机单体法术。胄只在当前关卡天赋黑板明确提供1.hp_ratio/1.damage_scale且血量低于门槛时减免物理/法术伤害；不会减免真实伤害。帝国余晖只在达到advance.hp_ratio时应用advance.def/advance.magic_resistance。各关卡可能覆写或清空这些黑板，不回填其他关卡数据。\n\n## 尚未完整执行\n\n- 昆图斯大潮、崩坍、子代、三阶段切换与神经损伤：已在AB找到模式、选择器、延迟Buff和动作节点，源技能CD也存在；需按模式关联后接入，不能将10个技能同时开启。\n- 胄召唤无人机、刺胄之弹、剑锤伤害传递：源分支和字段存在；还需接入分支波次/可攻击弹道生命周期。\n- 卫戍版萨米整列冰凌、半血列数变化：图鉴有行为描述，专属prefab为4.95×2.95；不能用普通萨米页面2.95×2.95的尺寸替代。列攻击时序及模式黑板覆写仍需绑定。\n- 帝国余晖装备活化与技能、其余Boss不在本次执行范围。\n\n上述缺口具有现成定向入口：继续解析同一prefab的_modes/_attack/_generalAbilities和对应GameObject组件；数值从当前关卡合并后的sourceSkills/sourceTalentBlackboard取，不从通用敌人数值覆盖。\n';
const finalDoc=doc.replace('## 尚未完整执行', '[Verified] 另已直接提取昆图斯大潮/崩坍各3模式的伤害组件和选择器：大潮全体法术，崩坍最高防御2/4/8目标并延迟1秒。运行期技能事件由当前关卡 sourceSkills 决定初始CD、周期CD、atk_scale、ep_damage_ratio；一次tick至多触发一个技能，并由引擎的 canCast 避免与普攻重叠。默认仅启用第一模式，显式 setMode 后重置新模式初始CD。技能图形/动画帧尚未复原，动作起始点沿用仿真调度约定。\n\n## 尚未完整执行').replace('- 昆图斯大潮、崩坍、子代、三阶段切换与神经损伤：已在AB找到模式、选择器、延迟Buff和动作节点，源技能CD也存在；需按模式关联后接入，不能将10个技能同时开启。','- 昆图斯三阶段自动切换尚未启用：GrowUp1/2 的buff绑定已找到，config/buff_template_holder.ab 里 dslily_growup_hp_ratio 使用 HpRatioTrigger 后 SwitchMode；精确阈值/切换时重置仍需核对，不能把后续模式技能全量常驻。\n- 子代是 dslily_dstnta 分支逐阶段 ACTIVATE_PREDEFINED trap_039_dstnta#1…#4，并非enemy SPAWN；仍缺预设装置激活、缠绕对象与生命期。神经损伤事件数值可输出，元素爆发仍沿用现有通用仿真。');
const phaseDoc='## 阶段切换：已缩小的证据缺口\n\n[Verified] 定向读取同一个昆图斯prefab及 `config/buff_template_holder.ab` 的两个模板；生成数据新增 `prefabEvidence.enemy_1521_dslily.phaseBindings / skillTriggers / phaseTemplates`，保留组件路径ID、父级路径和原始动作字段。\n\n- `Default/Talents/GrowUp1` 的HP触发Buff黑板为 `times=1, mode=1`；`G1/Talents/GrowUp2` 为 `times=2, mode=2`。二者调用 `HpRatioTrigger`，配置为 `condType=GT, hpRatioEachTime=0, useMinHpRatio=false`，通过后 `SwitchMode(loadModeFromBlackboard=true, restartFSM=true)`。数据没有序列化比较表达式的执行体，不能直接把0.33写成剩余血量阈值。\n- 两个倒计时Buff的 `triggerLifeType=1, triggerCnt=1, triggerInterval=-1`；GrowUp2另有 `durationKey=growup_duration`，GrowUp1为空。倒计时模板在事件2调用SwitchMode；当前单人源黑板给出 `growup1.interval=75, growup2.interval=200`；黑板如何将 `interval` / `growup_duration` 装配到实际Buff、第二次计时的起点仍须核实。\n- `AtkUp1`仅挂在G1，`AtkUp2`仅挂在G2；属性修正是 `attributeType=1, formulaItem=1, loadFromBlackboard=1`。当前单人关卡提供 `atkup1.atk=0.4, atkup2.atk=0.7`，不能将两个阶段的增益一起常驻。多人关卡显式清空天赋黑板，不回填单人参数。\n- 大潮/崩坍G1/G2模式的技能触发器均为 `checkParentActive=1, resetCdWaitFirstPeriod=1, overwriteInitCooldown=-1`，Default对应checkParentActive为0；现有显式 `setMode` 使用当前关卡对应技能的初始CD，G1为大潮15/崩坍4秒，G2为大潮1/崩坍13秒。切换动画、普攻状态机清理的精确过程尚未核对到相应原生执行体。\n\n[Inferred] 模式父级绑定支持“进入G1后才附着GrowUp2”和“各形态攻击增益互斥”；但这不足以证明倒计时装配或HP比较的边界。外部[PRTS昆图斯页](https://prts.wiki/w/昆图斯)的已损失生命值术语展开与简述不能消除该比较表达式歧义，因此未据此启用自动切换。\n\n可定向追踪 `Torappu.Battle.Action.Nodes+HpRatioTrigger` 的原生执行函数（黑板 `times/hp_ratio`、初始比例、GT边界），以及 `dslily_growup[countdown]` 的黑板装配和 `SwitchMode` 的首次附着重置逻辑。已有组件和方法索引可复用；共用触发器确认后可展开使用它的其他对象，顺序见[当前计划](../plan.md)。当前保留显式setMode，自动阶段尚未启用。\n\n';
const outputs={'web/boss_mechanics.json':JSON.stringify(catalog,null,2)+'\n','docs/generated/boss-mechanics.md':finalDoc.replace('## 尚未完整执行',phaseDoc+'## 尚未完整执行')};
for(const[file,body]of Object.entries(outputs)){const target=path.join(root,file);if(process.argv.includes('--check')){must(fs.existsSync(target)&&fs.readFileSync(target,'utf8')===body,file+' drift');}else fs.writeFileSync(target,body);}
console.log('BOSS MECHANICS '+Object.keys(profiles).length+' verified prefab profiles');
