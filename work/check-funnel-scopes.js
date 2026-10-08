'use strict';
const fs=require('node:fs');
const records=new Map([
 ['op/char_377_gdglow/skill/skchr_gdglow_1/client-body','2026-09-14：`node tools/_funnel_smoke.js` 通过澄闪S1十级源参数与实际双单元伤害；核持续锁敌、逐单元叠层、目标更换和禁止重复附带基础浮游攻击。依据为JP模式组件及当前CN黑板，版本和帧序边界见 [浮游专题](../mechanics/funnel.md)。'],
 ['op/char_377_gdglow/skill/skchr_gdglow_2/client-body','2026-09-14：`node tools/_funnel_smoke.js` 通过澄闪S2十级源参数、扩大范围、无限持续和双单元；核范围外旧目标保留、重新索敌及独立倍率。采用JP模式组件与当前CN数值，精确重新放飞时序另核，见 [浮游专题](../mechanics/funnel.md)。'],
 ['op/char_377_gdglow/skill/skchr_gdglow_3/client-body','2026-09-14：`node tools/_funnel_smoke.js` 通过澄闪S3十级、三个单元、本体停攻、全图目标资格/隐匿排除与0.5秒停顿；签名恢复覆盖运行中、待爆弹和结束。来源和原版仇恨/弹道边界见 [浮游专题](../mechanics/funnel.md)。'],
 ['op/char_377_gdglow/talent/1/client-prd','2026-09-14：`node tools/_funnel_smoke.js` 通过四份无模组候选、每单元独立PRD、40次保底不耗RNG、自爆替代普通伤害、1.1半径/约0.32秒/对空及隐匿溅射；三个待爆弹的签名恢复继续产生一致逻辑与RNG。原生依据为DealHitTarget→DicePRD及爆炸组件；跨技能和部署的ability key生命周期不在此项，见 [浮游专题](../mechanics/funnel.md)。'],
 ['op/char_377_gdglow/talent/2/source-penetration','2026-09-14：`node tools/_funnel_smoke.js` 通过两份无模组候选15/18，核法抗扣除至0、物理不受影响；本体、浮游和自爆均走同一法伤入口。数值与版本边界见 [浮游专题](../mechanics/funnel.md)。'],
 ['op/char_4040_rockr/skill/skchr_rockr_2/client-overload','2026-09-14：`node tools/_funnel_smoke.js` 通过洛洛S2十级单单元、20秒前后攻击增益分离、倍率上限/层数向上取整及实际过载时长眩晕；真实update及签名恢复跨19.9→20秒和40秒结束。原生BasicSkill半程与过载buff动作、手动结束UI/帧序边界见 [浮游专题](../mechanics/funnel.md)。'],
 ['op/char_4040_rockr/talent/1/source-stacks','2026-09-14：`node tools/_funnel_smoke.js` 通过四份无模组阶段/潜能候选的15秒定时加攻与源上限，核部署初始、各层边界和再部署重新计时。依据及模组排除范围见 [浮游专题](../mechanics/funnel.md)。']
]);
let count=0;
for(const file of ['docs/checklists/operator-checklist.md','docs/checklists/library-checklist.md']){
 const lines=fs.readFileSync(file,'utf8').split('\n'),out=[];
 for(const line of lines){
  const id=/<!-- review:([^ ]+) basis:/.exec(line)?.[1],note=records.get(id);
  if(note){if(!line.startsWith('- [ ]'))throw Error('Already checked '+id);out.push(line.replace('- [ ]','- [x]'),'  - 记录：'+note);count++;}
  else out.push(line);
 }
 fs.writeFileSync(file,out.join('\n'));
}
if(count!==7)throw Error('Expected 7 scoped items, got '+count);
console.log('CHECKED FUNNEL SCOPES',count);
