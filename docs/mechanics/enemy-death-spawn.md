# 岁相器物死亡生成

2026-09-14。[原始证据与 14 个 ID](../research/enemy-death-spawn-native.md)给出实际组件挂载、死亡事件、原生黑板键和数据库数量。此批完成这些敌人的死亡生成执行链，不代表其全部能力或生成物全部行为已完成；逐敌状态仍由[验收清单](../checklists/enemy-checklist.md)维护。

## 数据与执行

[build_enemy_death_spawn.js](../../tools/build_enemy_death_spawn.js) 将已提取的 `enm_pfb_9`、真实 MonoScript、`enemy_dead_spawn` 模板和 CN 数据库编译成 [enemy_death_spawn_data.js](../../web/enemy_death_spawn_data.js)。要求 14 个实际启用的 `PassiveBuffAbility` 绑定成立；不按敌人名称、后缀或单独的黑板键扩大支持范围。

[enemy-death-spawn.js](../../web/src/simulation/enemy-death-spawn.js) 提供纯计划和队列操作；[engine.js](../../web/engine.js) 在最终死亡后安排生成，在每帧推进波次前处理到期事件。浏览器与房主 VM 从同一 [index.html](../../web/index.html) 顺序载入。

- 关卡的 `sourceTalentBlackboard` 优先于目录黑板，包括显式空数组。`DeadSpawn.enemy_key` 使用字符串值，`DeadSpawn.cnt` 使用数量。子敌实体优先读取当前 `BDATA.enemies`，保留当前关卡 level/属性覆写；未收录时使用该明确子敌的数据库 level 0 产物兜底。
- 真死亡调用一次；首回复活不安排生成，漏怪不走死亡事件；传入 `FALLDOWN` 不生成。该 Buff 不受沉默影响。当前引擎尚无完整坠落行为，本批只提供并验证死亡原因入口，不声称坠落物理已经接通。
- 计划快照保存死亡时坐标、route、seg、cp、来源波次/片段；事件不持有死者对象引用。生成物应用当前战斗的敌人属性修正，继续原路线。模板 `_dontBlockWave=false` 使生成物阻塞原波次；片段标志按宿主继承，这是当前调度接口的接线约定。
- `B.enemyDeathSpawns` 在波次是否存活、全场清空和超时判断中计入待生成敌人数；不能因宿主已从数组移除而提前胜利。复活与重复 `killEnemy` 不重复排队。
- 对本批已绑定 ID，由明确模板接管死亡生成，避免与旧 `extraEnemyKeyList` / 分类 `deathrattle` 分支重复。其他 ID 的既有分支保留，没有把通用额外敌人列表推断成所有敌人的死亡机制。
- 房主快照整板保存 `B.enemyDeathSpawns` 的普通值对象，恢复后沿用已经抽取的时间与坐标；不重新抽数、不依赖死者仍在实体列表，也不新增弹体类型。

## 子敌受击次数与真实伤害类型

同轮已继续取得完整 `PropLikeEnemy.DoApplyModifier` 默认原生分支并接入。14 种子敌每次有效负 HP modifier 只扣 1 点；烹泉/沏虹与青花/赤霞生成的四种子敌只接受法术和真实伤害，其余十种无类型限制。当前实体 HP 就是剩余次数，保留关卡 level/HP 覆写和已有生命倍率，不额外维护一个从基础表重置的计数器。非负 HP modifier 不恢复生命；现有这 14 种子敌没有主动治疗分支。

公共 `inflictDamage` 在扣 HP 前按实际伤害类型归一为 1 或 0。`calcDamageResult` 返回计算后的 `{amount,type}`，`calcDamage` 保留原数值返回契约；这使弱点比较后选择的真实物/法类型继续传到命中，不能只看原攻击计划。主普攻/技能弹体、旧普攻/召唤物弹体、旧技能效果、秘术/傀儡持续伤害、战术额外攻击和元素角色已沿实际消费点核对；浊心斯卡蒂 S3 与既有灼燃真伤补齐显式 `true`。

命中回调使用受击次数规则后的伤害，致死预判也使用 1/0，避免法术限制拒绝的攻击仍按大数字触发伤害收益或提前认作击杀。元素 `deal` 保留显式 HP 伤害类型，EP 累积通路保持独立；医疗持续效果只处理友方单位，没有把其自主失血误接为敌人受击。

弹体保存 `damageType`，对象池复用时重置，房主恢复沿用该值。未知/未标类型的调用不猜成物理，也不默认放行法术限制；对四种受限子敌拒绝这类未标类型 HP 伤害。外部新增伤害调用必须明确传类型。本批不声称所有未来插件或尚未实现的伤害来源已覆盖。

## 精度边界

原模板确实含 0.7 随机延迟范围和 0.5 位置散布范围，但原生后半函数仍不可完整读取。当前实现用既有 seeded RNG 为每个子敌抽取 `[0,0.7)` 延迟，沿用宿主坐标；随机算法、抽取顺序、散布、可通行格/障碍处理尚未复原。该约定可供正式模式游玩和一致恢复，不保证与原版相同种子逐值一致。

本体其他 Buff，例如烹泉的 `DeadBoom` 或清明的 `InvisibleShield` 仍未在本批实现。子敌其余独立机制、原客户端所有伤害来源的精确 tick/命中组合也不由受击次数执行器自动完成。不新增波次、候选池或奖励；已有[逐轮敌群计划](../research/enemy-replacement-native.md)负责哪些敌人出现，死亡生成只处理它们入场后的事件。

子敌数据库描述的“无法被阻挡”也不在此次 HP 原生函数的证明范围内：预制体为 WALK、`_blockVolume=1`。后续已追到 `Enemy.CheckBlockable` 等所在的不可正常解码页 `0x21d0000`，具体方法与下一恢复条件见[阻挡原生证据](../research/enemy-block-native.md)。没有用 HP 执行器或另外 9 个已确认常驻 `BLOCK_FREE` 的敌人推导这 14 种子敌规则，完整能力条目仍不得因此勾选。

## 验证

```powershell
node tools/build_enemy_death_spawn.js --check
node tools/_enemy_death_spawn_smoke.js
node tools/_enemy_prop_smoke.js
node tools/_enemy_cold_smoke.js
node tools/_source_wave_smoke.js
```

专属 smoke 使用浏览器真实引擎和房主 VM，覆盖 14 个已绑定 ID 合计 54 个数据库子敌、现存关卡黑板、重复死亡、复活、坠落原因、漏怪、沉默、关卡子敌覆写、原路线位置快照、延时清场/波次/超时，以及鉴权快照中待生成队列与现有死亡冰爆弹体同时存在的恢复一致性。其结果证明本项目执行与恢复契约，通过的本项目测试不能证明原版随机或空间行为。

PropLike smoke 另外覆盖 14 种源 HP 次数、物/法/真/元素/治疗反例、微量伤害也扣一点、真实普攻/技能/弹体/持续伤害消费、生命覆写/倍率、EP 边界、父敌死亡→子敌逐次受击→胜利，以及带类型弹体和剩余 HP 的鉴权恢复。恢复比较排除使用 `Math.random` 的装饰粒子，并核战斗 RNG 一致；不宣称装饰粒子逐值一致。
