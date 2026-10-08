# 现成数据与执行代码检索结果

核查日期：2026-09-14。结论：**已有数百技能规模的社区计算逻辑、批量解析配置和 PRTS 机制资料，不应再把全部剩余工作视为从零逐项研究。** 本页保存检索证据；后续已完成数据库、DPS 与卫戍的[批量接入](community-batch-integration.md)，实际状态以该页和当前计划为准。

## 已取得的主要来源

| 来源与固定版本 | 已实际检查的内容 | 用途与边界 |
| --- | --- | --- |
| [xulai1001/akdata](https://github.com/xulai1001/akdata/tree/266d341ca05cbcb64f05b19e38db28ba0bfec1ca)，`266d341ca05cbcb64f05b19e38db28ba0bfec1ca` | 实际加载核心 `resources/attributes.js` 6,634 行、374 个不同技能 ID 字面量；另有时长、动画、模组、召唤物规则 | MIT；优先复用已有 DPS 核心与规则。停更于 2024，374 表示显式特例，不是本项目新增或已验收覆盖 |
| [ArknightsDpsCompare](https://github.com/WhoAteMyCQQkie/ArknightsDpsCompare/tree/78df03a122aee2988d4cc7f4c456e961c6497929)，`78df03a122aee2988d4cc7f4c456e961c6497929` | 8,440 行伤害公式；258 干员类声明 572 个技能槽；另有 60 治疗类、120 治疗槽 | 2026-06 更新，含逻各斯、维什戴尔等复杂分支；用于公式与条件参考。未发现许可证；平均 DPS 模型，不处理动画帧，技能槽不能等同精确实现数，治疗与伤害有重叠 |
| [Tim23333/Arknights_timer](https://github.com/Tim23333/Arknights_timer/tree/d2f6d76a7172cedc7583fc0a4eb998699abf25f5/Ark_emulator)，`d2f6d76a7172cedc7583fc0a4eb998699abf25f5` | 已下载发布的 `ark_emulator` 目录全部 57 文件；8,292 Buff 模板、2,075 敌方 prefab、641 个 `_n_*` 节点处理方法；449 角色动画事件、1,006 敌人动画事件/攻击时序、2,530 弹道速度条目 | 2026-09-08 提交；适合公共 Buff 节点执行和敌方配置、时序复用。许可证为 Tim23333 Non-Commercial v1；缺少其解析器完整角色输入，不能直接宣称全干员可运行 |
| [garrison-protocol 的 PRTS 快照](https://github.com/Yilegendoflink/garrison-protocol/blob/96e5b3382d0a3b6180739ab1ac0da8bdbf956c02/data/prts/README.md)，`96e5b3382d0a3b6180739ab1ac0da8bdbf956c02` | 2026-09-12 采集：460 干员条目、1,005 技能、9,975 技能等级；554 技能有额外备注；1,804 敌人、2,082 敌人等级、71 召唤物 | 直接复用已整理的机制资料与页面修订来源，免于再次逐页采集。内容是 Wiki 模板文本和结构化字段；敌人 `gameId` 全空，仍须关联客户端 ID；不含卫戍全部模式/机变规则 |

以上计数是本轮静态读取文件得到的外部覆盖；不同来源之间及与现有本地数据之间都有重叠，不能累加为新增数量。PRTS 的 460 条包含 29 个专属条目，不等于常规可获得干员数。来源属于社区实现/整理；文件存在、内部测试或 README 声明均不证明原版一致。

## 已核实的实用内容和缺口

- akdata 的前端 `_docs/dps.js` 实际加载 `resources/attributes.js`，不要拿旧 `dpsv2.js` 作为主核心。已检查水陈、缪尔赛思等分支；`calculateDps`、`calcDurations`、`calculateAttack`、`calculateGradDamage`、`applyEquip`、`calculateAnimation` 都有实际实现。
- ArknightsDpsCompare 的逻各斯分支包含天赋追加伤害、减抗、模组坏死积累；维什戴尔有残影和爆炸等分支。但 README 明示无限持续平均 DPS、固定 1.2 秒 SP 锁定，不能直接代替战斗事件排程。
- Tim 的节点处理器按配置类型分派，确有大量可执行代码；但 `ModifierScaleUp` 明确为 pending/no-op，未知节点会记录并跳过，部分技能波次使用近似时间。其 `ark_parser/character/data/` 和 `ark_parser/enemy/data/` 被忽略，完整 `characters.json`、`skills.json`、`operator_skill_prefab_summary.json`、`skill_prefab_catalog_operator.json` 不在当前仓库中。要先与我们已有源数据适配，再判断实际可运行覆盖。
- Tim 的 `Ark_data/dump.cs` 是签名/字段定义，不能称为取得了完整原生方法体；本轮未下载该 87 MB 文件。
- PRTS 的技能 `sourceTemplate.fields.备注` 有游戏描述外的信息，例如新约能天使 S3 的余弹、特殊攻击不耗弹、投递条件。敌人 `levels[].effective` 保存冷却/技能效果等，包含卫戍专属 Boss。它也有缺失数值和未执行化效果，已保留原 `coverage.json`。
- PRTS 来源仓库自己的 `confirmed-rules.json` 来自另一项目用户确认，不能当原版证据；其模拟器也尚未完成。此次复用对象是资料快照，不是其玩法设定。

次要候选 [Kaosu-Niku/ArknightCalculator](https://github.com/Kaosu-Niku/ArknightCalculator/tree/f526b3d07cba6eea6ee737fd792f74a5ad6ec840) 有 193 个技能规则工厂、83 个天赋工厂，已保存核心文件；单目标理论模型，未声明许可证。其他仅描述正则、空项目或未完成模拟器未列为主方案。GameResource 和旧 Arknights-RE 已是既有线索，不能算此次新突破。

## 后续按缺口补充的动画源

2026-09-14 从 [isHarryh/Ark-Models 固定提交](https://github.com/isHarryh/Ark-Models/tree/3745e5c6e10b5252b2a5e1f1841ebef62b7ef15b) 精确匹配缺动画集合，只下载骨骼并按 blob 去重，未下载纹理或整个模型库。完整清单、缓存、版本差异及公共解析器修复见[敌人动画补源](enemy-animation-supplement.md)。已通过现有动作编译器进入 Web 与主机 VM，当前数量只看实时覆盖表。

## 本地路径与校验

已落地并校验 89 个清单文件，合计 **98,959,015 bytes**。每个文件已核 SHA-256 与长度，Tim 包还核对 Git blob。只解析数据和静态源码，未运行第三方项目。校验记录：[verified-stats.json](../../work/external-ready-data-20260914/verified-stats.json)。

| 文件入口 | 内容 |
| --- | --- |
| [Tim 下载清单](../../work/external-ready-data-20260914/Tim23333-Arknights_timer/download-manifest.json) | 每文件固定版本 URL、字节、Git blob 和 SHA-256；内容在同目录 `snapshot/Ark_emulator/ark_emulator/` |
| [PRTS 下载清单](../../work/external-ready-data-20260914/Yilegendoflink-garrison-protocol/download-manifest.json) | 三份主 JSON、原始 manifest、coverage、inventory、说明和解析器；内容在同目录 `snapshot/data/prts/snapshots/2026-09-12-prts/` |
| [DPS 来源与边界](../../work/external-dps-search/FINDINGS.md) | 各计算器详细核查、固定提交、原始源码定位 |
| [DPS 下载清单](../../work/external-dps-search/manifest.json) | 24 个文件；按仓库名 `owner__repo/` 保留原目录 |
| [DPS 技能类统计](../../work/external-dps-search/coverage-stats.json) | 干员类、技能槽、来源行号，便于批量映射 |

检索后的批量接入已经实施：MIT DPS 核心、PRTS 资料、共享 Buff/敌方配置及卫戍公共动作均有实际消费者，命令与剩余类别见[接入说明](community-batch-integration.md)。完整节点执行器仍未全部迁入 Web；保留客户端稳定 ID、来源版本和社区假设，只有真正运行的能力进入执行统计。定时任务仍保持暂停。
