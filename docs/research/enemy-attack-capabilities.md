# 敌人普攻能力与根能力分表

2026-09-14：通用动作导入以前只看 prefab 中的伤害字段，没有读取数据库的攻击适用类型，导致大量无普攻单位一直被当作缺动画。当前数量统一看[实时覆盖表](../generated/community-coverage.md)，剩余工作看[敌人固定表](../generated/enemy-action-templates.md)。

## 源字段与执行范围

[Verified，配置观察] 本地 `data/ArknightsGameData/zh_CN/gamedata/levels/enemydata/enemy_database.json` 的 `enemies[].Value[].enemyData.applyWay` 同时保存 `m_defined` 和 `m_value`。版本定位为该仓库提交 `6844859c664c7b5716b3f6a9feaf2c3606168838`，实际文件 SHA-256 另存入 [能力缓存](../../work/enemy-attack-capabilities.json)，不能只靠目录版本认定内容。

工具按等级顺序继承已定义的值。仅全部等级均取得明确或继承的 `NONE` 时，导出无需普攻；未定义的 `NONE`、首级未知或后来改为 `MELEE`/`RANGED` 均不能全局关闭。没有使用攻击力为零、攻击间隔为零或动画名称猜测。

这一含义与已有 `tools/lib/source-battle.js::enemyVariant` 的 `applyWay → canAttack` 接线一致。本批让未携带关卡覆写的通用敌人也能消费相同源字段。`ArkExternalCombat.canAttack` 优先读实体的显式 `canAttack`，再读其 `applyWay`；专用 Boss 执行器保留优先权，最后才使用导入的 `NONE`。引擎取消不适用的普攻前摇并禁止启动新普攻，不写永久状态，后续模式或技能的明确覆写仍可生效。

这只关闭通用普通攻击，不关闭移动、阻挡、死亡机制、Buff、主动技能或召唤。无普攻不表示这些敌人已经完整实现。原有时序与弹速资料仍保留，方便显式关卡覆写复用；不适用条目从普通动作缺口中单列。

## 一次分类与后续入口

`tools/enemy_attack_capabilities.py` 对原根动作类别增加一层固定分表，保留每个模式的 `_combat`、`_attack`、原始字段、Buff 引用和序列化节点类型，保存在 [根能力目录](../../work/enemy-root-capability-catalog.json)。分类包括无普攻、召唤、动作节点、动画或自定义能力、基类字段或自定义能力、空根；有对应数据时也支持治疗、Buff 和未解析引用。

[Inferred，实施分类] 上述家族决定后续补哪一类公共执行器。只有基类字段或空动画不证明自定义原生方法没有行为；外部 PPtr、缺失引用或重复 PathID 不按数字猜选目标。它们保留待办，不因为分类而宣称动作已实现。

能力缓存按数据库 SHA 与规则版本复用；根分表按 prefab SHA、数据库 SHA、固定成员集合与规则版本复用。源不变时不重新读取完整字段。原 11 类主表不重建，分类脚本只刷新当前缺口和根分表的待办数。

从卫戍工作区运行：

```powershell
python tools/build_external_combat_data.py
python tools/classify_enemy_action_templates.py
python tools/advance_community_templates.py
```

第一个命令同步 Web 数据和详细回执，后两个从缓存刷新表格与统一摘要；DPS 无变化时不重新计算。

## 本批记录

本批接入 342 个无普攻源配置，其中卫戍池 45 个；337 个原普通动作缺口被改为不适用，缺口 953→616，卫戍池 94→50。根动作主类 379→104，并保留固定子类供下一批直接推进。时序 1,234、弹速 530 没有撤回或改写。

验证覆盖等级定义/继承、外部和歧义 PPtr、真实浏览器中的普攻取消与显式恢复、专用执行器优先级，以及现有时序/弹速和主机 VM 快照恢复。这是实现验证，不据此宣称全部原生调度行为已验证。

## 显式 prefabKey 资源映射

同批继续使用数据库 `prefabKey` 补齐资源关联。在无普攻分流后的 237 个配置/动画源缺口中，12 个敌人的所有等级均明确或继承同一个非同名资源 key；对应 prefab 已在固定 Tim 快照中，动画也可直接取自已有源。[冻结候选](../../work/enemy-prefab-alias-candidates.json)保存全部成员、两份代表、等级继承及数据库/Tim/补充动画的来源哈希。

`tools/enemy_prefab_aliases.py` 只用这种源字段映射，在原敌人 ID 下填入缺失资源；不推测后缀、不改变数值、不覆盖已有 prefab 或动画。只从合并前的真实源取数据，不把新插入的别名继续当作中间来源。动画冲突复用既有保留规则。数据库、配置、原动画和补充动画内容哈希改变时明确停止复用；分类状态变化不触发重建。

编译器仅为这 12 个获得新源的记录更新字段、根引用和分类；其他既有证据复用。公共执行合同仍决定哪些资源能够实际运行，不能把资源补齐直接计作完整行为。此步补入 12 份 prefab、96 个动画名称，实际增加 7 条时序和 2 条弹速，卫戍池增加 4 条时序和 2 条弹速；原有 profile 全部保持。缺口 616→609，卫戍池 50→46，详情见[本批差异](../../work/enemy-prefab-alias-delta.json)。当前总数继续以实时表为准。

换源时使用 `python tools/refresh_enemy_prefab_alias_candidates.py --refresh` 明确刷新原固定集合；需要扩大集合才加 `--include-new-gaps`。默认源未变直接命中缓存，不从已缩小的待办列表移除已接通的资源映射。
