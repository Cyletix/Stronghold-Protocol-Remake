'use strict';
// 构建期转换；保留未解释的客户端行为，不在运行期随机补造敌人或路线。
function mergeDefined(target, source) {
  for (const [key,value] of Object.entries(source || {})) {
    if (value && typeof value === 'object' && 'm_defined' in value) {
      if (value.m_defined) target[key] = structuredClone(value.m_value);
    } else if (value && typeof value === 'object' && !Array.isArray(value)) {
      target[key] = mergeDefined(target[key] && typeof target[key] === 'object' ? target[key] : {}, value);
    } else target[key] = structuredClone(value);
  }
  return target;
}
function enemyVariant(ref, database, fallback) {
  const levels = database.get(ref.id) || [];
  if (ref.useDb && !levels.some(x => x.level === ref.level)) throw Error('Missing enemy level '+ref.id+':'+ref.level);
  const raw = {};
  if (ref.useDb) for (const lv of levels.slice().sort((a,b)=>a.level-b.level)) if (lv.level <= ref.level) mergeDefined(raw,lv.enemyData);
  mergeDefined(raw,ref.overwrittenData);
  const attrs=raw.attributes || {}, out={...fallback,enemyId:ref.id,sourceLevel:ref.level};
  if(raw.levelType!=null)out.sourceLevelType=raw.levelType;
  for(const [field,original]of Object.entries({maxHp:'maxHp',atk:'atk',def:'def',magicRes:'magicResistance',moveSpeed:'moveSpeed',attackTime:'baseAttackTime',massLevel:'massLevel',blockCnt:'blockCnt',cost:'cost',epRes:'epDamageResistance'}))if(attrs[original]!=null)out[field]=attrs[original];
  if(attrs.attackSpeed>0)out.attackTime/=attrs.attackSpeed/100;
  for(const field of ['name','rangeRadius','lifePointReduce','motion'])if(raw[field]!=null)out[field]=raw[field];
  out.flying=raw.motion==='FLY';
  if(raw.applyWay!=null){out.applyWay=raw.applyWay;out.canAttack=raw.applyWay!=='NONE';}
  out.sourceAttributes=attrs;
  // Preserve the level-merged client records, including initCooldown and valueStr.
  // These are evidence, not executable skills or unconditional talent buffs.
  out.sourceSkills=structuredClone(raw.skills || []);
  out.sourceTalentBlackboard=structuredClone(raw.talentBlackboard || []);
  out.sourceTags=structuredClone(raw.enemyTags || []);
  out.sourceDescription=raw.description||'';
  // Verified: enemy_database description explicitly says this enemy cannot be blocked.
  if(/^enemy_1026_aghost(?:_|$)/.test(ref.id)&&out.sourceDescription.includes('无法被阻挡'))out.unblockable=true;
  if(/^enemy_1042_frostd(?:_|$)/.test(ref.id)){
    const board=Object.fromEntries(out.sourceTalentBlackboard.map(x=>[x.key,x.value]));
    if(board['atkSpeedDown.attack_speed']<0)out.attackSpeedAura={radius:board['defup.range_radius']??raw.rangeRadius,amount:board['atkSpeedDown.attack_speed']};
  }
  const bomb=out.sourceSkills.find(s=>s.prefabKey==='boomb');
  if(/^enemy_1040_bombd(?:_|$)/.test(ref.id)&&bomb){
    const board=Object.fromEntries((bomb.blackboard||[]).map(x=>[x.key,x.value]));
    // Database: boomb/initCooldown/move_speed. PRTS enemy entry: one use,
    // target tile + eight neighbours, 100% physical damage, no basic attacks.
    out.bombAttack={initialCooldown:bomb.initCooldown??1,moveMultiplier:board.move_speed??2,tileRadius:1};
    out.canAttack=false;
  }
  return out;
}
const {convertLevel}=require('../../web/src/simulation/source-map');
module.exports={mergeDefined,enemyVariant,convertLevel};
