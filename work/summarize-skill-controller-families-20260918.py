"""Classify an already-frozen structural pass, without rereading source graphs."""
import collections,hashlib,json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];W=ROOT/'work'
closure=W/'skill-controller-public-closures-20260918.json'
if not closure.exists():
 closure.write_bytes((W/'skill-controller-public-families-20260918.json').read_bytes())
data=json.loads(closure.read_text(encoding='utf-8'));members=data['members']
VISUAL={'UberEffectEmitter','MultiHitUberEffectEmitter','ReadySkillEffect','AnimationEmitBehaviour','ChannelingEffectEmitter','RangeEffectEmitter','ChannelingEffectGroupEmitter'}
def short(x):return x.split('.')[-1].split('+')[-1]
def projectile_dependency(value):
 detail=value.get('detail',value['status'])
 return (value.get('reason','accepted'),detail.split(': ',1)[1] if detail.startswith('projectile_') and ': ' in detail else detail)
def family(m):
 t=set(m['rootComponentTypes']);e=set(m['eventActionTypes']);rep=bool(t&{'ReplacementSkill','ReplacementSkillFixed'})
 if rep:
  if 'ThreePartChannelingAnimation' in t:return 'replacement-channel-projectile'
  if t&{'AbilitySelectableGroup','AbilitySequenceGroup','AbilityParallelGroup'}:return 'replacement-composite-action-graph'
  if t&{'RangedHeal','Heal'}:return 'replacement-heal-plus-events'
  if any('Funnel' in s or 'Boomberang' in s for s in t):return 'replacement-autonomous-projectile'
  if 'Knockback' in e or 'DragTowardSource' in e:return 'replacement-forced-movement'
  if e:return 'replacement-hit-or-owner-event-closure'
  return 'replacement-selector-projectile-or-direct-action'
 if t&{'AbilitySequenceGroup','AbilityParallelGroup','AbilityFirstSucceedGroup','AbilitySelectableGroup'}:return 'cast-composite-action-graph'
 if 'ChannelingMeleeAttack' in t:return 'continuous-channel-attack'
 if 'ThreePartChannelingAnimation' in t:
  if 'RangedAttack' in t:return 'cast-channel-projectile'
  if e<={'SwitchMode'}:return 'channel-mode-or-heal-selection'
  return 'channel-mode-with-events'
 if 'BuffAfterAffecting' in t and t-VISUAL<={'CastSkill','ActiveBuffAbility','BuffAfterAffecting'} and e<={'SwitchMode'}:return 'mode-with-after-effect-status'
 if any('Token' in s or 'Trap' in s for s in t):return 'token-or-trap-controller'
 if any('Suspendable' in s for s in t):return 'suspendable-mode-controller'
 if 'BurstCastSkill' in t or 'BurstAttackGroup' in t:return 'burst-overload-controller'
 if 'CastSkillWithLimitTimes' in t:return 'finite-ammo-with-event-counter'
 if any('ToggleSkill' in s for s in t):
  return 'toggle-mode-with-events' if e else 'toggle-mode-attributes'
 if 'PassiveSkill' in t:return 'passive-event-effect' if e else 'passive-attribute-or-hit-buff'
 if 'AttachOrDetachSkill' in t:return 'attach-detach-mode-and-event'
 if 'MultiAppearSkill' in t:return 'repeated-deployment-controller'
 if 'BuffDuringSkill' in t:
  if 'CompareCharSkillAvailableCnt' in e:return 'charged-skill-buff-and-mode'
  if any(s.startswith('TriggerAbility') for s in e):return 'skill-owned-named-ability-events'
  return 'skill-owned-state-events'
 if 'PassiveBuffAbility' in t:return 'cast-plus-passive-event-carrier'
 if e:return 'cast-buff-event-tree'
 return 'direct-selector-action-graph'
LABELS={
 'replacement-channel-projectile':'下一击三段引导与牵引弹体',
 'replacement-composite-action-graph':'下一击并行/选支动作图',
 'replacement-heal-plus-events':'下一次治疗与额外治疗/特性事件',
 'replacement-autonomous-projectile':'下一击自主/回旋弹体',
 'replacement-forced-movement':'下一击强制位移命中',
 'replacement-hit-or-owner-event-closure':'下一击命中/自身事件（按子合同再分）',
 'replacement-selector-projectile-or-direct-action':'下一击选择器/弹体/直接动作缺口',
 'cast-composite-action-graph':'施放时有序/并行/选支动作调度',
 'continuous-channel-attack':'持续引导攻击与施法期Buff',
 'cast-channel-projectile':'主动三段引导与专属弹体',
 'channel-mode-or-heal-selection':'三段引导模式/治疗选择',
 'channel-mode-with-events':'三段引导模式及事件树',
 'mode-with-after-effect-status':'模式技能结束后附加状态',
 'token-or-trap-controller':'召唤/装置及宿主控制',
 'suspendable-mode-controller':'可停止/过载模式控制器',
 'burst-overload-controller':'爆发弹药与过载控制器',
 'finite-ammo-with-event-counter':'有限弹药与附加事件计数',
 'toggle-mode-with-events':'切换技能与特殊事件',
 'toggle-mode-attributes':'切换技能与持续属性',
 'passive-event-effect':'被动技能与伤害/倍率事件',
 'passive-attribute-or-hit-buff':'被动技能属性或命中Buff',
 'attach-detach-mode-and-event':'挂载/卸载技能与模式事件',
 'repeated-deployment-controller':'重复部署技能控制器',
 'charged-skill-buff-and-mode':'蓄力档位判断与Buff模式切换',
 'skill-owned-named-ability-events':'技能寿命内命名能力事件',
 'skill-owned-state-events':'技能寿命内状态事件',
 'cast-plus-passive-event-carrier':'主动技能加被动事件载体',
 'cast-buff-event-tree':'主动技能Buff事件树',
 'direct-selector-action-graph':'直接施放选敌/投递动作图'}
families=collections.defaultdict(list);subgroups=collections.defaultdict(list)
for sid,m in members.items():
 f=family(m);m['family']=f;families[f].append(sid)
 semantic={'components':sorted(set(m['rootComponentTypes'])-VISUAL),'events':m['eventActionTypes'],
  'selectedModeBodies':sorted({s for mode in m['selectedModes'] if mode['index']>0 for s in mode['roles']['_attack'] if s not in VISUAL}),
  'projectileDependencies':sorted({projectile_dependency(p) for p in m['projectiles'].values()})}
 h=hashlib.sha256(json.dumps(semantic,sort_keys=True).encode()).hexdigest();m['semanticSubgroup']=h
 subgroups[(f,h)].append(sid)
compact={}
for sid,m in members.items():
 deps=[]
 t=set(m['rootComponentTypes']);events=m['eventActionTypes']
 if t&{'AbilitySequenceGroup','AbilityParallelGroup','AbilityFirstSucceedGroup','AbilitySelectableGroup'}:deps.append('ordered/parallel/conditional subability scheduling and cancellation')
 if 'ThreePartChannelingAnimation' in t:deps.append('begin/loop/end event gating and exact source controller flags')
 if any(p['status']!='accepted-existing-simple-projectile' for p in m['projectiles'].values()):deps.append('complete specialized projectile semantics')
 if events:deps.append('all Buff event actions and ownership/cleanup, not just component type')
 if any(a.startswith('TriggerAbility') for a in events):deps.append('named ability target/blackboard and referenced body closure')
 if m['selectedModes']:deps.append('selected mode actor/selector/general ability and transition contract')
 deps.append('all source-level blackboard keys and controller semantics')
 compact[sid]={k:m[k] for k in ['skillId','charId','name','skillName','fixed','legacyExplicitHandler','netNewCandidate','family','semanticSubgroup','source','sourceLevelCount','rootComponentTypes','eventActionTypes','projectiles','completeFollowingGates']}
 compact[sid]['buffTemplateKeys']=sorted(m['buffClosure']['templates'])
 compact[sid]['selectedModeBodies']=[{'index':x['index'],'roles':x['roles'],'generalComponents':x['generalComponents']} for x in m['selectedModes']]
 compact[sid]['dependencies']=deps;compact[sid]['closurePointer']='work/'+closure.name+'#/members/'+sid
family_rows=[]
for f,ids in sorted(families.items(),key=lambda x:(-sum(members[s]['netNewCandidate'] for s in x[1]),x[0])):
 net=[s for s in ids if members[s]['netNewCandidate']]
 subs=[{'id':h,'skillIds':sids,'netNewCandidateCount':sum(members[s]['netNewCandidate'] for s in sids)} for (ff,h),sids in subgroups.items() if ff==f]
 family_rows.append({'id':f,'label':LABELS[f],'count':len(ids),'netNewCandidateCount':len(net),'fixedNetNewCount':sum(members[s]['fixed'] for s in net),
  'skillIds':ids,'netNewSkillIds':net,'semanticSubgroups':subs,'distinctCompleteClosureSignatures':len({members[s]['closureSignature'] for s in ids}),
  'currentlyBindable':0,'readiness':'dependency family; every nested source-field, event and payload gate still applies'})
cross={}
for label,check in {
 'three-part-channeling':lambda m:'ThreePartChannelingAnimation' in m['rootComponentTypes'],
 'replacement-controllers':lambda m:bool({'ReplacementSkill','ReplacementSkillFixed'}&set(m['rootComponentTypes'])),
 'skill-lifetime-buff':lambda m:'BuffDuringSkill' in m['rootComponentTypes'],
 'ability-composition':lambda m:bool({'AbilitySequenceGroup','AbilityParallelGroup','AbilityFirstSucceedGroup','AbilitySelectableGroup'}&set(m['rootComponentTypes'])),
 }.items():
 ids=[s for s,m in members.items() if check(m)]
 cross[label]={'count':len(ids),'netNewCandidateCount':sum(members[s]['netNewCandidate'] for s in ids),'skillIds':ids,
  'families':dict(collections.Counter(members[s]['family'] for s in ids)),
  'semanticSubgroupCount':len({members[s]['semanticSubgroup'] for s in ids}),
  'currentlyBindable':0}
recommendations=[]
for fid,ability,why in [
 ('cast-composite-action-graph','共享有序/并行/首成功/选支 Ability 图 IR 与执行游标','覆盖最多净新增候选的控制器基础。复用已解析 direct action、属性Buff、选择器和现有投递；先以全部叶子已支持的子图筛入。其余命名能力、token、位移和自定义节点继续整图拒绝。'),
 ('charged-skill-buff-and-mode','CompareCharSkillAvailableCnt 蓄力档位快照与派生Buff所有权','5项都有实际蓄力条件图，而非只叫BuffDuringSkill：卡涅利安S1/S2/S3、灵知S2、流明S2。可共用档位判定/耗SP/派生Buff清理；卡涅利安S3层数伤害、灵知冷冻组合、流明异常治疗仍是各自必过叶子门，不能宣称一次接通5项。'),
 ('mode-with-after-effect-status','BuffAfterAffecting 完整技能结束生命周期与自身异常状态','当前最窄、风险最低的3项净新增结构组；都保留完整SwitchMode与基本Melee主体。仍须校验字段、全部黑板和结束/中断语义，3不是已可直接绑定数。'),
 ]:
 row=next((f for f in family_rows if f['id']==fid),None)
 if row:recommendations.append({'family':fid,'minimalSharedCapability':ability,'netNewCandidateCount':row['netNewCandidateCount'],
  'skillIds':row['netNewSkillIds'],'currentlyBindable':0,'reason':why,
  'completeDependencies':sorted({x for sid in row['netNewSkillIds'] for x in compact[sid]['dependencies']})})
out={'schemaVersion':1,'rule':data['rule'],'date':data['date'],'inputs':data['inputs'],
 'closureArtifact':{'path':'work/'+closure.name,'sha256':hashlib.sha256(closure.read_bytes()).hexdigest(),
  'componentCount':len(data['componentDictionary']),'resolvedBuffCount':len(data['buffDictionary']),'templateCount':len(data['templateDictionary'])},
 'scope':data['scope'],'boundaries':data['boundaries'],
 'exclusiveFamilies':family_rows,'crossCuttingControllerGroups':cross,'recommendations':recommendations,'members':compact,
 'validation':{'uniqueAssignments':len(compact),'assignedOnce':len({s for f in family_rows for s in f['skillIds']})==len(compact),
  'familySum':sum(f['count'] for f in family_rows),'netNewFamilySum':sum(f['netNewCandidateCount'] for f in family_rows),
  'runtimeEdits':0,'compilerEdits':0,'generatedDataEdits':0,'sourceClosurePasses':1,
  'noReadyClaim':'No skill is marked executable by this classification. Shared controller incidence is only an upper bound.'}}
(W/'skill-controller-public-families-20260918.json').write_text(json.dumps(out,ensure_ascii=False,separators=(',',':'))+'\n',encoding='utf-8')
lines=['# 卫戍控制器公共能力族（2026-09-18）','',
 '本表只分类，不计新增接入。使用已有缓存做一次结构展开；没有重新解包、原生扫描或改编译器/运行时。','',
 f"首拒绝 `unsupported-skill-companions` 共 {data['scope']['firstRejectedSkills']} 项；排除四提供者已绑定 {len(data['scope']['excludedFourProviders'])} 项，分类 {len(compact)} 项。另有旧专用处理器 {len(data['scope']['legacyExplicitMembers'])} 项，计迁移、不计新增；净新增候选 {data['scope']['netNewCandidateCount']} 项。",'',
 '旧 24 项分类仍引用 `skill-next-public-families-20260918.json`，与本次首拒绝集合交集为 0，未重复计算收益。', '',
 '## 结论','',
 '最大共用基础是有序/并行/选支能力图的调度与完整叶子节点审查，不能把同名根组件当作已经闭合。当前没有证据支持“补一个控制器即可直接接通至少 5 项”；已证明可立即接通数保持 0。最窄的下一实施组是模式结束后自身状态（极光 S1、远山 S2、雷蛇 S2），可先对整组做完整字段编译。','',
 '## 互斥能力族','', '| 能力族 | 全部候选 | 净新增候选 | 后续语义子组 |','|---|---:|---:|---:|']
for f in family_rows:lines.append(f"| {f['label']} | {f['count']} | {f['netNewCandidateCount']} | {len(f['semanticSubgroups'])} |")
lines+=['','## 三段引导与下一击的真实范围','']
for key in ['three-part-channeling','replacement-controllers','skill-lifetime-buff','ability-composition']:
 x=cross[key];lines.append(f"- `{key}`：{x['count']} 项，净新增候选 {x['netNewCandidateCount']} 项，分成 {x['semanticSubgroupCount']} 个后续语义子组；单独补根控制器的可立即接通数未证明。")
lines+=['','三段引导中，持续引导近战、牵引弹体、模式治疗、命名能力事件不是同一个实现。下一击中，治疗特性/元素治疗、位移、链或回旋弹体、命中Buff事件、子能力选支各有独立闭合门。原先“27/28”不能直接用作这次净新增数字。','','## 推荐入口','']
for i,r in enumerate(recommendations,1):
 lines += [f"{i}. **{r['minimalSharedCapability']}**：覆盖上界 {r['netNewCandidateCount']} 个净新增候选。{r['reason']}",
  '   成员：'+', '.join(r['skillIds']),
  '   仍缺：'+'；'.join(r['completeDependencies'])]
lines+=['','## 使用方式','',
 '后续只按机器表 `exclusiveFamilies` 和每个成员的 `completeFollowingGates` 推进。`componentDictionary` / `buffDictionary` / `templateDictionary` 在冻结的 closures 文件，成员以 SHA 和 JSON 指针关联；无需再打开每个原始 prefab。','',
 '命名能力/外部引用、源黑板完整消费、专属弹体和选中模式的未支持图均保留拒绝门；结构分类没有运行完整反事实编译，也不能替代实际行为与主机恢复验收。']
(W/'skill-controller-public-families-20260918.md').write_text('\n'.join(lines)+'\n',encoding='utf-8')
print(json.dumps({'families':len(family_rows),'crossCutting':{k:{x:v[x] for x in ['count','netNewCandidateCount','semanticSubgroupCount']} for k,v in cross.items()},
 'recommendations':[(r['family'],r['netNewCandidateCount']) for r in recommendations],'validation':out['validation']},ensure_ascii=False))
