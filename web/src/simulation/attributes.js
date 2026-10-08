// Shared attribute layers. Source/formula and legacy boundaries: docs/mechanics/common-buffs.md.
(function(root){
 'use strict';
 const version=3,clampSpeed=x=>Math.max(.1,Math.min(6,x));
 const baselineSpeed=o=>clampSpeed(o.attributeBase?.aspd??1);
 function attackRatioBonus(o,ratio,extra){return ratio+(o.attributeBase?o.atk>0?o.attributeBase.atk*extra/o.atk:0:extra);}
 function defenseFinalScale(o,time=0){
  let scale=1;
  for(const b of o.buffs||[])if(!(b.until!=null&&b.until<=time)&&Number.isFinite(b.def)&&b.def<1)scale*=Math.max(0,b.def);
  return scale;
 }
 // Keep the existing classification of legacy reductions. Their final factor
 // must also cover flat additions; SilverAsh S3's source modifier confirms this order.
 function defense(o,ratio,flat=0,time=0){
  const p=root.ArkClientPrograms?.layers(o,'def',time);
  return Math.max(0,(o.def*ratio+(flat+(p?.final_addition||0))*defenseFinalScale(o,time))*(p?.final_scaler??1));
 }
 function ratios(o,{atk=0,def=0,aspd=0}={},time=0){
  let atkScale=1,defScale=defenseFinalScale(o,time);
  for(const b of o.buffs||[]){
   if(b.until!=null&&b.until<=time)continue;
   // Positive generic buffs are percentage additions. Old reductions keep
   // their separate final factor until each source modifier kind is audited.
   if(Number.isFinite(b.atk)){if(b.atk>=1)atk+=b.atk-1;else atkScale*=Math.max(0,b.atk);}
   if(Number.isFinite(b.def)&&b.def>=1)def+=b.def-1;
   if(Number.isFinite(b.aspd))aspd+=b.aspd-1;
  }
  const result={atk:Math.max(0,attackRatioBonus(o,1,atk))*atkScale,
   def:Math.max(0,1+(o.attributeBase?o.def>0?o.attributeBase.def*def/o.def:0:def))*defScale,
   aspd:clampSpeed((o.attributeBase?.aspd??1)+aspd)/baselineSpeed(o)};
  if(o.clientProgramState&&o.skillState||root.ArkClientPrograms?.hasPassive(o)||root.ArkSkillAuras?.has(o,time)){
   const runtime=root.ArkClientPrograms,pa=runtime.layers(o,'atk',time),pd=runtime.layers(o,'def',time),ps=runtime.layers(o,'attack_speed',time);
   // A zero source base cannot represent existing flat gains as current/base.
   // Keep those gains when an unrelated Aura makes this unit consume layers.
   const calculate=(base,current,bonus,layer)=>runtime.calculate(base,current,bonus,{...layer,final_addition:layer.final_addition+(base===0?current:0)});
   result.atk=o.atk>0?Math.max(0,calculate(o.attributeBase?.atk??o.atk,o.atk,atk,pa))*atkScale/o.atk:0;
   // Final DEF terms are applied after all flat additions by defense().
   result.def=o.def>0?Math.max(0,calculate(o.attributeBase?.def??o.def,o.def,def,{...pd,final_addition:0,final_scaler:1}))*defScale/o.def:0;
   const speed=(o.attributeBase?.aspd??1)+aspd;
   result.aspd=clampSpeed(runtime.calculate(speed*100,speed*100,0,ps)/100)/baselineSpeed(o);
  }
  return result;
 }
 root.ArkAttributes={version,clampSpeed,baselineSpeed,attackRatioBonus,ratios,defense};
 if(typeof module!=='undefined'&&module.exports)module.exports=root.ArkAttributes;
})(typeof window!=='undefined'?window:globalThis);
