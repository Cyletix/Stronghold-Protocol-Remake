# 客户端公共执行类型复用索引

本报告把既有诊断分组展开为“真实组件类型 / 动作类型 → prefab → sourceSkillId”，用于寻找公共执行机制。只读取现有候选文件，不重新提取客户端、不改运行时，也不把字段差异分组当作必须逐一重写的任务。推进顺序仍以[当前计划](../plan.md)为准，本报告的排序仅表示源图中的出现次数。

输入：`work/client-logic/mechanism-candidates.json`；semantic SHA-256：`3f63865f315dd54bba7e19626a1bed5db3f72dc3a022b418d1f39ffe34d125af`。

当前输入有 **893 个 prefab、690 个原诊断组，其中 600 组为单例**。原分组同时包含组件配置差异及动作签名，单例并不代表独有执行器。反向索引得到 **169 个组件类型、282 个动作类型**。

已有消费者映射覆盖 882 个唯一 sourceSkillId、882 条 prefab→skill 引用；26 个 prefab 没有消费者映射，仍完整保留。组件实例共 4017 个，已解析 4017 个，未解析 0 个。类型与 prefab 的不同出现关系分别为组件 3746 条、动作 2653 条；动作输入已按类型去重，不能据此统计动作节点实例数。

**计数边界**：出现范围不等于新增支持范围或完整可运行范围。一个 prefab / 技能可同时出现多个组件和动作类型，表内行不可相加；同一公共组件的不同参数、外部角色模式、事件时序、选择器及未解析引用仍需沿具体源图验证。本工具只索引候选文件已经收录的组件与静态动作，不把外部引用自动展开成已覆盖行为，也不据 Web 登记与否宣布完成。

## 组件类型：前20项

| 真实组件类型 | prefab | 唯一 sourceSkillId | 组件实例 | 原分组 |
|---|---:|---:|---:|---:|
| `Torappu.Battle.CastSkill` | 596 | 585 | 596 | 453 |
| `Torappu.Battle.Abilities.ActiveBuffAbility` | 557 | 546 | 572 | 402 |
| `Torappu.Battle.Abilities.UberEffectEmitter` | 295 | 296 | 320 | 253 |
| `Torappu.Battle.AutoLoadBoxRange` | 280 | 276 | 327 | 253 |
| `Torappu.Battle.AdvancedSelector` | 171 | 169 | 201 | 159 |
| `Torappu.Battle.Abilities.ThreePartChannelingAnimation` | 98 | 94 | 98 | 90 |
| `Torappu.Battle.SelectorTrigger` | 98 | 97 | 119 | 88 |
| `Torappu.Battle.Abilities.RangedAttack` | 87 | 87 | 96 | 72 |
| `Torappu.Battle.Abilities.MeleeAttack` | 78 | 77 | 87 | 71 |
| `Torappu.Battle.ReplacementSkill` | 69 | 69 | 69 | 46 |
| `Torappu.Battle.Abilities.PassiveBuffAbility` | 67 | 66 | 70 | 64 |
| `Torappu.Battle.ReplacementSkillFixed` | 59 | 59 | 59 | 53 |
| `Torappu.Battle.Skills.BuffDuringSkill` | 59 | 58 | 59 | 58 |
| `Torappu.Battle.Abilities.BuffToOwner` | 57 | 56 | 65 | 55 |
| `Torappu.Battle.BlockedOrAdvancedSelector` | 52 | 52 | 62 | 45 |
| `Torappu.Battle.TargetValidator` | 48 | 46 | 53 | 43 |
| `Torappu.Battle.Abilities.AuraAbility` | 41 | 40 | 45 | 37 |
| `Torappu.Battle.Abilities.AbilitySequenceGroup` | 40 | 39 | 40 | 39 |
| `Torappu.Battle.Abilities.ActiveAbilityWrapper` | 38 | 38 | 38 | 37 |
| `Torappu.Battle.Abilities.GlobalAuraAbility` | 38 | 37 | 40 | 32 |

## 动作类型：前20项

| 真实动作类型 | prefab | 唯一 sourceSkillId | 原分组 |
|---|---:|---:|---:|
| `Torappu.Battle.Action.Nodes+SwitchMode` | 538 | 526 | 413 |
| `Torappu.Battle.Action.Nodes+CreateBuff` | 165 | 162 | 164 |
| `Torappu.Battle.Action.Nodes+IfElse` | 133 | 133 | 131 |
| `Torappu.Battle.Action.Nodes+FinishBuffsById` | 98 | 96 | 98 |
| `Torappu.Battle.Action.Nodes+CheckContainsBuff` | 85 | 85 | 84 |
| `Torappu.Battle.Action.Nodes+FinishBuff` | 77 | 76 | 77 |
| `Torappu.Battle.Action.Nodes+IfNot` | 71 | 71 | 70 |
| `Torappu.Battle.Action.Nodes+ModifyCost` | 62 | 60 | 58 |
| `Torappu.Battle.Action.Nodes+CreateEffect` | 58 | 57 | 58 |
| `Torappu.Battle.Action.Nodes+TriggerAbility` | 58 | 57 | 58 |
| `Torappu.Battle.Action.Nodes+AlwaysNext` | 53 | 53 | 52 |
| `Torappu.Battle.Action.Nodes+AdvancedApplyDamage` | 36 | 35 | 36 |
| `Torappu.Battle.Action.Nodes+PlayAudio` | 35 | 34 | 35 |
| `Torappu.Battle.Action.Nodes+FinishDerivedBuff` | 34 | 34 | 33 |
| `Torappu.Battle.Action.Nodes+RechargeToken` | 34 | 34 | 25 |
| `Torappu.Battle.Action.Nodes+CalculateBlackboardValueViaParams` | 29 | 29 | 29 |
| `Torappu.Battle.Action.Nodes+Evade` | 26 | 25 | 23 |
| `Torappu.Battle.Action.Nodes+FilterByBlackboardValue` | 26 | 26 | 26 |
| `Torappu.Battle.Action.Nodes+BlockDamage` | 22 | 22 | 22 |
| `Torappu.Battle.Action.Nodes+CheckCharSkillAffecting` | 21 | 21 | 20 |

## 完整索引与验证

完整结果保存在 `work/client-logic/execution-reuse.json`，包含每种类型的全部 prefabIds、sourceSkillIds、groupIds 和逐 prefab 消费者映射。下列查询按完整类型名精确匹配，输出完整ID列表，不截断为前20项：

```powershell
python -B tools/audit_client_execution_reuse.py
python -B tools/audit_client_execution_reuse.py --check
python -B tools/audit_client_execution_reuse.py --component Torappu.Battle.CastSkill
python -B tools/audit_client_execution_reuse.py --action Torappu.Battle.Action.Nodes+SwitchMode
```

`--check`比较当前索引与报告，以及输入的语义摘要：prefab的组件nodeId/script、动作类型、消费者、groupId和完整groups。无关的顶层Web输入哈希变化不会使本报告失效；消费者登记或原分组内容改变仍需要重建。工具同时断言分组恰好分割全部prefab、各组技能集合与消费者一致、组件实例守恒，以及组件/动作正反索引的类型引用守恒。该检查证明索引没有漏算或错连，不能自证游戏行为符合原版。
