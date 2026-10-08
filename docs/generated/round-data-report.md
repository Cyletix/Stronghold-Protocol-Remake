# 轮次配置关联报告（自动生成）

来源：`data/ArknightsGameData/zh_CN/gamedata/excel/activity_table.json`；SHA256：`27d95d26e42dc9cd133ed568181ea389b056a4faaaee1a9952dde57fdf149e1f`。运行 `node tools/build_mode_rounds.js` 更新，`--check` 检查漂移。

| 赛季 | 模式 | 配置轮数 | 领袖候选所在轮 | isSpPrepare 所在轮 | 地图候选数 |
|---|---|---:|---|---|---:|
| act2autochess | mode_training_1 | 4 | 4 | 3 | 1 |
| act2autochess | mode_single_funny | 9 | 9 | 无 | 1 |
| act2autochess | mode_single_normal | 15 | 14,15 | 6,9 | 11 |
| act2autochess | mode_single_hard | 15 | 14,15 | 3,9,11 | 7 |
| act2autochess | mode_single_abyss | 15 | 14,15 | 3,9,11 | 7 |
| act2autochess | mode_multi_funny | 14 | 14 | 3,9 | 1 |
| act2autochess | mode_multi_normal | 15 | 14,15 | 3,6,9 | 8 |
| act2autochess | mode_multi_hard | 15 | 14,15 | 3,9,11 | 7 |
| act2autochess | mode_multi_abyss | 15 | 14,15 | 3,9,11 | 7 |
| act1autochess | mode_training_1 | 4 | 4 | 3 | 1 |
| act1autochess | mode_single_funny | 9 | 9 | 无 | 4 |
| act1autochess | mode_single_normal | 15 | 14,15 | 6,9 | 5 |
| act1autochess | mode_single_hard | 15 | 14,15 | 3,9,11 | 5 |
| act1autochess | mode_multi_funny | 14 | 14 | 3,9 | 4 |
| act1autochess | mode_multi_normal | 15 | 14,15 | 3,6,9 | 5 |
| act1autochess | mode_multi_hard | 15 | 14,15 | 3,9,11 | 5 |

唯一关卡引用 47 个，已找到 47 个；其中含waves的关卡 47 个。引用检查发现 2 项。完整原始路线、波次、敌人覆盖、runes与阶段引用在 `web/mode_rounds.json`。

声明生成数量是SPAWN动作count相加，含条件/分支时不能当实际敌人数。保留多个boss候选；保留isSpPrepare，不解释成弹窗时机；act2引用act1关卡不作为缺失。build_source_battles继续生成运行期敌人覆盖、地图及波次，卫戍协议对局已消费主波次；动态分支、随机组合及boss坐标映射仍有明确差异。

| 缺口类型 | 数量 |
|---|---:|
| branch-route-namespace-unconfirmed | 2 |

后续消费与优先级见 [推进计划](../plan.md)，字段缺口见 [数据问题表](../research/data-inventory.md#priority)。本报告只记录源配置与引用完整性，不证明调度语义已复刻。
