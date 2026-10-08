'use strict';
// Compile the one inspected activation-stack graph, shared by normal/golden knives.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=path.join(__dirname,'..'),files={activity:'data/ArknightsGameData/zh_CN/gamedata/excel/activity_table.json',prefab:'work/client-logic/bundles/battle/prefabs/[uc]globalbuffs.ab.json',templates:'work/client-logic/buff-templates.json',scripts:'work/client-logic/script-types.json'};
const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8')),hash=v=>crypto.createHash('sha256').update(v).digest('hex');
const bundle=read(files.prefab),templates=read(files.templates),scripts=read(files.scripts).matches.find(x=>x.cab==='CAB-658d74aab777086fc32b93f385be999a');
const objectId='4692246910491776102',componentId='7994553950927869030',go=bundle.nodes[objectId],component=bundle.nodes[componentId],f=component.fields;
assert.equal(go.fields.m_Name,'act1vautochess_equip_acarm024_global_buff');assert.equal(go.fields.m_IsActive,true);
assert.ok(go.fields.m_Component.some(x=>x.component.m_FileID===0&&x.component.m_PathID===componentId));
assert.equal(f.m_GameObject.m_PathID,objectId);assert.equal(f.m_Enabled,1);assert.equal(f.m_Script.m_FileID,1);
assert.ok(Object.values(bundle.externals).every(x=>x[0].endsWith('/'+scripts.cab)));
assert.equal(scripts.scripts[f.m_Script.m_PathID].m_ClassName,'GlobalBuff');assert.equal(scripts.scripts[f.m_Script.m_PathID].m_Namespace,'Torappu.Battle');
assert.equal(f._buffs.length,1);const host=f._buffs[0];assert.equal(host.templateKey,'act1vautochess_acarm024_buff');
for(const [k,v]of Object.entries({loadFromDB:0,isDurableBuff:0,isSilenceable:0,isStunnable:0,isFreezable:0,lifeTimeType:2,maxStackCnt:1,disableOverride:1}))assert.equal(host[k],v,k);
assert.deepEqual(host.attributes.attributeModifiers,[]);assert.deepEqual(host.attributes.abnormalFlags,[]);
assert.deepEqual(host.blackboard.map(b=>[b.key,b.value]),[['buff_cnt',0],['basic_add',1]]);
const template=templates[host.templateKey],events=template.eventToActions._items;assert.equal(events.length,1);assert.equal(events[0].key,33);
const a=events[0].value.decodedActions,kind=x=>x.$type.split('+').at(-1);
assert.deepEqual(a.map(kind),['Dice','FilterByBlackboardValue','CreateBuff','CalculateBlackboardValueViaParams','FilterByBlackboardValue','AutoChessLogExtraBattleInfo','CreateEffect','PlayAudio']);
assert.deepEqual(a[0],{_probKey:'prob',$type:'Torappu.Battle.Action.Nodes+Dice'});
assert.deepEqual(a[1],{_targetType:'BUFF_OWNER',_anotherBuff:false,_buffKey:null,_blackboardKey:'buff_cnt',_valueToCompare:0,_anotherKeyToCompare:'atk_buff_cnt',_condType:'LT',$type:'Torappu.Battle.Action.Nodes+FilterByBlackboardValue'});
assert.equal(a[2]._buffOwner,'BUFF_OWNER');assert.equal(a[2]._isDerivedBuff,false);assert.equal(a[2]._useSpecialBuffSource,false);
assert.equal(a[2]._finishDerivedBuffIfParentFinish,false);
const child=a[2]._buff;
assert.deepEqual(child.attributes.attributeModifiers,[{attributeType:'ATK',formulaItem:'MULTIPLIER',value:0,loadFromBlackboard:true,fetchBaseValueFromSourceEntity:false}]);
assert.deepEqual(child.attributes.abnormalFlags,[]);assert.deepEqual(child.blackboard,[]);
for(const [k,v]of Object.entries({buffKey:'acarm_024_buff[atk]',templateKey:'empty',loadFromDB:false,isDurableBuff:false,isSilenceable:false,isStunnable:false,isFreezable:false,lifeTimeType:'INFINITY',triggerLifeType:'IMMEDIATELY',maxStackCnt:10,disableOverride:true,independentCharacterSource:false,maxValidStackCnt:-1,overrideOnEventPriority:false,onEventPriority:'DEFAULT'}))assert.equal(child[k],v,k);
assert.deepEqual(a[3],{_inputKey:'buff_cnt',_outputKey:'buff_cnt',_multiplyParamKey:null,_dividedParamKey:null,_useRemainder:false,_addParamKey:'basic_add',_minusParamKey:null,_minValueKey:null,_maxValueKey:null,_finalAbs:true,_finalCeil:false,_finalFloor:false,_finalRound:false,_useAbilityBlackboard:false,_abilityName:'',$type:'Torappu.Battle.Action.Nodes+CalculateBlackboardValueViaParams'});
assert.deepEqual(a[4],{_targetType:'BUFF_OWNER',_anotherBuff:false,_buffKey:null,_blackboardKey:'buff_cnt',_valueToCompare:0,_anotherKeyToCompare:'get_gold_cnt',_condType:'EQUALS',$type:'Torappu.Battle.Action.Nodes+FilterByBlackboardValue'});
assert.equal(a[5]._key,'acarm024_gold');assert.equal(a[5]._targetType,'BUFF_OWNER');assert.equal(a[6]._targetType,'BUFF_OWNER');assert.equal(a[7]._target,'BUFF_OWNER');
const data={version:1,aliases:{yan_dagger:'eff_acarm040',eff_acarm040:'eff_acarm040',eff_acgarm040:'eff_acgarm040'},source:{client:'JP 36.7.22',bundle:bundle.bundle,bundleSha256:bundle.sha256,objectId,componentId,script:f.m_Script,componentSha256:hash(JSON.stringify(component)),template:host.templateKey,templateSha256:hash(JSON.stringify(template)),event:{name:'ON_SKILL_START',value:33},native:{characterOnSkillStart:63706,diceNode:81609,diceFP:19824,diceFloat:19823,blackboardFilter:79778,blackboardIncrement:78955}},bindingSource:{path:files.activity,sha256:hash(fs.readFileSync(path.join(root,files.activity)))},seasons:{}};
for(const [sid,season]of Object.entries(read(files.activity).activity.AUTOCHESS_SEASON)){
 const profiles={};
 for(const [id,atk]of [['eff_acarm040',.05],['eff_acgarm040',.08]]){
  const effect=season.effectBuffInfoDataDict[id];assert.equal(effect.length,1);assert.equal(effect[0].key,'env_gbuff_new_with_verify');assert.equal(effect[0].countType,'COUNTING');
  const bb=Object.fromEntries(effect[0].blackboard.map(b=>[b.key,b.valueStr??b.value]));assert.deepEqual(bb,{key:go.fields.m_Name,prob:1,atk,atk_buff_cnt:10});
  // No get_gold_cnt override: after increments 1..10, the trailing equality
  // against the missing-key fallback zero cannot enter the logging/VFX branch.
  const isGolden=id==='eff_acgarm040';const rows=Object.values(season.trapChessDataDict).filter(x=>x.effectId===id);assert.ok(rows.length);assert.ok(rows.every(x=>x.isGolden===isGolden));
  profiles[id]={atkPerStack:bb.atk,probability:bb.prob,maxStacks:bb.atk_buff_cnt,initialStacks:0,increment:1,isGolden,shopIds:rows.map(x=>x.chessId).sort()};
 }
 data.seasons[sid]=profiles;
}
data.boundary='Single equipped normal/golden knife, successful ON_SKILL_START, subsequent attack multiplier additions and non-durable deployment lifetime. Dice draws before the cap test, even at probability 1 and max stacks. Native BasicSkill Cast/OnSkillStart bodies are protected: same-cast instantaneous damage ordering and other event priorities are not recovered. Multiple equipped knives use one local profile chosen by slot order; original COUNTING/duplicate registration is unresolved. JP graph and CN season values remain separate sources.';
const text='// Generated by tools/build_equip_skill_stacks.js\n(function(root){root.ArkEquipSkillStacksData='+JSON.stringify(data)+';})(typeof window!==\'undefined\'?window:globalThis);\n',out=path.join(root,'web/equip-skill-stacks-data.js');
if(process.argv.includes('--check'))assert.equal(fs.readFileSync(out,'utf8'),text,'STALE equip-skill-stacks-data.js');else fs.writeFileSync(out,text);
console.log('PASS equip skill stacks: one source graph, normal/golden profiles in two CN seasons, 5%/8% x 10');
