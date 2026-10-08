# 卫戍控制器公共能力族（2026-09-18）

本表只分类，不计新增接入。使用已有缓存做一次结构展开；没有重新解包、原生扫描或改编译器/运行时。

首拒绝 `unsupported-skill-companions` 共 182 项；排除四提供者已绑定 22 项，分类 160 项。另有旧专用处理器 34 项，计迁移、不计新增；净新增候选 126 项。

旧 24 项分类仍引用 `skill-next-public-families-20260918.json`，与本次首拒绝集合交集为 0，未重复计算收益。

## 结论

最大共用基础是有序/并行/选支能力图的调度与完整叶子节点审查，不能把同名根组件当作已经闭合。当前没有证据支持“补一个控制器即可直接接通至少 5 项”；已证明可立即接通数保持 0。最窄的下一实施组是模式结束后自身状态（极光 S1、远山 S2、雷蛇 S2），可先对整组做完整字段编译。

## 互斥能力族

| 能力族 | 全部候选 | 净新增候选 | 后续语义子组 |
|---|---:|---:|---:|
| 施放时有序/并行/选支动作调度 | 21 | 18 | 21 |
| 主动技能Buff事件树 | 23 | 15 | 23 |
| 下一击命中/自身事件（按子合同再分） | 18 | 13 | 18 |
| 直接施放选敌/投递动作图 | 7 | 6 | 7 |
| 可停止/过载模式控制器 | 8 | 6 | 8 |
| 蓄力档位判断与Buff模式切换 | 5 | 5 | 4 |
| 有限弹药与附加事件计数 | 5 | 5 | 5 |
| 主动技能加被动事件载体 | 7 | 4 | 6 |
| 被动技能与伤害/倍率事件 | 4 | 4 | 4 |
| 下一次治疗与额外治疗/特性事件 | 6 | 4 | 6 |
| 下一击选择器/弹体/直接动作缺口 | 8 | 4 | 8 |
| 召唤/装置及宿主控制 | 5 | 4 | 4 |
| 挂载/卸载技能与模式事件 | 3 | 3 | 3 |
| 主动三段引导与专属弹体 | 3 | 3 | 3 |
| 三段引导模式及事件树 | 5 | 3 | 5 |
| 持续引导攻击与施法期Buff | 4 | 3 | 4 |
| 模式技能结束后附加状态 | 4 | 3 | 2 |
| 下一击并行/选支动作图 | 3 | 3 | 3 |
| 技能寿命内状态事件 | 3 | 3 | 3 |
| 切换技能与持续属性 | 3 | 3 | 3 |
| 爆发弹药与过载控制器 | 2 | 2 | 2 |
| 被动技能属性或命中Buff | 2 | 2 | 2 |
| 下一击自主/回旋弹体 | 2 | 2 | 2 |
| 下一击三段引导与牵引弹体 | 2 | 2 | 1 |
| 切换技能与特殊事件 | 2 | 2 | 2 |
| 三段引导模式/治疗选择 | 2 | 1 | 2 |
| 重复部署技能控制器 | 1 | 1 | 1 |
| 下一击强制位移命中 | 1 | 1 | 1 |
| 技能寿命内命名能力事件 | 1 | 1 | 1 |

## 三段引导与下一击的真实范围

- `three-part-channeling`：20 项，净新增候选 15 项，分成 19 个后续语义子组；单独补根控制器的可立即接通数未证明。
- `replacement-controllers`：40 项，净新增候选 29 项，分成 39 个后续语义子组；单独补根控制器的可立即接通数未证明。
- `skill-lifetime-buff`：22 项，净新增候选 22 项，分成 21 个后续语义子组；单独补根控制器的可立即接通数未证明。
- `ability-composition`：24 项，净新增候选 21 项，分成 24 个后续语义子组；单独补根控制器的可立即接通数未证明。

三段引导中，持续引导近战、牵引弹体、模式治疗、命名能力事件不是同一个实现。下一击中，治疗特性/元素治疗、位移、链或回旋弹体、命中Buff事件、子能力选支各有独立闭合门。原先“27/28”不能直接用作这次净新增数字。

## 推荐入口

1. **共享有序/并行/首成功/选支 Ability 图 IR 与执行游标**：覆盖上界 18 个净新增候选。覆盖最多净新增候选的控制器基础。复用已解析 direct action、属性Buff、选择器和现有投递；先以全部叶子已支持的子图筛入。其余命名能力、token、位移和自定义节点继续整图拒绝。
   成员：skchr_acpion_3, skchr_angel2_2, skchr_blemsh_2, skchr_blkkgt_3, skchr_etlchi_2, skchr_forcer_2, skchr_glady_3, skchr_qiubai_2, skchr_reed2_2, skchr_sunbr_2, skchr_texas2_2, skchr_texas2_3, skchr_thorn2_2, skchr_tinman_2, skchr_ulpia_3, skchr_vendla_2, skchr_yu_2, skchr_zumama_3
   仍缺：all Buff event actions and ownership/cleanup, not just component type；all source-level blackboard keys and controller semantics；begin/loop/end event gating and exact source controller flags；complete specialized projectile semantics；named ability target/blackboard and referenced body closure；ordered/parallel/conditional subability scheduling and cancellation；selected mode actor/selector/general ability and transition contract
2. **CompareCharSkillAvailableCnt 蓄力档位快照与派生Buff所有权**：覆盖上界 5 个净新增候选。5项都有实际蓄力条件图，而非只叫BuffDuringSkill：卡涅利安S1/S2/S3、灵知S2、流明S2。可共用档位判定/耗SP/派生Buff清理；卡涅利安S3层数伤害、灵知冷冻组合、流明异常治疗仍是各自必过叶子门，不能宣称一次接通5项。
   成员：skchr_billro_1, skchr_billro_2, skchr_billro_3, skchr_gnosis_2, skchr_lumen_2
   仍缺：all Buff event actions and ownership/cleanup, not just component type；all source-level blackboard keys and controller semantics；named ability target/blackboard and referenced body closure；selected mode actor/selector/general ability and transition contract
3. **BuffAfterAffecting 完整技能结束生命周期与自身异常状态**：覆盖上界 3 个净新增候选。当前最窄、风险最低的3项净新增结构组；都保留完整SwitchMode与基本Melee主体。仍须校验字段、全部黑板和结束/中断语义，3不是已可直接绑定数。
   成员：skchr_aurora_1, skchr_fmout_2, skchr_liskam_2
   仍缺：all Buff event actions and ownership/cleanup, not just component type；all source-level blackboard keys and controller semantics；selected mode actor/selector/general ability and transition contract

## 使用方式

后续只按机器表 `exclusiveFamilies` 和每个成员的 `completeFollowingGates` 推进。`componentDictionary` / `buffDictionary` / `templateDictionary` 在冻结的 closures 文件，成员以 SHA 和 JSON 指针关联；无需再打开每个原始 prefab。

命名能力/外部引用、源黑板完整消费、专属弹体和选中模式的未支持图均保留拒绝门；结构分类没有运行完整反事实编译，也不能替代实际行为与主机恢复验收。
