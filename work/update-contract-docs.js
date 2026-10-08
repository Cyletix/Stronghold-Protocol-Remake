'use strict';
const fs=require('fs'),assert=require('node:assert/strict');
function edit(p,fn){const s=fs.readFileSync(p,'utf8');fs.writeFileSync(p,fn(s));}
function replace(s,a,b){assert.ok(s.includes(a),'missing text: '+a.slice(0,70));return s.replace(a,b);}
edit('docs/checklists/mechanism-research.md',s=>{
 s=replace(s,'暂拒绝mode_graph，见[Web边界]','该批暂拒绝mode_graph，现已由下方后续批次显式适配，见[Web边界]');
 s=replace(s,'图中转移伤害、标记和其余能力仍独立未做。','该批转移伤害、标记和其余能力仍独立未做；转伤后续接入见下条。');
 s=replace(s,'- [ ] **R03 ·','  - 记录：2026-09-14接续批次按完整charId/模式引用/来源SHA，将红豆S1/S2有限证明接Web；缠丸S2最终防御0接DPS与Web，父DPS银灰S3改为最终×0.3。当前DPS107/1001、精一85/807、17图接受、608/228/24/16首失败及19具体模式拒绝；Web25ID/16prefab/235级，848真实动作、九种鉴权恢复及七项适配器拒绝通过。14同攻击合同候选/15方法保留在native-attack-contracts；可颂天赋倍率/时序仍拒绝，不重审原19配置。Web银灰末端平加仍是独立传播点，见[最终防御](../../../docs/client-final-defense.md)与[Web范围](../mechanics/client-stat-buffs.md)。\n- [ ] **R03 ·');
 s=replace(s,'- [ ] **R05 ·','  - 记录：2026-09-14接续批次实现acstma/acstmb受伤前Modifier.value→唯一BOSS胄本体的PURE转伤，保留关卡levelType覆写、skip/noSource和未知目标诊断。真实多伤害入口、过量伤害、BOSS/NORMAL同ID覆写、弹体与鉴权恢复通过；只增加两个转伤子项。actrpa事件7及actrpb/c TARGET/achunt_mark仍未接，见[原生链](../research/enemy-transfer-native.md)。\n- [ ] **R05 ·');
 s=replace(s,'- [ ] **R09 ·','  - 记录：2026-09-14接续批次由GenerateLocalSave→_LoadRunTimeData确认并接第一季训练新局生命45；后续回合/休整保留剩余生命，第二季/正式隔离。第四轮30000生命原已由关卡生效，不重复派工。同版JP活动表已定向解码，缺号也不存在，恢复入口改为缺号处理/热修与四人轮选；NPC缺预置到坐标转换的调用方。防暴盾单件0.6条件接真实命中/购买/穿戴/弹体恢复，市场13映射；多件去重仍本地约定。合法null装备槽恢复修复且坏对象/重复UID/库存null拒绝；96商店池和384补位继续通过，见[证据与断点](../mechanics/shop-items.md)。\n- [ ] **R09 ·');
 s=replace(s,'新增六技能主体和九敌人被动，当前490/6317。训练NPC/第三轮机变/第四轮Boss、器物公共阻挡、mode_graph的Web消费仍未完成；','新增六技能主体和九敌人被动，当时490/6317。该批尚未接的mode_graph与训练HP在下一批已接，第四轮Boss源HP亦已确认原本生效；NPC/第三轮机变和器物公共阻挡仍有具体缺口；');
 s=replace(s,'## 每批记录','  - 记录：2026-09-14最新接续批次Web123组全部通过（120运行/来源组分段，3清单文档组最后执行），父侧122项相关测试及候选9项通过。旧休整迁移专项新增断言按序列化身份核报价/装备/生命/RNG，修正最初将重绑定entry对象直接与存档charId比较的测试错误后通过；不是游戏回滚。原6317ID/490项验收保留，其中480项依据变化按原专项复核，新增7个限定项至497/6324。版本room-game-20260914.15、指纹d1480e625b962d1a，只迁移精确兼容休整，旧战斗快照不迁移；原SQLite哈希未变。尚未核全模式/全装备、原版精确时序、异地四人长局与房主进程重启，R12保持未勾。\n\n## 每批记录');
 return s;
});
edit('docs/research/client-logic-pipeline.md',s=>{
 s=replace(s,'最新批次从现有角色模式图核全部攻击组件','上一批从现有角色模式图核全部攻击组件');
 s=replace(s,'保留NPC、第三轮六槽和第四轮Boss未消费范围。','保留NPC和第三轮六槽边界；训练HP/第四轮Boss的当前消费已在下方最新记录纠正。');
 s=replace(s,'该最新批次Web119组','该批Web119组');
 s=replace(s,'下一次直接按[计划断点](../plan.md#接续断点)接已知模式证明到Web、消费训练对象和独立敌人链；没有新输入时不重审原19配置或重复解码已记录不可读的方法页。','该批的下一入口已在下方接续完成；没有新输入时不重审原19配置或重复解码已记录不可读的方法页。');
 const marker='父工作区 `src/arkresearch` 负责来源隔离的共用证据库';
 s=replace(s,marker,'最新接续批次已将红豆S1/S2模式证明接Web，并由原生最终属性结算接缠丸S2 DEF=0；DPS107/1001、精一85/807，严格17/893，拒绝608/228/24/16及19项模式失败。Web25ID/16prefab/235级、848身份等级动作与九種鉴权恢复通过，候选689组/161登记并保留mode_graph和attack_constants。可颂时序/天赋仍拒绝，14合同候选与15原生入口直接复用。\n\n同批接acstma/acstmb转伤、训练新局45生命和防暴盾单件有来源命中；第四轮30000生命本来已由关卡生效。定向解出的同版JP活动表也无第三轮缺号，下一入口为具体缺号处理/热修和NPC预置坐标调用方，不再重取相同表。修复合法装备空槽恢复，Web123组、父122项、候选9项通过；原490项沿原范围保留，增加7项至497/6324。具体继续路径见[计划断点](../plan.md#接续断点)，没有把局部成果计作全模式完成。\n\n'+marker);
 return s.replace('九種','九种');
});
edit('docs/research/findings.md',s=>{
 s=replace(s,'当前CN按精确prefabId和全部等级黑板关联22个源技能ID、13个prefab','该批CN按精确prefabId和全部等级黑板关联22个源技能ID、13个prefab，后续数量见R33');
 s=replace(s,'保留独立转移伤害/标记未接项。','保留独立能力边界；转伤在后续R34接入，标记仍未接。');
 s=replace(s,'缺失同版道具定义及未接效果/流程继续单列，不计完整训练验收。','后续同版缺号复核及HP/Boss消费见R35，未接效果/流程继续单列，不计完整训练验收。');
 return s;
});
console.log('Current docs now point to contract batch and precise remaining evidence.');
