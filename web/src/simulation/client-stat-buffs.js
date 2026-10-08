// Compiled source graphs, not translated skill descriptions. Exact binding and
// runtime blackboard checks keep unrelated state/target graphs out of this path.
(function(root){
 'use strict';
 const profiles=()=>root.ArkClientStatBuffData.profiles;
 const modeHash='8cda7a5dd2c5d3b04d25a8280d52f36bfc73470ec852f5618568cbf4f8b9f198';
 function configure(skill,charId){
  const p=profiles()[skill.sourceId];if(!p)return;
  const b=skill.blackboard||{},keys=Object.keys(p.modifiers);
  const mode=p.modeGraph,proof=mode?.proofs?.find(v=>v.char_id===charId),attack=root.ArkAttackProfiles?.[charId];
  if(!p.charIds.includes(charId)||skill.isPassive||!(skill.duration>0)||Object.keys(b).sort().join(',')!==keys.sort().join(',')||keys.some(k=>!Number.isFinite(b[k]))||['atk','def'].some(k=>(b[k]||0)<0)||
    p.constants&&(Object.keys(p.constants).join(',')!=='defense_scale'||p.constants.defense_scale!==0)||
    mode&&(mode.kind!=='all_serialized_modes_preserve_attack'||!mode.characters.includes(charId)||proof?.combat_graph_sha256!==modeHash||attack?.action!=='attack'||attack.damageType!=='phys'||attack.kind&&attack.kind!=='single'))throw Error('Invalid client stat graph: '+skill.sourceId);
  skill.clientStatGraph={prefabId:p.prefabId,modifiers:p.modifiers};
  if(p.constants)skill.clientStatGraph.constants=p.constants;
  if(mode)skill.clientStatGraph.modeContract={charId,kind:mode.kind,combatGraphSha256:proof.combat_graph_sha256};
  skill.effects=keys.filter(k=>k!=='base_attack_time').map(k=>({type:{atk:'buff_atk',def:'buff_def',attack_speed:'buff_atkspd'}[k],power:b[k]/(k==='attack_speed'?100:1)}));
 }
 function interval(unit,value){
  const key=unit.skillState&&unit.skill?.clientStatGraph?.modifiers.base_attack_time;
  // finalizeOperator already divides the base interval by static attack speed.
  // Add the source seconds in that same coordinate before active speed buffs.
  return key?value+unit.skill.blackboard.base_attack_time/root.ArkAttributes.baselineSpeed(unit):value;
 }
 function defense(unit,value){return unit.skillState&&unit.skill?.clientStatGraph?.constants?.defense_scale===0?0:value;}
 root.ArkClientStatBuffSkills={get supported(){return Object.keys(profiles());},configure,interval,defense};
})(typeof window!=='undefined'?window:globalThis);
