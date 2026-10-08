'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=path.join(__dirname,'..'),files={scripts:'work/client-logic/script-types.json',templates:'work/client-logic/buff-templates.json',database:'data/ArknightsGameData/zh_CN/gamedata/levels/enemydata/enemy_database.json'};
for(const i of [18,28,29])files['prefab'+i]='work/client-logic/bundles/battle/enm_pfb_'+i+'.ab.json';
const read=f=>JSON.parse(fs.readFileSync(path.join(root,f),'utf8'));
const scripts=read(files.scripts).matches.find(x=>x.cab==='CAB-658d74aab777086fc32b93f385be999a');assert.ok(scripts);
const templates=read(files.templates),wanted={enemy_1521_dslily:[18,'-6119291241878305267'],enemy_9013_acstmk:[28,'8917350904993237303'],enemy_9014_acstma:[28,'1389324337505877145'],enemy_9015_acstmb:[28,'-2621127885642982811'],enemy_9017_achunt:[28,'-2443645408120409948'],enemy_9018_actrpa:[28,'-77328028347945273'],enemy_9019_actrpb:[28,'5414177585931266297'],enemy_9020_actrpc:[28,'-7797771213659267664'],enemy_9033_acdeer:[29,'-8004128765363502733']};
const data={version:1,client:'JP 36.7.22',native:{property:'Torappu.Battle.Entity.isBlockFree',rva:'0x4e05f48',flag:'BLOCK_FREE',flagValue:3},sources:Object.fromEntries(Object.entries(files).map(([k,f])=>[k,{path:f,sha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(root,f))).digest('hex')}])),enemies:{}};
const bundles={};
for(const [id,[part,componentId]] of Object.entries(wanted)){
 const bundle=bundles[part]||=read(files['prefab'+part]),nodes=bundle.nodes;
 assert.ok(Object.values(bundle.externals).every(list=>list[0].endsWith('/'+scripts.cab)));
 const common=nodes[componentId],fields=common.fields,script=scripts.scripts[fields.m_Script.m_PathID];
 assert.equal(fields.m_Enabled,1);assert.equal(fields.m_Script.m_FileID,1);assert.equal(script.m_ClassName,'PassiveBuffAbility');assert.equal(script.m_Namespace,'Torappu.Battle.Abilities');
 const owners=Object.values(nodes).filter(n=>n.fields._commonAbilities?.some(r=>r.m_FileID===0&&r.m_PathID===componentId));
 assert.equal(owners.length,1);const owner=owners[0],go=nodes[owner.fields.m_GameObject.m_PathID];assert.equal(go.fields.m_Name,id);assert.equal(go.fields.m_IsActive,true);
 const parents=Object.fromEntries(Object.values(nodes).filter(n=>n.unityType==='Transform').map(n=>[n.fields.m_GameObject.m_PathID,n.fields.m_Father.m_PathID]));
 const ancestry=[];let object=fields.m_GameObject.m_PathID;
 while(object&&object!=='0'){assert.equal(nodes[object].fields.m_IsActive,true);ancestry.unshift(nodes[object].fields.m_Name);object=nodes[parents[object]]?.fields.m_GameObject.m_PathID;}
 assert.equal(ancestry[0],id);
 const buffs=fields._buffs.filter(b=>b.attributes.abnormalFlags.includes(3));assert.equal(buffs.length,1);const buff=buffs[0];
 assert.equal(buff.loadFromDB,0);assert.equal(buff.lifeTimeType,2);assert.equal(buff.isSilenceable,0);assert.equal(buff.isStunnable,0);assert.equal(buff.isFreezable,0);
 assert.ok(templates[buff.templateKey]);
 // These source graphs never finish this host buff. The two separately verified
 // ON_TAKE_DAMAGE transfers and the achunt death cleanup are compiled below.
 const graph=JSON.stringify(templates[buff.templateKey].eventToActions);
 assert.ok(!graph.includes('FinishHostBuff')&&!graph.includes('FinishBuffsById')&&!graph.includes('RemoveAbnormalFlag'));
 data.enemies[id]={blockFree:true,rootComponent:owner.pathId,component:componentId,componentPath:ancestry.join('/'),script:fields.m_Script,buffKey:buff.buffKey,templateKey:buff.templateKey,sourceFlags:buff.attributes.abnormalFlags,isSilenceable:false,bundle:bundle.bundle};
}
assert.equal(Object.keys(data.enemies).length,9);
const rows=read(files.database).enemies,boss=rows.find(x=>x.Key==='enemy_9013_acstmk').Value[0].enemyData;
assert.equal(boss.levelType.m_value,'BOSS');assert.equal(boss.levelType.m_defined,true);
data.enemies.enemy_9013_acstmk.levelType='BOSS';
const nodeType=f=>{assert.equal(f.m_Script.m_FileID,1);return scripts.scripts[f.m_Script.m_PathID]?.m_ClassName;};
const events=key=>templates[key].eventToActions._items;
for(const [id,abilityId,selectorId,inputTarget] of [
 ['enemy_9014_acstma','3944669344605781145','6828043281619139737','BUFF_OWNER'],
 ['enemy_9015_acstmb','3377172491615738469','-7558068246298813851','TARGET']
]){
 const profile=data.enemies[id],nodes=bundles[28].nodes,owner=nodes[profile.rootComponent],ability=nodes[abilityId],selector=nodes[selectorId];
 const parents=Object.fromEntries(Object.values(nodes).filter(n=>n.unityType==='Transform').map(n=>[n.fields.m_GameObject.m_PathID,n.fields.m_Father.m_PathID]));
 for(const component of [ability,selector]){let object=component.fields.m_GameObject.m_PathID,last;while(object&&object!=='0'){assert.equal(nodes[object].fields.m_IsActive,true);last=nodes[object].fields.m_Name;object=nodes[parents[object]]?.fields.m_GameObject.m_PathID;}assert.equal(last,id);}
 assert.ok(owner.fields._commonAbilities.some(p=>p.m_FileID===0&&p.m_PathID===abilityId));
 assert.equal(ability.fields.m_Enabled,1);assert.equal(nodeType(ability.fields),'EmptyAbility');assert.equal(ability.fields._metadata.namedAsAlias,'BossSelector');assert.equal(ability.fields._metadata.blackboardPrefix,'');
 assert.deepEqual(ability.fields._selector,{m_FileID:0,m_PathID:selectorId});assert.equal(selector.fields.m_Enabled,1);assert.equal(nodeType(selector.fields),'AdvancedSelectorWithEnemyOptions');
 const expectedSelector={_targetSide:1,_targetMotion:3,_targetCategory:1,_postFilter:4,_ignoreTargetFree:0,_onlyIgnoreSomeOfTargetFreeCase:0,_abnormalFlag:42,_abnormalCombo:2,_ignoreAllyTargetFree:0,_ignoreHealFree:0,_forceIgnoreCamouflage:0,_needProfessionMask:0,_professionMask:0,_limitTargetNum:1,_maxTargetKey:'max_target',_maxNum:1,_excludeOwner:0,_sortByTauntAtLast:0,_ignoreHitRange:0,_checkUnitType:0,_unitTypeMask:0,_abilityInputTargetAsSortSource:0,_enemyLevelMask:4,_motionMask:3,_allowNoneApplyWay:1,_applyWay:3,_filterByEnemiesKey:0,_filterEnemyKeyMode:0,_enemyKey:'',_filterByEnemiesMode:0,_filterByEnemiesTag:0,_enemyMode:0,_enemyTag:'',_excludeDisappeared:0,_excludeInCombat:0,_filterBuff:1,_buffKeyExcluded:0,_buffKey:'acstmk_passive',_checkReachableToOwner:0,_avoidObstacleLike:0,_filterUnbalance:0,_filterNotInUnbalance:0,_filterAbnormalImmune:0,_abnormalFlagImmune:42,_filterEnemyMassLevel:0,_massCompareType:0,_massLevel:0};
 const {m_GameObject,m_Enabled,m_Script,m_Name,...selectorFields}=selector.fields;assert.deepEqual(selectorFields,expectedSelector);
 const go=nodes[m_GameObject.m_PathID];assert.equal(go.fields.m_IsActive,true);
 const range=go.fields.m_Component.map(p=>nodes[p.component.m_PathID]).find(n=>n.fields.m_Script&&nodeType(n.fields)==='GlobalRange');assert.ok(range);assert.equal(range.fields.m_Enabled,1);
 const ev=events(profile.templateKey);assert.equal(ev.length,1);assert.equal(ev[0].key,10);
 const [assign,create,...rest]=ev[0].value.decodedActions;assert.equal(rest.length,0);
 assert.deepEqual(assign,{$type:'Torappu.Battle.Action.Nodes+AssignModifierValueIntoBlackboard',_blackboardKey:'hp_lose',_filterModifierCancelled:true});
 assert.equal(create.$type,'Torappu.Battle.Action.Nodes+CreateBuffUseAbilitySelector');
 assert.deepEqual(Object.fromEntries(Object.entries(create).filter(([k])=>k!=='_buff')),{$type:create.$type,_sourceType:'BUFF_OWNER',_targetType:inputTarget,_useAbilityFromTarget:false,_abilityFromTargetType:'SOURCE',_abilityName:'BossSelector',_excludeTarget:false,_excludeTargetType:'SOURCE',_isDerivedBuff:false,_finishDerivedBuffIfParentFinish:false,_actionFailedIfNoTarget:false,_overrideBuffSourceType:false,_buffSourceType:'SOURCE'});
 const b=create._buff;assert.equal(b.templateKey,'acstma_hp_trans');assert.equal(b.buffKey,'acstma_hp_trans');assert.equal(b.loadFromDB,false);assert.equal(b.lifeTimeType,'IMMEDIATELY');assert.equal(b.isSilenceable,false);assert.deepEqual(b.blackboard,[]);assert.ok(Object.values(b.attributes).every(a=>a.length===0));
 const de=events(b.templateKey);assert.equal(de.length,1);assert.equal(de[0].key,0);assert.equal(de[0].value.decodedActions.length,1);const damage=de[0].value.decodedActions[0];
 assert.deepEqual(damage,{$type:'Torappu.Battle.Action.Nodes+FixedValueDamage',_damageType:'PURE',_damageKey:'hp_lose',_ignoreForSp:false,_attackType:'NORMAL',_skipModifierEvent:true,_considerUnhurtable:false,_noSourceDamage:true,_targetType:'BUFF_OWNER',_assignRealDamageToBB:false,_assignFinalDamageToBB:false,_multiplierByKey:false,_multiplierKey:'cnt',_damageSourceType:'SOURCE',_damageTargetType:'BUFF_OWNER',_triggerOnCalculateDamage:false,_isEnvDamage:false,_ignoreCancelReasonMask:'NONE',_forceDisplayDamageNum:false,_modifierKey:'',_devideDamageFromAbilityCnt:false});
 profile.damageTransfer={event:'ON_TAKE_DAMAGE',eventValue:10,modifierValue:'value',filterCancelled:true,ability:abilityId,selector:selectorId,range:range.pathId,inputTarget,requiredBuff:'acstmk_passive',requiredLevel:'BOSS',maxTargets:1,postFilter:'HATRED_DES',targetIds:Object.keys(data.enemies).filter(k=>data.enemies[k].buffKey==='acstmk_passive'),template:b.templateKey,damageType:'true',skipModifierEvents:true,noSourceDamage:true,scaleKey:'atk_scale',scaleDefault:1};
}
// achunt_mark is an empty, permanent SECOND buff on the same real root ability.
// It is distinct from the dynamically created achunt_mark_by_boss marker.
const marked=['enemy_9017_achunt','enemy_9018_actrpa','enemy_9019_actrpb','enemy_9020_actrpc'];
for(const id of marked){
 const profile=data.enemies[id],buffs=bundles[28].nodes[profile.component].fields._buffs;
 const marks=buffs.filter(b=>b.buffKey==='achunt_mark');assert.equal(marks.length,1);
 const mark=marks[0];
 for(const [key,value] of Object.entries({loadFromDB:0,lifeTimeType:2,templateKey:'empty',isSilenceable:0,isStunnable:0,isFreezable:0,disableOverride:0,maxStackCnt:1,independentCharacterSource:0}))assert.equal(mark[key],value,id+' '+key);
 assert.ok(Object.values(mark.attributes).every(a=>a.length===0));assert.deepEqual(mark.blackboard,[]);assert.deepEqual(events('empty'),[]);
 profile.permanentMarks=['achunt_mark'];
 const db=rows.find(x=>x.Key===id).Value[0].enemyData;assert.equal(db.levelType.m_defined,true);profile.levelType=db.levelType.m_value;
}
{
 const profile=data.enemies.enemy_9017_achunt,nodes=bundles[28].nodes,owner=nodes[profile.rootComponent];
 const abilityId='1833237484048871588',selectorId='6034892868228804772',ability=nodes[abilityId],selector=nodes[selectorId];
 assert.ok(owner.fields._commonAbilities.some(p=>p.m_FileID===0&&p.m_PathID===abilityId));
 assert.equal(nodeType(ability.fields),'EmptyAbility');assert.equal(ability.fields.m_Enabled,1);
 assert.deepEqual(ability.fields._metadata,{namedAsAlias:'BossSelector',blackboardPrefix:''});
 assert.deepEqual(ability.fields._selector,{m_FileID:0,m_PathID:selectorId});assert.equal(nodeType(selector.fields),'AdvancedSelectorWithEnemyOptions');assert.equal(selector.fields.m_Enabled,1);
 const reference=nodes['6828043281619139737'].fields;
 const strip=f=>Object.fromEntries(Object.entries(f).filter(([k])=>!['m_GameObject','m_Enabled','m_Script','m_Name'].includes(k)));
 assert.deepEqual(strip(selector.fields),{...strip(reference),_limitTargetNum:0,_enemyLevelMask:7,_buffKey:'achunt_mark'});
 const parents=Object.fromEntries(Object.values(nodes).filter(n=>n.unityType==='Transform').map(n=>[n.fields.m_GameObject.m_PathID,n.fields.m_Father.m_PathID]));
 for(const component of [ability,selector]){let object=component.fields.m_GameObject.m_PathID,last;while(object&&object!=='0'){assert.equal(nodes[object].fields.m_IsActive,true);last=nodes[object].fields.m_Name;object=nodes[parents[object]]?.fields.m_GameObject.m_PathID;}assert.equal(last,'enemy_9017_achunt');}
 const go=nodes[selector.fields.m_GameObject.m_PathID],range=go.fields.m_Component.map(p=>nodes[p.component.m_PathID]).find(n=>n.fields.m_Script&&nodeType(n.fields)==='GlobalRange');assert.ok(range);assert.equal(range.fields.m_Enabled,1);
 const ev=events(profile.templateKey);assert.deepEqual(ev.map(e=>e.key),[3,2]);const actions=ev.find(e=>e.key===3).value.decodedActions;assert.equal(actions.length,1);const create=actions[0];
 assert.deepEqual(Object.fromEntries(Object.entries(create).filter(([k])=>k!=='_buff')),{$type:'Torappu.Battle.Action.Nodes+CreateBuffUseAbilitySelector',_sourceType:'BUFF_OWNER',_targetType:'BUFF_OWNER',_useAbilityFromTarget:false,_abilityFromTargetType:'SOURCE',_abilityName:'BossSelector',_excludeTarget:false,_excludeTargetType:'SOURCE',_isDerivedBuff:false,_finishDerivedBuffIfParentFinish:false,_actionFailedIfNoTarget:false,_overrideBuffSourceType:false,_buffSourceType:'SOURCE'});
 const buff=create._buff;assert.equal(buff.buffKey,'kill_achunt_mark_boss');assert.equal(buff.templateKey,buff.buffKey);assert.equal(buff.lifeTimeType,'IMMEDIATELY');assert.equal(buff.loadFromDB,false);assert.equal(buff.isSilenceable,false);assert.deepEqual(buff.blackboard,[]);assert.ok(Object.values(buff.attributes).every(a=>a.length===0));
 const killEvents=events(buff.templateKey);assert.equal(killEvents.length,1);assert.equal(killEvents[0].key,0);
 assert.deepEqual(killEvents[0].value.decodedActions,[{$type:'Torappu.Battle.Action.Nodes+InstantKill',_targetType:'BUFF_OWNER',_killSource:false,_noSource:false,_withdrawIfRallyPoint:false,_resultIfInRallyPointMode:false,_skipReborn:false,_noReason:false,_markReachExit:false,_switchState:false}]);
 profile.deathCleanup={event:'ON_OWNER_KILLED',eventValue:3,ability:abilityId,selector:selectorId,range:range.pathId,requiredBuff:'achunt_mark',allowedLevels:['NORMAL','ELITE','BOSS'],targetIds:marked,maxTargets:null,motion:'ALL',template:buff.templateKey,action:'InstantKill',targetType:'BUFF_OWNER',skipReborn:false,noSource:false,native:{instantKill:80574,suicide:55932,setHpInternal:55977}};
}
const target=path.join(root,'web/enemy_passive_data.js'),out='// Generated by tools/build_enemy_passives.js; see docs/mechanics/enemy-passives.md.\nwindow.ArkEnemyPassiveData='+JSON.stringify(data,null,2)+';\n';
if(process.argv.includes('--check'))assert.equal(fs.readFileSync(target,'utf8'),out,'enemy_passive_data.js drift');else fs.writeFileSync(target,out);
console.log('ENEMY PASSIVES DATA OK: 9 root BLOCK_FREE, 2 damage transfers, 4 permanent achunt marks and 1 owner-killed cleanup graph');
