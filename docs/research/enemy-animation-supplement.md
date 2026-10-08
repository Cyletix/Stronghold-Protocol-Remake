# 按缺口集合补齐敌人动画

2026-09-14 批次。当前数量由[实时覆盖表](../generated/community-coverage.md)维护，下一步只看[敌人公共模板表](../generated/enemy-action-templates.md)。本次取源单位是完整缺口集合，没有逐敌人适配。

## 来源与一次提取

来源为 [isHarryh/Ark-Models](https://github.com/isHarryh/Ark-Models/tree/3745e5c6e10b5252b2a5e1f1841ebef62b7ef15b)，固定提交 `3745e5c6e10b5252b2a5e1f1841ebef62b7ef15b`。仓库索引说明 CN 资源日期为 2026-08-02、提取工具 ArkUnpacker 5；保留它与现有 CN 数值、Tim prefab 快照的版本差异。

首批从固定动作表中选择缺动画/事件的 1,205 个敌人，按文件名与目录中的 1,977 份敌人骨骼匹配，命中 757 个敌人。这只是文件名匹配结果，不代表未命中的资源不存在；后续已用下述显式元数据映射补齐。首批按 Git blob 去重为 723 份资源，固定 URL、SHA-256 和请求集合均保留。

全部解析成功，得到 5,149 段动画。与已有数据合并时只补缺失名称：实际补入 682 个敌人的 4,386 段动画；已有重叠动画 762 段在 `1e-4` 容差内一致，1 个同名时间冲突保留旧值并记录，不静默覆盖。

## 公共解析修复

使用 MIT [Spine-Asset 1.1.1](https://pypi.org/project/Spine-Asset/1.1.1/) 的完整结构解析器。该版本默认按小端读取固定宽度数值，会将真实事件时间读成异常巨大值；本入口统一改用大端 reader，保持 varint 和字符串格式不变，不修改安装包文件。

格式依据为 [Spine 3.8 官方 BinaryInput](https://github.com/EsotericSoftware/spine-runtimes/blob/3.8/spine-ts/core/src/SkeletonBinary.ts)：固定宽度读取使用 DataView 的默认大端顺序。解析后要求版本符合 3.8、整个文件被消费、时间有限且处于动画时长内。普通囚犯缓存样本的 Attack 时长为 1.0666667 秒、OnAttack 为 0.4333333 秒；这证明所下载资源中的事件数据，不证明当前客户端的攻击调度。

## 接入和缓存

2026-09-14 后续批次修复了资源定位方式：[sync_enemy_animation_metadata.py](../../tools/sync_enemy_animation_metadata.py) 沿 `models_data.data.assetId → assetList[.skel] → 固定 tree 路径` 关联。共享模型、不同文件名和无扩展名资源都按明确引用处理，不靠删除后缀猜测。请求集合冻结在 `metadata-requests.json` 的 366 个成员；默认续跑不重选集合。

此次取到 241 个敌人的 2,047 段动画，207 个唯一 blob 中复用 116 份缓存，仅新增下载 91 份。4 个标为 `.skel` 的资源实际包含 Spine JSON，已补公共内容格式分派，与二进制共用标准化事件输出。合并新增 1,771 个动画名称，覆盖 229 个受影响敌人，其中 226 个此前无动画记录；276 个重叠名称全部一致，零冲突。94 个缺少明确资源映射、31 个空键或没有明确缺失名称的成员保留原因，不把空 `_animKey` 改成 Attack。

```powershell
../.venv/Scripts/python.exe tools/sync_enemy_animation_metadata.py
../.venv/Scripts/python.exe tools/build_external_combat_data.py
../.venv/Scripts/python.exe tools/classify_enemy_action_templates.py
../.venv/Scripts/python.exe tools/advance_community_templates.py
```

- `work/external-enemy-animations/ark-models/`：固定源索引、requests.json、按 blob 去重的骨骼和每份解析缓存；默认不重新查 HEAD，不重建请求集合。
- `work/enemy-animation-supplement.json`：完整动画/事件补充层，含来源、未匹配集合和失败信息。`--retry-errors` 只重试失败资源，不重复成功项。
- `work/enemy-animation-metadata-supplement.json`：独立的显式映射补充层，保留每个来源、全部候选变体及失败。`load_metadata_supplement()` 供编译器和分类器顺序追加；原补充文件不覆盖。`--refresh-mapping` 只重做冻结成员的索引关联，`--retry-errors` 只重试失败。
- `tools/enemy_animation_overlay.py`：供战斗编译器与分类器共用的追加式合并，记录逐动画来源。语义哈希只包含 source/enemies，缓存计数改变不会触发重分类。
- `work/external-combat-import-report.json` 的 animationSupplement：新增和冲突回执。
- 同一回执的 animationMetadataSupplement：新映射层新增和冲突；[本轮差异](../../work/enemy-metadata-hits-delta.json) 同时记录新增时序与旧错误合同撤销，不能把取到动画等同于动作已经实现。
- [本次时序增量](../../work/enemy-animation-supplement-delta.json)：新增 548 条可消费时序，旧时序和弹速没有删除或改动；卫戍池新增 127 条时序。整体动作配置 999→1,375，时序 686→1,234。

分类器只刷新新动画影响的 682 条缓存记录，不重读 prefab 重新解析所有根引用。下一次相同输入只刷新状态；完整缓存复跑确认 723 份全部命中、没有下载或骨骼重解析。

剩余源缺口优先看 `metadata-requests.json` 和补充层的 unresolved/skipped，再看当前模板表；首批 requests.json 的 unmatched 是历史文件名匹配结果，不能再作为“没有资源”的结论。根能力/组合引用、无常规普攻单位、多形态分派和特殊弹道分别推进。新资源版本必须显式建立新源和请求集合。

浏览器和房主 VM 直接消费现有 external_combat_data.js；缩放仍沿用既有社区比例模型，Boss 专用配置优先。解析器、追加式合并公共边界及浏览器/主机快照检查通过；没有逐个核验或勾选原版行为验收。原始游戏资源版权归原权利人，仅保存本地研究来源，本轮未发布或重打分享包。
