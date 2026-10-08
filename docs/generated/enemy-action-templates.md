# 敌人动作公共模板表

由 `tools/classify_enemy_action_templates.py` 生成；后续以本表及 JSON 目录推进公共执行器，不重新逐敌阅读。原始输入哈希不变时只刷新导入状态和模板进度。

本次分类快照记录 **435** 个敌人带缺口，其中当时定义的卫戍池 **36** 个；共归入 **11** 个公共主类。标签可重叠，主类每敌唯一。

这是冻结分类快照，后续实现与出场范围变化未必已刷新到本表。**当前数量以[当前计划](../plan.md)及 `work/external-combat-import-report.json` 为准**；不要把本表的历史定义池数量当作当前实际出场池待办数。

范围：这是既有普攻动作导入报告的缺口分类，不是所有敌人技能完整性的审计。主类是实施推断；字段、引用和动画事件为所下载社区提取快照中的观察，不据此宣称原生行为已验证。

| 优先级 | 模板 | 未消费敌人 | 卫戍池 | 模板进度 | 公共处理方式 |
|---|---|---:|---:|---|---|
| 1 | `mode-dispatch` 多形态动作分派 | 189 | 21 | 模式内动作/受约束出生已接；阶段触发待接 | 模式内动作和受约束出生选择已接；按[固定 7 类模式表](enemy-mode-dispatch.md)补公共触发链。 |
| 2 | `root-action` 根能力/组合引用 | 105 | 4 | 已接源 NONE；剩余按根能力分表推进 | 沿 entity._modes → mode._combat/_attack 解引用，再展开组合能力；区分无普攻单位。 |
| 3 | `projectile-shape` 多弹体/特殊目的地 | 10 | 4 | 未接入 | 共享齐射、双弹、附加弹和目的地接口；轨迹数据另按缺失集合获取。 |
| 4 | `timeline-multihit` 多段施法与事件 | 14 | 3 | 已接单次施法首事件和固定连击序列，拆分与动态次数待闭合 | 按能力类型、次数和等待规则编译命中序列；固定间隔、拆分和目标变化分别补公共合同。 |
| 5 | `animation-source` 动画/事件数据缺口 | 27 | 2 | 已接入固定缺口的显式模型资源映射，余项保留空键或缺源 | 一次导出缺失动画 ID/事件集合；有映射的先复用，禁止猜击中帧。 |
| 6 | `shared-basic-contract` 基础动作合同接线 | 4 | 1 | 同模式合同的近战/远程通道已接；剩余差异继续保留 | 已有源字段按根动作接入公共合同；记录覆盖差异，不新增逐敌分支。 |
| 7 | `projectile-lifecycle` 弹体结束驱动动作 | 3 | 1 | 未接入 | 统一处理失效回调、动作结束、最短后摇与目标失效。 |
| 8 | `source-prefab` 补齐源配置 | 50 | 0 | 已接显式 prefabKey 资源映射；剩余按缺失源 key 补齐 | 先按源 prefabKey 复用现有资源，剩余按缺失 key 集合获取同版本 prefab。 |
| 9 | `timeline-gating` 时间模式/延迟门控 | 23 | 0 | mode 0 攻击事件门控已接；卫戍本类清零，其他时间模式仍待接 | 公共调度器消费 preDelay、timeMode、waitForAttackEvent。 |
| 10 | `projectile-speed` 弹体参数数据缺口 | 6 | 0 | 未接入 | 按缺失 projectileKey 批量补速度/运动配置，接入同一弹体执行器。 |
| 11 | `animation-alias` 逻辑动画名映射 | 4 | 0 | 公共映射已接入；保留多模式/多段剩余缺口 | 先应用 prefab._animations 的 animKey → animName/speed，再查 Spine 时间。 |

源表明确无需普攻 **342** 个（卫戍池 **45** 个），已接入通用普攻开关，单独记为不适用。它们的技能、被动、召唤和阶段仍按各专题推进，不算整敌完成。

## 根能力固定分表

源字段只提取一次，后续随导入状态刷新待办数。`_combat` 与 `_attack` 分开保留；无普攻由数据库显式 NONE 判定，不由属性为零或动画名称推测。非伤害根仍可能通过 Buff 或动作节点执行机制。

| 根能力类别 | 固定集合 | 当前普攻缺口 | 卫戍池缺口 |
| --- | ---: | ---: | ---: |
| `no-basic-attack` 源表明确无需普攻 | 276 | 0 | 0 |
| `summon-root` 召唤根能力 | 2 | 2 | 0 |
| `action-node-root` 序列化动作节点 | 3 | 3 | 0 |
| `animation-or-custom-root` 动画或自定义能力 | 21 | 19 | 2 |
| `base-or-custom-root` 基类字段或自定义能力 | 25 | 25 | 2 |
| `null-root` 各模式均为空根 | 56 | 56 | 0 |

字段、节点类型、Buff 引用和各模式通道均保存在 [根能力目录](../../work/enemy-root-capability-catalog.json)。动画或基类字段不足以确认自定义实现为空，继续作为明确缺口保留。

## 一次抽样记录

代表由卫戍池优先、标签覆盖优先固定选取；下列摘要直接来自已缓存字段。用于审查同类边界，不代表逐敌运行验收。

- **多形态动作分派**：
  - `enemy_10018_sgrobh` “独轮车玩具”：模式 2，根伤害能力 4；Attack→Attack1 OnAttack=[1.0]; Attack→Attack1 OnAttack=[1.0]。标签：animation-key-alias, multiple-modes-different-contract, multiple-projectile-keys, projectile-lifetime-controls-action, projectile-volley-or-destination。
  - `enemy_1373_ltnhor_2` 巫王乐团圆号手：模式 2，根伤害能力 4；Attack→Attack OnAttack=[0.6666667]; Attack→Attack OnAttack=[0.6666667]。标签：attack-named-nonroot-ability, multiple-modes-different-contract, multiple-projectile-keys。
- **根能力/组合引用**：
  - `enemy_10035_cnvdnc` 热烈舞团独舞者：模式 2，根伤害能力 0；未取得可匹配 OnAttack 时间线。标签：multiple-modes-same-contract, root-damage-ability-unresolved。
  - `enemy_10035_cnvdnc_2` 热烈舞团领舞者：模式 2，根伤害能力 0；未取得可匹配 OnAttack 时间线。标签：multiple-modes-same-contract, root-damage-ability-unresolved。
- **多弹体/特殊目的地**：
  - `enemy_9021_acduml` 假想敌：管：模式 1，根伤害能力 2；Attack→Attack OnAttack=[0.8333, 1.6, 1.8333]; Attack→Attack OnAttack=[0.8333, 1.6, 1.8333]。标签：attack-named-nonroot-ability, fixed-repeat-contract-unresolved, multiple-onattack-events, projectile-volley-or-destination。
  - `enemy_9021_acduml_2` 假想敌：管：模式 1，根伤害能力 2；Attack→Attack OnAttack=[0.8333333, 1.6, 1.8333334]; Attack→Attack OnAttack=[0.8333333, 1.6, 1.8333334]。标签：fixed-repeat-contract-unresolved, multiple-onattack-events, projectile-volley-or-destination。
- **多段施法与事件**：
  - `enemy_10162_mnctpt` 自制投石机：模式 1，根伤害能力 4；Attack_2→Attack_2 OnAttack=[2.4]; Attack→Attack OnAttack=[2.4]。标签：fixed-repeat-contract-unresolved, multiple-projectile-keys。
  - `enemy_10026_vtzepl` 物资运输艇：模式 1，根伤害能力 1；Attack→Attack OnAttack=[0.4333333]。标签：fixed-repeat-contract-unresolved。
- **动画/事件数据缺口**：
  - `enemy_1010_demon` 萨卡兹大剑手：模式 1，根伤害能力 1；未取得可匹配 OnAttack 时间线。标签：animation-name-unresolved。
  - `enemy_1010_demon_2` 萨卡兹大剑组长：模式 1，根伤害能力 1；未取得可匹配 OnAttack 时间线。标签：animation-name-unresolved。
- **基础动作合同接线**：
  - `enemy_2008_flking` “墓碑”：模式 2，根伤害能力 6；Attack_3→Attack_3 OnAttack=[0.4333]; Attack_2→Attack_2 OnAttack=[0.4333]。标签：multiple-modes-same-contract。
  - `enemy_4010_mubsbl` 长臂投手：模式 1，根伤害能力 3；Attack→Attack OnAttack=[0.5667]; Attack→Attack OnAttack=[0.5667]。标签：multiple-projectile-keys。
- **弹体结束驱动动作**：
  - `enemy_2050_smsha` 陷落雪祀：模式 1，根伤害能力 2；Attack→Attack OnAttack=[0.4]; Attack→Attack OnAttack=[0.4]。标签：projectile-lifetime-controls-action。
  - `enemy_7033_xbdrcar` 采掘机
：模式 1，根伤害能力 1；未取得可匹配 OnAttack 时间线。标签：animation-name-unresolved, nondefault-time-gating, projectile-lifetime-controls-action。
- **补齐源配置**：
  - `enemy_19001_akshep` 星术绒绒：模式 0，根伤害能力 0；未取得可匹配 OnAttack 时间线。标签：prefab-source-absent, root-damage-ability-unresolved, spine-source-absent。
  - `enemy_19002_akspsp` 奥术绒绒：模式 0，根伤害能力 0；未取得可匹配 OnAttack 时间线。标签：prefab-source-absent, root-damage-ability-unresolved, spine-source-absent。
- **时间模式/延迟门控**：
  - `enemy_1177_dufrbl` 净浊之焰：模式 1，根伤害能力 2；未取得可匹配 OnAttack 时间线。标签：animation-name-unresolved, nondefault-time-gating, spine-source-absent。
  - `enemy_1177_dufrbl_2` 净浊之焰：模式 1，根伤害能力 2；未取得可匹配 OnAttack 时间线。标签：animation-name-unresolved, nondefault-time-gating, spine-source-absent。
- **弹体参数数据缺口**：
  - `enemy_10152_nstree` “自由的树”：模式 1，根伤害能力 2；Attack→Attack OnAttack=[1.9667]; Attack→Attack OnAttack=[1.9667]。标签：projectile-speed-absent。
  - `enemy_10152_nstree_2` “逐日的树”：模式 1，根伤害能力 2；Attack→Attack OnAttack=[1.9667]; Attack→Attack OnAttack=[1.9667]。标签：projectile-speed-absent。
- **逻辑动画名映射**：
  - `enemy_2037_sygirl` “偏执泡影”：模式 4，根伤害能力 4；Attack→C1_Attack OnAttack=[0.7667]; Attack→C1_Attack OnAttack=[0.7667]。标签：animation-key-alias, multiple-modes-same-contract, projectile-speed-absent, reborn-lifecycle-hook-declared。
  - `enemy_5016_ciprfd` 提亚卡乌好战者（愚人节）：模式 1，根伤害能力 1；Attack→Idle OnAttack=[]。标签：animation-key-alias, onattack-event-absent。

## 重叠标签

| 标签 | 当前缺口敌人数 |
|---|---:|
| `multiple-modes-different-contract` | 189 |
| `root-damage-ability-unresolved` | 155 |
| `spine-source-absent` | 91 |
| `animation-name-unresolved` | 64 |
| `nondefault-time-gating` | 58 |
| `multiple-projectile-keys` | 54 |
| `prefab-source-absent` | 50 |
| `reborn-lifecycle-hook-declared` | 44 |
| `multiple-modes-same-contract` | 42 |
| `animation-key-alias` | 42 |
| `fixed-repeat-contract-unresolved` | 22 |
| `projectile-volley-or-destination` | 20 |
| `attack-named-nonroot-ability` | 20 |
| `onattack-event-absent` | 19 |
| `projectile-speed-absent` | 18 |
| `multiple-onattack-events` | 16 |
| `projectile-lifetime-controls-action` | 7 |

## 批量推进约定

1. 按卫戍池覆盖排序实现公共模板；每类只验代表、边界和总覆盖计数。
2. 一个敌人可有多个标签；解决主类后由剩余标签继续跟踪，不能将整敌宣告完成。
3. `root-action` 包含组合根、无常规伤害动作和待解析引用，不能全部当作缺技能；`animation-source` 是数据补齐任务。
4. `attack-named-nonroot-ability` 仅说明 Attack 名动作不在已解出的根普攻集合，不能仅靠名称当普攻。
5. 源快照没有完整弹体运动曲线，本表只观察目的地/多弹体标志；曲线缺失按 projectileKey 集合取数。
6. 运行 `python tools/classify_enemy_action_templates.py` 重用缓存；用 `--status 模板ID=状态` 更新模板进度。状态保存在 JSON，重建时保留。

## 来源

- [Tim23333/Arknights_timer 固定提交](https://github.com/Tim23333/Arknights_timer/tree/d2f6d76a7172cedc7583fc0a4eb998699abf25f5/Ark_emulator/ark_emulator)，源目录 2075 个 prefab。
- `work/external-combat-import-report.json` 提供当前未消费状态，`web/enemy_encounters.json` 提供卫戍优先池。
- `work/enemy-action-template-catalog.json` 保存全体条目的稳定主类、多标签、字段摘要、引用、来源 SHA-256 和人工模板进度。
