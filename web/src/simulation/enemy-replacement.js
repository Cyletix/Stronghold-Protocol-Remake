// JP 36.7.22 native evidence: AutoChessLevelEnemyManager.RandomEnemyGenerater
// RVAs 0x22db944, 0x22db668, 0x22db75c, 0x22db1ec. Reproduce with
// python -B tools/inspect_autochess_native.py --type AutoChessLevelEnemyManager --type Torappu.AutoChessData
// Native pool/quantity rules; PRNG is injected, without original seed parity or hotfix claims.
(function(root){
 'use strict';
 const f=Math.fround,INT_MIN=-2147483648,INT_MAX=2147483647;
 function finite(value,name){
  if(typeof value!=='number'||!Number.isFinite(value)||!Number.isFinite(f(value)))throw new TypeError(name+' must be a finite float32');
  return f(value);
 }
 function integer(value,name){
  if(!Number.isInteger(value)||value<INT_MIN||value>INT_MAX)throw new TypeError(name+' must be int32');
  return value;
 }
 // Native midpoint handling tests parity of the integral part; Math.round differs.
 function roundToEven(value){
  if(!Number.isFinite(value))return value;
  const lower=Math.floor(value),fraction=value-lower;
  return fraction===0.5?(lower%2===0?lower:lower+1):Math.round(value);
 }
 // FCVTZS w register behavior plus the explicit +Infinity override at 0x22db8fc.
 function nativeRoundToInt(value){
  const rounded=roundToEven(value);
  if(Number.isNaN(rounded))return 0;
  if(!Number.isFinite(rounded))return INT_MIN;
  return Math.max(INT_MIN,Math.min(INT_MAX,Math.trunc(rounded)));
 }
 function enemyAttrPower(attributes,constants){
  const hp=f(integer(attributes.maxHp,'maxHp')),atk=f(integer(attributes.atk,'atk')),def=f(integer(attributes.def,'def'));
  const mr=finite(attributes.magicResistance,'magicResistance');
  const hpPart=f(hp*finite(constants.enemyMaxHpFactor,'enemyMaxHpFactor'));
  const atkPart=f(atk*finite(constants.enemyAtkFactor,'enemyAtkFactor'));
  const defPart=f(def*finite(constants.enemyDefFactor,'enemyDefFactor'));
  const mrPart=f(mr*finite(constants.enemyMagicResistanceFactor,'enemyMagicResistanceFactor'));
  return f(f(f(hpPart+atkPart)+defPart)+mrPart);
 }
 function actionBattleEffectiveness(action,attributes,entry,constants){
  if(!entry)return 0;
  const power=enemyAttrPower(attributes,constants);
  return f(f(power*f(integer(action.count,'count')))/finite(entry.enemyBattleEffectivenessFactor,'enemyBattleEffectivenessFactor'));
 }
 function enemyCountByBattleEffectiveness(originBattleEffectiveness,attributes,entry,constants){
  if(!entry)return 0;
  const unit=f(enemyAttrPower(attributes,constants)/finite(entry.enemyBattleEffectivenessFactor,'enemyBattleEffectivenessFactor'));
  if(unit===0)return 0;
  const minimum=integer(constants.minReplacedEnemyCount,'minReplacedEnemyCount');
  const maximum=integer(constants.maxReplacedEnemyCount,'maxReplacedEnemyCount');
  if(minimum>maximum)throw new RangeError('minReplacedEnemyCount exceeds maxReplacedEnemyCount');
  // Intermediate infinities/NaN intentionally retain native numeric semantics.
  // replaceAction below prevents these values entering JSON-backed game state.
  const count=nativeRoundToInt(f(f(originBattleEffectiveness)/unit));
  return Math.max(minimum,Math.min(maximum,count));
 }
 function replaceAction(action,originAttributes,originEntry,targetAttributes,targetEntry,constants){
  if(!originEntry||!targetEntry)throw new TypeError('Both source and target enemy entries are required');
  if(typeof targetEntry.enemyKey!=='string'||!targetEntry.enemyKey)throw new TypeError('Target enemyKey is required');
  const budget=actionBattleEffectiveness(action,originAttributes,originEntry,constants);
  const count=enemyCountByBattleEffectiveness(budget,targetAttributes,targetEntry,constants);
  const duration=f(f(integer(action.count,'count'))*finite(action.interval,'interval'));
  const interval=f(duration/f(count));
  // This guard is an implementation boundary, not a claim about the original.
  // JSON.stringify silently turns Infinity/NaN into null; refuse that corruption.
  if(!Number.isFinite(budget)||count<=0||!Number.isFinite(interval))throw new RangeError('Replacement would produce a non-finite budget/interval or non-positive count');
  return {...action,key:targetEntry.enemyKey,count,interval};
 }
 // _GetSpEnemyActionData (0x22d6b84): the bool parameter is named isToken.
 function selectSpEnemyActionData(entry,originActionDatas,isToken,constants){
  const actions=originActionDatas||[];
  if(entry){
   const field=isToken?(entry.isFlyEnemy?'templateEnemyTokenFly':'templateEnemyToken'):(entry.isFlyEnemy?'templateEnemyNormalFly':'templateEnemyNormal');
   const index=actions.findIndex(action=>action.key===constants[field]);
   if(index>=0)return {action:actions[index],actionIndex:index};
  }
  return {action:actions[0]||null,actionIndex:0};
 }
 function draw(random){
  const value=random();
  if(typeof value!=='number'||value<0||value>=1||!Number.isFinite(value))throw new RangeError('Injected random must return a number in [0, 1)');
  return value;
 }
 // The PRNG is injected. This port does not claim original-client seed parity.
 function shuffle(values,random){
  for(let i=0;i<values.length;i++){
   const j=i+Math.floor(draw(random)*(values.length-i));
   [values[i],values[j]]=[values[j],values[i]];
  }
  return values;
 }
 // Native weighted helper 0x543a99c uses float32 sums/subtraction and MathUtil.LE,
 // whose tolerance at 0x8057228 is float32(1e-5), then falls back to the last item.
 function selectWeighted(candidates,random){
  if(!candidates.length)return null;
  const weights=candidates.map(candidate=>{
   const weight=f(integer(candidate.randomWeight,'randomWeight'));
   if(weight<0)throw new RangeError('Negative enemy randomWeight is unsupported');
   return weight;
  });
  let total=0;
  for(const weight of weights)total=f(total+weight);
  if(!Number.isFinite(total))throw new RangeError('Enemy weight total overflow');
  let ticket=f(f(draw(random))*total);
  for(let i=0;i<candidates.length;i++){
   if(ticket<=f(weights[i]+f(1e-5)))return candidates[i];
   ticket=f(ticket-weights[i]);
  }
  return candidates[candidates.length-1];
 }
 function generatePlan(encounters,seasonId,modeId,options={}){
  const constants=encounters.constants,season=encounters.seasons[seasonId],random=options.random;
  if(!season)throw new RangeError('Unknown enemy encounter season '+seasonId);
  const mode=season.modes[modeId];
  if(!mode)throw new RangeError('Unknown enemy encounter mode '+modeId);
  if(typeof random!=='function')throw new TypeError('An explicit random function is required');
  const maximum=integer(constants.maxLevelCnt,'maxLevelCnt'),fill=integer(constants.enemyTypeIdentifierToFillRandom,'enemyTypeIdentifierToFillRandom');
  if(maximum<1)throw new RangeError('maxLevelCnt must be positive');
  const types=Object.values(encounters.types),roundTypes=[];
  let selectedTypes=[];
  if(options.roundEnemies?.length){
   // Native _GenerateSpecialEnemyTypes uses supplied round/enemyType pairs to
   // overwrite a list initially filled with the default identifier.
   roundTypes.push(...Array(maximum).fill(fill));
   for(const enemy of options.roundEnemies){
    const round=integer(enemy.round,'round'),type=integer(enemy.enemyType,'enemyType');
    if(round>=1&&round<=maximum)roundTypes[round-1]=type;
   }
   selectedTypes=types.filter(type=>type.typeIdentifier!==fill&&roundTypes.includes(type.typeIdentifier)).map(type=>type.type);
  }else{
   const eligible=types.filter(type=>type.involveRandom),number=integer(constants.specialEnemyNum,'specialEnemyNum');
   let selected;
   if(options.selectedTypes){
    // Explicit setup override (e.g. training). The caller owns that convention.
    selected=options.selectedTypes.map(key=>eligible.find(type=>type.type===key));
    if(selected.length!==number||new Set(options.selectedTypes).size!==number||selected.some(type=>!type))throw new RangeError('Invalid fixed training type selection');
   }else{
    if(eligible.length<number)throw new RangeError('Insufficient eligible enemy types');
    selected=shuffle(eligible.slice(),random).slice(0,number);
   }
   selectedTypes=selected.map(type=>type.type);
   for(const type of selected){
    const rule=season.typeDraw[type.type];
    if(!rule)continue;
    const count=integer(rule.count,'typeDraw.count');
    for(let i=0;i<count;i++)roundTypes.push(type.typeIdentifier);
   }
   if(roundTypes.length>maximum)roundTypes.length=maximum;
   else{
    while(roundTypes.length<maximum)roundTypes.push(fill);
    shuffle(roundTypes,random);
   }
  }
  const inactive=new Set(mode.inactiveEnemyKey||[]),entries=Object.entries(season.specialEnemyInfo),rounds={},missingRounds=[];
  for(let index=0;index<maximum;index++){
   const identifier=roundTypes[index],type=types.find(type=>type.typeIdentifier===identifier),firstHalf=index<Math.trunc(maximum/2);
   const candidates=identifier===0?[]:entries.filter(([key,entry])=>!inactive.has(key)&&encounters.types[entry.type]?.typeIdentifier===identifier&&entry.isInFirstHalf===firstHalf);
   const chosen=selectWeighted(candidates.map(([key,entry])=>({...entry,entryKey:key})),random);
   const round=index+1,record={round,typeIdentifier:identifier,typeKey:type?.type||null,specialEntryKey:chosen?.entryKey||null,specialKey:chosen?.specialEnemyKey||null,normalKey:null,eliteKey:null};
   if(chosen){
    for(const [list,field] of [[chosen.attachedNormalEnemyKeys,'normalKey'],[chosen.attachedEliteEnemyKeys,'eliteKey']]){
     if(list?.length)record[field]=list[Math.floor(draw(random)*list.length)];
    }
   }else missingRounds.push(round);
   rounds[round]=record;
  }
  return {version:1,seasonId,modeId,selectedTypes,roundTypes,rounds,missingRounds,
   randomConvention:'injected PRNG; original client seed sequence is not asserted'};
 }
 function applyToSource(source,roundRecord,encounters){
  const fragment=source.waves?.[0]?.fragments?.[0];
  if(!fragment?.actions)return source;
  if(!roundRecord)throw new TypeError('A persisted round enemy record is required');
  const constants=encounters.constants,templates=new Map([
   [constants.templateEnemyNormal,{key:'normalKey',fly:false}],
   [constants.templateEnemyNormalFly,{key:'normalKey',fly:true}],
   [constants.templateEnemyElite,{key:'eliteKey',fly:false}],
   [constants.templateEnemyEliteFly,{key:'eliteKey',fly:true}],
   [constants.templateEnemySpecial,{key:'specialKey',fly:false}],
   [constants.templateEnemySpecialFly,{key:'specialKey',fly:true}]
  ].filter(([key])=>typeof key==='string'&&key));
  const enemies={...source.enemies},actions=[];
  for(const action of fragment.actions){
   const template=action.actionType==='SPAWN'&&templates.get(action.key);
   if(!template){actions.push(action);continue;}
   const key=roundRecord[template.key],targetEntry=encounters.attributes[key];
   // Native marks an unresolved or wrong-ground/air template invalid. Removing
   // that SPAWN gives the scheduler the same effective spawn set.
   if(!targetEntry||targetEntry.isFlyEnemy!==template.fly)continue;
   const originAttributes=source.enemies[action.key]?.sourceAttributes||encounters.quantityAttributes?.[action.key];
   const targetAttributes=source.enemies[key]?.sourceAttributes||encounters.quantityAttributes?.[key];
   if(!originAttributes||!targetAttributes)throw new TypeError('Missing source/database quantity attributes for '+action.key+' -> '+key);
   const targetEnemy=source.enemies[key]||encounters.enemies[key];
   if(!targetEnemy)throw new TypeError('Missing battle enemy data for '+key);
   actions.push(replaceAction(action,originAttributes,encounters.attributes[action.key],targetAttributes,targetEntry,constants));
   enemies[key]=targetEnemy;
  }
  const fragments=source.waves[0].fragments.slice();
  fragments[0]={...fragment,actions};
  const waves=source.waves.slice();
  waves[0]={...source.waves[0],fragments};
  return {...source,waves,enemies};
 }
 const api={enemyAttrPower,actionBattleEffectiveness,enemyCountByBattleEffectiveness,replaceAction,selectSpEnemyActionData,roundToEven,selectWeighted,generatePlan,applyToSource};
 if(typeof module!=='undefined'&&module.exports)module.exports=api;
 else root.ArkEnemyReplacement=api;
})(typeof window!=='undefined'?window:globalThis);
