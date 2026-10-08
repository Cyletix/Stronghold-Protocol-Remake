'use strict';
// Compile the inspected prefab -> actual MonoScript -> buff action chain.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {enemyVariant}=require('./lib/source-battle');
const root=path.join(__dirname,'..'),files={prefab:'work/client-logic/bundles/battle/enm_pfb_9.ab.json',scripts:'work/client-logic/script-types.json',templates:'work/client-logic/buff-templates.json',database:'data/ArknightsGameData/zh_CN/gamedata/levels/enemydata/enemy_database.json'};
const read=f=>JSON.parse(fs.readFileSync(path.join(root,f),'utf8'));
const prefab=read(files.prefab),scripts=read(files.scripts).matches.find(x=>x.cab==='CAB-658d74aab777086fc32b93f385be999a');
const template=read(files.templates).enemy_dead_spawn,db=new Map(read(files.database).enemies.map(x=>[x.Key,x.Value]));
assert.ok(scripts);assert.equal(template.eventToActions._items.length,1);
const event=template.eventToActions._items[0],actions=event.value.decodedActions;
assert.equal(event.key,3); // Metadata: Buff.ON_OWNER_KILLED, field 58972, compressed default 0x06 -> 3.
assert.deepEqual(actions.slice(0,2),[{_source:'BUFF_OWNER',_finishReason:'FALLDOWN',$type:'Torappu.Battle.Action.Nodes+FilterDeathReason'},{$type:'Torappu.Battle.Action.Nodes+IfNot'}]);
assert.equal(actions.length,3);const action=actions[2];
assert.equal(action.$type,'Torappu.Battle.Action.Nodes+SummonEnemiesFollowMyRoute');
for(const [key,value] of Object.entries({_source:'TARGET',_enemyKey:null,_summonCount:0,_delayTime:0,_managedByScheduler:true,_dontBlockWave:false,_trySummonOutsideWhenInObstacle:false,_randomOffsetBound:.5,_passableMask:'WALK_ONLY',_onlySummonOneInTheSamePlace:false,_useOffsetInBB:false,_useLocalUnharmfulFlag:false,_useMapPosition:true,_spawnOnHostRootTile:false,_useTargetPosition:false,_useRandomDelay:true,_randomDelayRange:.7,_stopSummonIfHostDead:false,_useOffsetForEach:false,_addBuffToEnemy:false,_checkMotionMode:'ALL',_skipCheckPoint:false}))assert.equal(action[key],value,key);
const nodes=prefab.nodes,parent={};
for(const node of Object.values(nodes))if(node.unityType==='Transform')parent[node.fields.m_GameObject.m_PathID]=node.fields.m_Father.m_PathID;
function ancestry(go){const names=[],seen=new Set();while(go&&go!=='0'){assert.ok(!seen.has(go));seen.add(go);assert.equal(nodes[go].fields.m_IsActive,true);names.unshift(nodes[go].fields.m_Name);go=nodes[parent[go]]?.fields.m_GameObject.m_PathID;}return names;}
const data={version:1,client:'JP 36.7.22',sources:Object.fromEntries(Object.entries(files).map(([key,file])=>[key,{path:file,sha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex')}])),template:{event:'ON_OWNER_KILLED',excludedReason:'FALLDOWN',action},enemies:{},children:{}};
for(const node of Object.values(nodes)){
 const fields=node.fields,buffs=fields._buffs?.filter(x=>x.templateKey==='enemy_dead_spawn');if(!buffs?.length)continue;
 assert.equal(buffs.length,1);assert.equal(fields.m_Enabled,1);assert.equal(buffs[0].isSilenceable,0);
 assert.equal(fields.m_Script.m_FileID,1);assert.ok(Object.values(prefab.externals).every(list=>list[0].endsWith('/'+scripts.cab)));
 const script=scripts.scripts[fields.m_Script.m_PathID];assert.equal(script.m_ClassName,'PassiveBuffAbility');assert.equal(script.m_Namespace,'Torappu.Battle.Abilities');
 const chain=ancestry(fields.m_GameObject.m_PathID),id=chain[0];assert.deepEqual(chain,[id,'Talent','DeadSpawn']);assert.ok(/^enemy_/.test(id));
 const base=enemyVariant({id,level:0,useDb:true},db,{}),bb=Object.fromEntries(base.sourceTalentBlackboard.map(x=>[x.key,x.valueStr??x.value]));
 assert.ok(Number.isInteger(bb['DeadSpawn.cnt'])&&bb['DeadSpawn.cnt']>0);assert.ok(db.has(bb['DeadSpawn.enemy_key']));
 data.enemies[id]={node:node.pathId,script:fields.m_Script,component:chain.join('/'),name:base.name,blackboard:base.sourceTalentBlackboard};
 const child=bb['DeadSpawn.enemy_key'];data.children[child]=enemyVariant({id:child,level:0,useDb:true},db,{});
}
data.enemies=Object.fromEntries(Object.entries(data.enemies).sort(([a],[b])=>a.localeCompare(b)));
data.children=Object.fromEntries(Object.entries(data.children).sort(([a],[b])=>a.localeCompare(b)));
assert.equal(Object.keys(data.enemies).length,14,'inspect any changed prefab coverage before accepting');
for(const [id,child] of Object.entries(data.children)){
 const matches=Object.values(nodes).filter(node=>{
  const f=node.fields;return f.m_GameObject&&nodes[f.m_GameObject.m_PathID]?.fields.m_Name===id&&scripts.scripts[f.m_Script?.m_PathID]?.m_ClassName==='PropLikeEnemy';
 });
 assert.equal(matches.length,1,id+' must have one real PropLikeEnemy');const node=matches[0],f=node.fields;
 assert.equal(f.m_Enabled,1);assert.equal(f.m_Script.m_FileID,1);assert.equal(scripts.scripts[f.m_Script.m_PathID].m_Namespace,'Torappu.Battle');
 assert.equal(f._onlyAffectSpecificModeIndex,0);assert.equal(f._hasSp,0);assert.equal(f._acceptDamageType,2);
 assert.ok(Number.isInteger(child.maxHp)&&child.maxHp>0);
 child.propLike={node:node.pathId,script:f.m_Script,acceptSpecificDamageType:!!f._acceptSpecificDamageType,acceptDamageType:'arts'};
}
const output='// Generated by tools/build_enemy_death_spawn.js; see docs/mechanics/enemy-death-spawn.md.\nwindow.ArkEnemyDeathSpawnData='+JSON.stringify(data,null,2)+';\n',target=path.join(root,'web/enemy_death_spawn_data.js');
if(process.argv.includes('--check'))assert.equal(fs.readFileSync(target,'utf8'),output,'enemy_death_spawn_data.js drift');else fs.writeFileSync(target,output);
console.log('ENEMY DEATH SPAWN DATA OK: 14 real PassiveBuffAbility bindings and 14 PropLikeEnemy child variants');
