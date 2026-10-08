# 机制专题

[返回文档导航](../README.md) · [当前推进计划](../plan.md) · [逐项验收](../checklists/README.md)

这些文档解释已有执行器及其边界。新增机制按[客户端逻辑流水线](../research/client-logic-pipeline.md)追踪组件、动作模板和原生方法，把同一执行机制对应的技能/敌人一起实现和展开验证；逐人清单用于保留适用范围与结果，不要求重复手工观察同类技能。技能文案、社区资料和录像用于交叉核对及运行时差异，不能替代已可读取的实现过程。

带日期的批次段落保留当时证据与验证边界，其中旧版本号、“下一批”和当时缺口不是现行推进顺序。既有受限验收无需因说明整理而重做；新原始证据确实改变行为判断时，再核受影响项。

| 领域 | 具体说明 |
|---|---|
| 卫戍批量接入 | [技能编译、范围与生命周期](garrison-skill-batches.md) · [当前批量工作表](../generated/garrison-batches.md) |
| 基础行动与伤害 | [职业行动](basic-actions.md) · [攻击/建设/弹道](operator-mechanics.md) · [元素损伤](elemental-damage.md) |
| 公共能力与特质 | [属性与公共增益](common-buffs.md) · [客户端属性图](client-stat-buffs.md) · [公共回费](common-cost-skills.md) · [卫戍特质](garrison-implementation.md) |
| 职业分支 | [猎手](hunter.md) · [秘术师](mystic.md) · [浮游单元](funnel.md) · [傀儡师与纸偶](dollkeeper.md) |
| 召唤、复制与编队 | [战术实体](tactician.md) · [四槽甄选](diy-roster.md) |
| 商店与经济 | [道具来源约束、训练与服务器边界](shop-items.md) |
| 敌人与 Boss | [普通动作通道与门控](enemy-basic-actions.md) · [共享 SP 与技能调度](enemy-skills.md) · [敌群模板与数量原生逻辑](../research/enemy-replacement-native.md) · [冰系敌人](enemy-cold.md) · [器物死亡生成](enemy-death-spawn.md) · [根公共被动](enemy-passives.md) · [Boss 源组件和缺口](../generated/boss-mechanics.md) |

只在相关专题记录行为、源依据、近似与验证方法；工作顺序回到推进计划，个人完成勾选回到验收清单。
