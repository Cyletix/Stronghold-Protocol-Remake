# 卫戍池基础能力优先级

先处理卫戍池实际受影响的底层共享依赖，再处理依赖这些基础能力的模式和复活；非池候选保留，不能因图更简单而抢占池内任务。

[当前计划](../plan.md) · [机器优先级](../../work/garrison-foundation-priority.json) · [模式公共合同](enemy-mode-dispatch.md)

池内只采用[出场引用索引](../../work/garrison-encounter-scope.json)：两季可选敌群、已引用关卡 SPAWN、Boss 轮次与策略召敌。属性表、覆盖表、图鉴别名和仅有悬赏声明均不能单独进入优先队列。

原固定动作名单保留 38 个历史成员；其中 **15 个有出场引用**，当前仍有缺口 **9 个**。已有自动 provider **3 条**，其中池内 **0 条**；已接记录保留。

链式弹体公共合同已接 **3 敌**，其中卫戍池 **0 敌**；只解除对应普通动作缺口。

技能调度已接 **2 个技能组件 / 1 敌**；有出场引用的技能仍有 **4 个组件**未接。其中环境入口未可达 **1 个**暂缓，继续推进 **3 个**。已接中明确仍缺自动阶段入口 **1 个**；这些记录为已接技能本体、入口待办，不能按自动遭遇已生效计算。已接本体不重复开发，模式激活、其他技能及整敌完成另计。

原冻结技能表 27 个稳定 ID 全部保留；其中 21 个不在本次出场优先范围，不能计入卫戍完成率。

周期 Buff 与直接能力为独立已接组：**0 组 / 0 敌**（卫戍 0）；包含 0 类能力、0 处组内绑定。已接组复用，不抵扣 EnemySkill 未完成总数，也不代表整敌完成。

**依赖影响数不等于完成数，也不等于下一次可直接接入数。** 同一敌人可能依赖多种基础能力，以下人数不能相加。

| 优先 | 基础家族 | 池内依赖影响 | 固定动作缺口涉及 | 当前直接可接 | 前置共享依赖 |
| ---: | --- | ---: | ---: | ---: | --- |
| 1 | 技能触发与能力调度 | 6 | 3 | 0 | 独立基础合同 |
| 2 | 统一Buff与模式属性 | 4 | 0 | 0 | 独立基础合同 |
| 3 | 攻击事件与多段时序 | 3 | 1 | 0 | 独立基础合同 |
| 4 | 特殊弹体与投射生命周期 | 3 | 3 | 0 | 独立基础合同 |
| 5 | 模式进入、退出与能力生命周期 | 8 | 8 | 0 | 技能触发与能力调度、统一Buff与模式属性 |
| 6 | 死亡与复活 | 0 | 0 | 0 | 统一Buff与模式属性、模式进入、退出与能力生命周期 |

“当前直接可接”只认完整编译合同。已accepted的provider已接入，其余纯切换图、待补生命周期候选仍属于合同工作，不能记为可直接接入。

## 1. 技能触发与能力调度

按已定位的技能、触发器和能力入口补共用调度接口；先闭合可追溯的一类调用合同。

本组需要多个明确合同，不承诺实现一个算子即可闭合整组。

共用算子：resolve-enemy-skill-trigger, trigger-enemy-skill, trigger-named-ability, ability-component-event-binding, action-sequence-control, conditional-action-tree。
池内稳定ID：enemy_1040_bombd, enemy_1373_ltnhor_2, enemy_1425_lrcmra, enemy_1425_lrcmra_2, enemy_2025_syufo, enemy_9021_acduml。

## 2. 统一Buff与模式属性

统一参数作用域、完整Buff动作与模式属性读写；按当前拒绝的效果/动作家族逐类接入。

本组需要多个明确合同，不承诺实现一个算子即可闭合整组。

共用算子：buff-template-dispatch, bind-buff-mode-parameter, compile-mode-attributes, action-sequence-dispatch, buff-presence-checker, compound-state-checker, finish-buff-by-id。
池内稳定ID：enemy_1040_bombd, enemy_1425_lrcmra, enemy_1425_lrcmra_2, enemy_2025_syufo。

## 3. 攻击事件与多段时序

补齐同一攻击的事件门控、多段和时序合同；缺失动画事件先补对应源数据。

本组需要多个明确合同，不承诺实现一个算子即可闭合整组。

共用算子：compile-mode-channel, bind-mode-attack-blackboard。
池内稳定ID：enemy_1040_bombd, enemy_1439_dslntf, enemy_9021_acduml。

## 4. 特殊弹体与投射生命周期

先按齐射、目的地、存活期控制和速度缺失分开合同；不同弹体行为不合并成单一速度算子。

本组需要多个明确合同，不承诺实现一个算子即可闭合整组。

共用算子：先按固定动作标签拆分弹体合同。
池内稳定ID：enemy_1040_bombd, enemy_1373_ltnhor_2, enemy_9021_acduml。

## 5. 模式进入、退出与能力生命周期

在基础能力/Buff合同上接模式启停、状态保留与目标绑定；已接provider继续复用。

本组需要多个明确合同，不承诺实现一个算子即可闭合整组。

共用算子：dispatch-ability-lifecycle-event, mode-entry-dispatch, switch-mode, toggle-buff-lifecycle, resolve-active-default-mode, check-current-mode。
池内稳定ID：enemy_1040_bombd, enemy_1373_ltnhor_2, enemy_1422_lrsldr, enemy_1422_lrsldr_2, enemy_1425_lrcmra, enemy_1425_lrcmra_2, enemy_1439_dslntf, enemy_2025_syufo。

## 6. 死亡与复活

按死亡拦截、复活预算、恢复、模式和Buff保留的完整分支接入；不能只补复活血量。

本组需要多个明确合同，不承诺实现一个算子即可闭合整组。

共用算子：named-ability-resolution, reborn-activation-registration, reborn-budget-condition, reborn-buff-condition, reborn-buff-lifecycle, reborn-effect-lifecycle, reborn-handler-lifecycle, reborn-hp-recharge, reborn-keep-alive, reborn-mode-target, reborn-preset-selection, reborn-wave-condition, terminal-kill-action。
池内稳定ID：无；排在池内任务之后。

## 研究线索与已接状态

泛化实体状态定位关联 8 个池内敌人，但还没有共同可执行合同，单独保留为研究线索，未放入“一个算子可解决”的排名。

已接provider和具体未接候选保留在机器回执中。固定动作队列只用来查影响；已不在当前缺口中的成员仍保留，不生成逐敌实施任务。

| 固定动作成员 | 名称 | 当前动作状态 | 基础家族 | 源数据缺口 |
| --- | --- | --- | --- | --- |
| `enemy_10018_sgrobh` | “独轮车玩具” | 无直接出场引用；保留来源，不派工 | 特殊弹体与投射生命周期、模式进入、退出与能力生命周期 | animation-key-alias |
| `enemy_10026_vtzepl` | 物资运输艇 | 无直接出场引用；保留来源，不派工 | 攻击事件与多段时序 | — |
| `enemy_10026_vtzepl_2` | 大容量物资运输艇 | 无直接出场引用；保留来源，不派工 | 攻击事件与多段时序 | — |
| `enemy_10035_cnvdnc` | 热烈舞团独舞者 | 无直接出场引用；保留来源，不派工 | 技能触发与能力调度、模式进入、退出与能力生命周期 | — |
| `enemy_10035_cnvdnc_2` | 热烈舞团领舞者 | 无直接出场引用；保留来源，不派工 | 技能触发与能力调度、模式进入、退出与能力生命周期 | — |
| `enemy_10044_wintun` | 咸鳞汁推荐者 | 无直接出场引用；保留来源，不派工 | 技能触发与能力调度、模式进入、退出与能力生命周期 | — |
| `enemy_10098_crhro` | 主角阵营角色 | 无直接出场引用；保留来源，不派工 | 模式进入、退出与能力生命周期、死亡与复活 | — |
| `enemy_10099_crvln` | 反派阵营角色 | 无直接出场引用；保留来源，不派工 | 攻击事件与多段时序、模式进入、退出与能力生命周期 | — |
| `enemy_10099_crvln_2` | 命定的反派 | 无直接出场引用；保留来源，不派工 | 攻击事件与多段时序、模式进入、退出与能力生命周期 | — |
| `enemy_1010_demon` | 萨卡兹大剑手 | 当前无该动作缺口；整敌另计 | 先按已有源缺口补齐依据 | animation-name-unresolved |
| `enemy_1010_demon_2` | 萨卡兹大剑组长 | 当前无该动作缺口；整敌另计 | 先按已有源缺口补齐依据 | animation-name-unresolved |
| `enemy_10162_mnctpt` | 自制投石机 | 无直接出场引用；保留来源，不派工 | 攻击事件与多段时序、特殊弹体与投射生命周期 | — |
| `enemy_1040_bombd` | 暴鸰 | 仍有动作缺口 | 技能触发与能力调度、特殊弹体与投射生命周期、模式进入、退出与能力生命周期 | — |
| `enemy_1112_emppnt` | 帝国炮火先兆者 | 当前无该动作缺口；整敌另计 | 特殊弹体与投射生命周期 | projectile-speed-absent |
| `enemy_1112_emppnt_2` | 帝国炮火中枢先兆者 | 无直接出场引用；保留来源，不派工 | 特殊弹体与投射生命周期 | projectile-speed-absent |
| `enemy_1151_dslntc` | 钵海收割者 | 无直接出场引用；保留来源，不派工 | 模式进入、退出与能力生命周期 | animation-name-unresolved |
| `enemy_1151_dslntc_2` | 富营养的收割者 | 无直接出场引用；保留来源，不派工 | 模式进入、退出与能力生命周期 | animation-name-unresolved |
| `enemy_1225_dkmage` | 萨卡兹子裔链术师 | 无直接出场引用；保留来源，不派工 | 特殊弹体与投射生命周期 | — |
| `enemy_1225_dkmage_2` | 萨卡兹子裔链术师组长 | 无直接出场引用；保留来源，不派工 | 特殊弹体与投射生命周期 | — |
| `enemy_1234_dsubrl` | 深溟巢涌者 | 当前无该动作缺口；整敌另计 | 技能触发与能力调度 | — |
| `enemy_1234_dsubrl_2` | 富营养的巢涌者 | 当前无该动作缺口；整敌另计 | 技能触发与能力调度 | — |
| `enemy_1373_ltnhor_2` | 巫王乐团圆号手 | 仍有动作缺口 | 技能触发与能力调度、特殊弹体与投射生命周期、模式进入、退出与能力生命周期 | — |
| `enemy_1422_lrsldr` | 萨卡兹枯朽前锋 | 仍有动作缺口 | 模式进入、退出与能力生命周期 | — |
| `enemy_1422_lrsldr_2` | 萨卡兹枯朽辟路前锋 | 仍有动作缺口 | 模式进入、退出与能力生命周期 | — |
| `enemy_1425_lrcmra` | 孽罪奇美拉 | 仍有动作缺口 | 模式进入、退出与能力生命周期 | — |
| `enemy_1425_lrcmra_2` | 渎罪奇美拉 | 仍有动作缺口 | 模式进入、退出与能力生命周期 | — |
| `enemy_1439_dslntf` | 元核孽生者 | 仍有动作缺口 | 模式进入、退出与能力生命周期 | — |
| `enemy_1439_dslntf_2` | 异光体孽生者 | 无直接出场引用；保留来源，不派工 | 模式进入、退出与能力生命周期 | — |
| `enemy_1512_mcmstr` | “巨大的丑东西” | 无直接出场引用；保留来源，不派工 | 模式进入、退出与能力生命周期 | — |
| `enemy_1516_jakill` | 杰斯顿·威廉姆斯 | 无直接出场引用；保留来源，不派工 | 模式进入、退出与能力生命周期 | animation-key-alias |
| `enemy_1517_xi` | “自在” | 无直接出场引用；保留来源，不派工 | 特殊弹体与投射生命周期、模式进入、退出与能力生命周期、死亡与复活 | — |
| `enemy_1525_blkswb` | 锏 | 无直接出场引用；保留来源，不派工 | 攻击事件与多段时序、模式进入、退出与能力生命周期、死亡与复活 | — |
| `enemy_2004_balloon` | 喷气人 | 无直接出场引用；保留来源，不派工 | 攻击事件与多段时序、模式进入、退出与能力生命周期 | — |
| `enemy_2008_flking` | “墓碑” | 无直接出场引用；保留来源，不派工 | 模式进入、退出与能力生命周期 | — |
| `enemy_2025_syufo` | 掠海漂移体 | 仍有动作缺口 | 模式进入、退出与能力生命周期 | animation-key-alias |
| `enemy_2050_smsha` | 陷落雪祀 | 无直接出场引用；保留来源，不派工 | 特殊弹体与投射生命周期 | — |
| `enemy_9021_acduml` | 假想敌：管 | 仍有动作缺口 | 技能触发与能力调度、攻击事件与多段时序、特殊弹体与投射生命周期 | — |
| `enemy_9021_acduml_2` | 假想敌：管 | 当前无该动作缺口；整敌另计 | 攻击事件与多段时序、特殊弹体与投射生命周期 | — |
