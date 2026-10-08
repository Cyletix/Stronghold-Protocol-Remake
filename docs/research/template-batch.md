# 固定模板表与增量执行

2026-09-14：原来未覆盖的 341 槽已一次扫描、抽样并归为 16 个主类。保留全等级黑板、说明、PRTS 备注、来源及 201 槽现成公式关联。后续直接使用[技能模板表](../../../data/derived/community-templates/README.md)，不重复阅读每个技能。

当前进度只在自动生成的[实时覆盖表](../generated/community-coverage.md)维护。固定 341 槽的归属不变，status.json 单独记录后续每批结果；静态可编译、参考公式单独可算和实际净补有交集，不能直接相加。

## 路径分工

| 路径（父工作区） | 内容与使用方式 |
| --- | --- |
| data/derived/community-templates/input-snapshot.json | 冻结 341 槽完整输入；首次阅读成果，后续不再取原表 |
| data/derived/community-templates/catalog.json | 16 类稳定归属、组合标签、代表抽查、参数依赖及现成公式链接 |
| data/derived/community-templates/README.md | 人与后续任务查看的固定分类表和当前状态 |
| data/derived/community-templates/bindings.json | 从冻结输入批量编译的每级算子绑定、参数指纹、消费/投影说明和未闭合 blocks |
| data/derived/community-templates/status.json | 原 341 槽的动态状态，不改变输入与主类 |
| work/community-dps-coverage.json | 全部 1,001 槽回执，保留引擎、条件、未提供量及原失败原因 |
| apps/dps/community_templates.cjs | 通用模板编译与执行钩子，无逐技能 ID 分支 |
| apps/dps/reference_formula_engine.py | 固定本地参考源码的整体类库桥；不执行模块顶层 I/O、pickle 或 dill |

卫戍对应入口为 [advance_community_templates.py](../../tools/advance_community_templates.py)，回执为 [community-template-advance.json](../../work/community-template-advance.json)。敌人使用[11 类动作表](../generated/enemy-action-templates.md)及 `work/enemy-action-template-catalog.json`，同样缓存字段、引用、动画和抽样结果。公共 animKey→animName/speed 映射已接入；完整根动作与发射弹速合同的后续批次见下文。

## 按表推进

从卫戍工作区运行：

```powershell
python tools/advance_community_templates.py --dry-run
python tools/advance_community_templates.py
python tools/advance_community_templates.py --slots ../data/derived/community-templates/reference-changed-slots.json
```

默认比较源元数据、模板输入和运行代码哈希；无变化时不编译、不计算，只刷新缓存状态。`--slots` 接收程序生成的 `charId:skillIndex` JSON 数组，只重算相应失败槽，其他成功和失败结果都复用。`--force-evaluate` 是显式重算全部剩余，`--full-dps` 是显式全量回归，日常不使用。

没有统一入口时，父工作区的底层命令如下：

```powershell
node apps/dps/community_templates.cjs compile data/derived/community-templates/input-snapshot.json
.venv/Scripts/python.exe tools/community_dps.py coverage --pending-only --slots data/derived/community-templates/reference-changed-slots.json
.venv/Scripts/python.exe tools/classify_community_templates.py --coverage work/community-dps-coverage.json
```

不加 `--rebuild`。只有明确换版本/新增队列才重建；规则变化但源不变，用 `--reclassify` 对冻结输入应用新规则。先从 bindings/catalog 得出某个公共修复的影响集合，再运行这一集合；出现具体冲突才定点回看源行。

## 模型与结果

主窗口保留原生事件模拟优先，社区路径依次使用原 akdata 核心、公共模板、本地 ArknightsDpsCompare 公式类。未知伤害、治疗或有限技能总量用 null，界面显示“未提供”；不伪造逐帧事件。投影条件、默认天赋条件、治疗分支与源码版本随快照保存。

固定来源是当前 CN 数值 `gamedata-cc5bf84b0e6d`、MIT akdata `266d341c`、研究参考 ArknightsDpsCompare `78df03a1`。后者没有明确许可证，仍位于 `work/external-dps-search/WhoAteMyCQQkie__ArknightsDpsCompare`，不复制进 vendor 或分享包；可用 `ARK_DPS_REFERENCE_SOURCE` 指定相同哈希的本地快照。DPS 环境已补 NumPy 依赖。

剩余条目按固定类别补公共能力或具体源缺口，归类本身不是执行完成。事件模拟仍优先；最新数量只读实时表。社区覆盖不等于原版正确率，也不等于 Web 已执行全部技能。推进顺序只在[当前计划](../plan.md)维护，人工验收不由导入脚本勾选。

## 2026-09-14 公共伤害包与根动作批次

从 887 推进到 892 可算，剩余 114→109；只执行 packet-template-slots.json 的 5 项，其余成功和失败回执复用。公共能力包括多枚主弹加独立收尾包、施放附加包加后续普攻、概率追加同类攻击或治疗。每包独立计算防御/抗性；不将复杂弹射、动态目标或生命条件略去。模板静态 accepted 80→85，真实 compiled-template 78→83，原已接受绑定没有语义变化。

敌人编译器直接消费已缓存且完整的 mode 根引用，按引用选择真实动作，排除仅名字像 Attack 的辅助能力。所有 mode 必须有可解析根，路径 ID 冲突和未解析引用不猜选。各根时序必须一致才能输出平坦时序。弹速合同只约束实际发射的弹体，近战根没有 projectileKey 不再构成速度冲突；不同弹体、特殊轨迹/齐射和失效驱动动作仍列为缺口。

此批动作配置 912→999，弹速 429→530，时序 682→686，卫戍池配置 149→161。时序实际新增 18、修正 6，并撤回 14 条无法从完整根集合得到统一合同的旧导入；弹速新增 107、撤回 6 条特殊弹体配置。撤回项回到待补的公共能力，不宣称原版行为已证实。完整增减见 [enemy-root-selection-delta.json](../../work/enemy-root-selection-delta.json)。

实现位于父 community_templates.cjs 和卫戍 build_external_combat_data.py，现有主窗口及 Web 调度/弹道直接消费，未新增逐技能或逐敌人 ID 分支。验证为 10 项公共模板测试、3 项根引用/弹体边界测试、一次浏览器与主机快照 smoke；分类刷新命中缓存，无重新抽样。历史批次数量仅记录该批，最新数量以实时表为准。

## 2026-09-14 费用/生存附属参数与动画补源批次

经济和生存附属参数按公共子句投影：区分“逐渐获得费用”和真正攻击叠层，按命名空间绑定已有属性，溢出屏障/目标防御持续时间与直接治疗分开。economy-template-slots.json 的 6 项一次全部通过；DPS 892→898，固定队列剩余 109→103，其他成功和失败回执复用。模板静态 accepted 85→91，实际 compiled-template 83→89，已有绑定的执行参数不变，采用的投影条件继续保存。

敌人从整份缺口集合取得现成骨骼，追加缺失动画后一次增加 548 条实际时序。来源、公共字节序修复与缓存入口见[敌人动画补源](enemy-animation-supplement.md)。历史批次数字不替代自动生成的实时覆盖表。

## 2026-09-14 单目标关系与普攻适用类型批次

公共模板 v4 将跳跃、链接、伤害传导与主目标伤害分开：单敌条件下保留主命中，不把同一个敌人当成自己的次级接收者；多敌输入继续由 singleTarget 契约拒绝。控制持续时间归目标，正常耗尽弹药不触发手动关闭后的剩余弹药齐射。`target-relation-template-slots.json` 的 5 项增量全部通过，DPS 898→903，剩余 103→98；原成功项执行参数保持，静态 accepted 91→96，实际 compiled-template 89→94。15 项公共模板测试通过，没有重跑全部技能。

敌人读取已有数据库的显式 `applyWay`，一次接入无需普攻集合；根动作按字段家族形成固定分表，详见[普攻能力接入](enemy-attack-capabilities.md)。后续以实时表为准，不再将这些单位派为攻击动画缺口。

随后按源 `prefabKey` 批量补入 12 份已有资源及 96 个动画名称，实际新增 7 条时序、2 条弹速，卫戍池 4 个配置缺口均接通；原有 profile 无变化。没有重新下载资源或扩大到逐敌适配，明细和固定候选入口见同一专题。

