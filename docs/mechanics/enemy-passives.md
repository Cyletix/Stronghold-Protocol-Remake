# 敌方常驻被动属性

2026-09-14。本批把 [9 个实际根对象常驻 BLOCK_FREE Buff](../research/enemy-block-native.md) 接到正式战斗阻挡与攻击资格。支持精确 ID：`enemy_1521_dslily`、`enemy_9013_acstmk`、`enemy_9014_acstma`、`enemy_9015_acstmb`、`enemy_9017_achunt`、`enemy_9018_actrpa`、`enemy_9019_actrpb`、`enemy_9020_actrpc`、`enemy_9033_acdeer`。不代表这些敌人的全部技能完成。

## 数据与执行链

[build_enemy_passives.js](../../tools/build_enemy_passives.js) 从已有 prefab、真实 MonoScript 与 Buff 图生成 [enemy_passive_data.js](../../web/enemy_passive_data.js)，全局为 `ArkEnemyPassiveData`。只有根 `_commonAbilities` 的直接启用绑定且 source Buff 明确常驻、不可沉默时才输出该配置。

[enemy-passives.js](../../web/src/simulation/enemy-passives.js) 提供 `ArkEnemyPassives.configure(enemy, board)` 和 `sync(board)`。前者由 [engine.js](../../web/engine.js) 的 `setupEnemy` 调用；后者在每帧任何攻击选取前调用，修复恢复或旧战斗实体留下的阻挡链接。

- 匹配完整 `enemyId` 后设置实体 `unblockable=true`，接入既有 `assignBlocks`、接触移动和敌人近战阻挡资格。不会扣除地面单位阻挡数，也不会停在其格边。
- 已有 `blockerId` 时立即清空并释放相应干员或召唤物占用；重复同步不会重复扣成负数。后续正式阻挡分配仍按本项目既有算法重算。
- 普通地面/高台攻击仍依自身射程正常选择和伤害该敌人；`blockedOnly` / `ownBlocked` 攻击不能因旧链接误选。不可阻挡不等于飞行、隐匿或无敌。
- 关卡 level、HP/ATK/速度覆写及显式空黑板保持；该源被动不是数据库数值修正。沉默不会去掉这 9 个不可沉默 Buff 的阻挡标志，也不把宿主设为全部异常免疫。
- 已有其他机制设置的 `unblockable` 不清除；未绑定 ID 和 14 种器物子敌不按类似名称或 HP 类型扩展。

数据与模块在 [index.html](../../web/index.html) 先于 engine 加载，浏览器与房主 VM 同源。实体的布尔值和 `blockerId` 已随整个 `B` 板保存；恢复后的第一帧重新应用永久来源，并清理旧阻挡占用，不另建对象引用或抽取随机数。数据纳入现有目录指纹；指纹和旧存档兼容由共用保存逻辑维护。

## 胄子实体伤害传递

后续同日批次依据[原生 modifier 与 BossSelector](../research/enemy-transfer-native.md)，给 `enemy_9014_acstma`、`enemy_9015_acstmb` 增加实际 `ON_TAKE_DAMAGE` 子项。生成数据在原根被动记录内附带 `damageTransfer`，没有增加独立脚本或另一个状态来源。

`inflictDamage` 在伤害资格检查/归一化后、扣自身 HP 前调用 `ArkEnemyPassives.onTakingDamage`。以当前 modifier 数值乘源 `atk_scale`（默认 1）向唯一符合来源、常驻 Buff 和 BOSS 等级的 `enemy_9013_acstmk` 传递一次纯伤害；不会按自身剩余 HP 截断，也不取消原本受到的伤害。目标是全图选择，因此首领无需位于攻击者射程内。

传递调用携带第六参数 `modifierOptions.skipModifierEvents/noSourceDamage`，保留 HP、伤害反馈与首领死亡处理，抑制本次 modifier 的转伤递归及常规受伤回调；不交给攻击者普攻/伤害收益回调。原有五参数调用保持契约。该子项不可沉默，已被原公共入口拒绝的伤害、治疗和显式跳过事件的伤害不触发它。

本批严格接受唯一合法目标。多目标、未知选择器别名或不支持的倍率写入去重的 `B.enemyPassiveDiagnostics`，只拒绝转伤，不中断原攻击。诊断与实体普通值状态可随房主快照保存；每次命中重新选择目标，不保存首领对象引用。关卡转换保留 `sourceLevelType`；即使敌人 ID 相同，关卡覆盖为 NORMAL 也不能继续当 BOSS 转伤。

目前原有源天赋黑板被用作这两个根被动的覆写输入。其他上下文的完整 Buff 黑板继承、多标记首领仇恨排序、动态赋予同名标记，以及非这两个精确源 ID 不在支持范围；详见原生页，不按相近图形放行。

## achunt 死亡清理

后续批次从同一根能力的第二个 Buff 核实 `enemy_9017_achunt`、`enemy_9018_actrpa`、`enemy_9019_actrpb`、`enemy_9020_actrpc` 永久持有 `achunt_mark`。这不是周期创建的 `achunt_mark_by_boss`；此前把两者混成一个未决动态标记依赖的说明已纠正。[源对象、原生调用与拒绝边界](../research/enemy-achunt-cleanup-native.md)记录详细证据。

数据在四个已有 profile 内增加 `permanentMarks/levelType`，只给 achunt 增加 `deathCleanup`，没有增加全局或脚本。`killEnemy` 在复活返回之后、标记最终死亡和原有死亡生成之后、干员击杀收益之前调用 `ArkEnemyPassives.onKilled`；该桥在普通清场与领袖立即胜利之前同步完成。它选择同一战场全部活的、可选的、永久标记且源等级为 NORMAL/ELITE/BOSS 的子体，直接置 HP 为 0，再调用正常死亡入口。没有一目标上限，也不按敌人类型 ID 合并多个实例。

直接归零来自 `InstantKill → Suicide → SetHpInternal`，不经过 `inflictDamage`，所以不会触发受伤、盾与转伤事件；保留来源 `skipReborn=false` 对应的已有复活分支。子体死亡仍进入正常清场、死亡生成及掉落，攻击首领的干员只获得其直接击杀，不额外接管子体收益。该被动不可沉默；源没有排除 FALLDOWN，但漏怪不是这次死亡事件。跳过 modifier 事件的致死伤害仍能触发最终死亡清理。

宿主的 `passiveDeathCleanupDone` 是普通可序列化布尔值，在派发前设置，重复调用及死亡后恢复不会再次清理复活的子体。选择器每次派发重新读取本板实体，没有保存目标引用、增加随机流或影响另一个玩家的战场。关卡 HP/路线/levelType 覆写和不相关待生敌人队列保留。

当前拒绝未知 `ability_name` 别名和多个活 achunt 引起的递归清理顺序，分别写去重诊断 `unsupported-selector-alias`、`unsupported-multiple-cleanup-owners`。原版 HATRED_DES 及复杂回调先后仍非逐值复现；动态赋予同名标记和完整 Boss 主动技能不在支持范围。这一项仅验 achunt 死亡清理，四条静态标记关联不计为四个敌人全部机制完成。

## 未实现的相邻规则

除上面的明确配置外，其他转移伤害、周期/派生标记及异常标志没有被该模块自动实现。`actrpa` 的受 modifier 后事件和 `actrpb/actrpc` 的 TARGET 上下文仍未接；它们所需的根 `achunt_mark` 已确认，勿重新把此静态标记派成动态取证。3 个固定首领的既有不移动行为仍由首领模块提供。本模块没有实现通用 Buff 生命周期、临时 `BLOCK_FREE` 的开始/结束或敌方完整主动多技能调度。

14 种器物子敌描述中的不可阻挡仍待原生 `Enemy.CheckBlockable` 等所在页恢复，具体 RVA 与恢复条件见[阻挡证据](../research/enemy-block-native.md)。[受击次数与死亡生成](enemy-death-spawn.md) 已有的完成范围不因此缩减，也不扩成阻挡已完成。

## 验证

```powershell
node tools/build_enemy_passives.js --check
node tools/_enemy_passives_smoke.js
node tools/_enemy_transfer_smoke.js
node tools/_achunt_cleanup_smoke.js
node tools/_contact_range_smoke.js
node tools/_flying_block_smoke.js
```

专项通过真实浏览器引擎与房主鉴权快照验证全部 9 个源 ID、stage spawn/level/数值覆写、沉默、旧链接和召唤物释放、路径穿过、地面/高台攻击、迷迭香的被阻挡资格、幽灵鲨的自身阻挡资格、范围外 ID 不扩用，以及恢复后移动和战斗 RNG 一致。测试证明本项目契约，不能代替原作实现证据。

转伤专项另覆盖两种源配置的物/法/真/元素 HP 伤害、过量伤害、取消/睡眠/治疗/跳过事件、沉默、首领致死、全图唯一目标、歧义及未知黑板拒绝、真实关卡 BOSS/NORMAL/HP 覆写、实际普通攻击弹体，以及带未命中弹体的鉴权恢复。比较不要求装饰粒子逐值一致，但核逻辑板与战斗 RNG 一致。

清理专项覆盖四个真实根标记、同 ID 多实例、最终死亡/复活/FALLDOWN/漏怪、直接 HP 归零与无额外干员收益、不可沉默/盾/睡眠、错身份/不可选/未知别名/多首领拒绝、三种等级和 HP/路线覆写、普通及领袖胜利前清理、独立队列保留、实际普攻弹体、两板隔离、命中前鉴权恢复及死亡后不重复派发。三子体转伤仍有负例证明未误放行；测试只证明当前实现契约。
