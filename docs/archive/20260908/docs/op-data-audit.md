# 干员数据核对表（基本属性 / 技能 / 天赋）

> 生成于 2026/09/02。以官方 gamedata 为唯一权威，逐字段核对「数据来源 → 当前处理 → 是否生效」。
> 数据管线：`data/ArknightsGameData/.../excel/*.json` → `tools/extract_*.py` / `tools/classify_*.js` → `web/*.json` → `web/mode.js` + `web/engine.js`。
> 状态：✅=数据驱动并生效；🔶=已接入但为近似/截断；❌=未接入（数据在、或数据源未定位）；N/A=该模式不适用。

## 1. 基本属性（基础字段）

| 字段 | 数据源 | 当前处理 | 状态 |
|---|---|---|---|
| maxHp | `character_table.phases[0].akf[0].maxHp`（battle_data） | `baseMaxHp × TIER_MULT × EVOLVE_MULT`；练度面板走 `statAt` 逐级插值 | 🔶 战斗为“阶×精”近似，非逐级真实；练度面板真实插值 |
| atk | 同上 `akf[0].atk` | `baseAtk × TIER_MULT × EVOLVE_MULT`；技能/盟约/天赋乘区叠加 | 🔶 同上 |
| def | 同上 `akf[0].def` | `baseDef × TIER_MULT × EVOLVE_MULT` | 🔶 同上 |
| magicRes | `character_table.phases[].akf[0].magicResistance`（**随精一/精二变化**：术师 10→15→20，共 131 名） | ✅ **本批修复**：`finalizeOperator` 经 `phaseDataOf(charId)` 按账号精英化阶段取 `LEVEL_DATA[...].magicRes`；详情卡显示真实法抗（不再硬编码 0） | ✅（修复）；装备 mods 法抗仍未接（见 §4） |
| cost / 部署费 | `phases[0].akf[0].cost` | 用作招募费/复活扣费 `respawnCost` | ✅ |
| blockCnt | `character_table.phases[].akf[0].blockCnt`（**随精一/精二变化**，34 名干员 2→3 或 1→2） | ✅ **本批修复**：`finalizeOperator` 经 `phaseDataOf(charId)` 按账号精英化阶段取 `LEVEL_DATA[...].blockCnt`；引擎阻挡容量、详情卡同步阶段感知 | ✅（修复） |
| attackTime | `phases[0].akf[0].baseAttackTime` | `baseAttackTime / aspd(mods/技能)`；攻速单位换算 | ✅ |
| attackSpeed | `attackSpeed`（为 100 基准，攻速倍率）= | aspd 为倍率累积，非直接填入 | 🔶（仅倍率） |
| respawnTime | `character_table.phases[].akf[0].respawnTime`（各阶段一致；70/80/200/…） | ✅ **本批修复**：`finalizeOperator` 返回 `respawnTime`，`resolveBoard`/`boardView` 传导至引擎；`tryKill` 取 `o.respawnTime || RESPAWN_TIME`（缺省 6s） | ✅（修复） |
| moveSpeed / position（近战/远程） | `position`（MELEE/RANGED） | 仅决定 `range`（近战 1 / 远程 3）与攻击范围朝向；干员本身为站桩不移动 | 🔶 站桩模式 |
| 阻挡半径 / 攻击范围 | `range_data`（RANGE_DATA）按精0/1/2 | `entryRangeGrids` 按账号精英化取范围格；技能 `realRangeId` **未**接入技能释放范围（用干员自身范围） | 🔶 范围格接入；技能专用范围未接 |

## 2. 技能

| 字段 | 数据源 | 当前处理 | 状态 |
|---|---|---|---|
| name / desc / rangeId | `skill_table`（skill_data.json） | 展示层优先真实技能名/描述/范围；富文本词条高亮 | ✅（展示） |
| spCost / initSp / duration / maxCharge | `skill_table.levels[]`（blackboard + spInit/spCost） | `spCost=clamp(real,6,40)`、`initSp=min(spCost,real)`、`duration=min(15,real)`；战场自动充能自动释放 | 🔶 接入但截断 |
| type / effects（真实效果算子） | `skill_table` → `classify_skills.js` × `effect_operators.js` | `finalizeOperator` 保留真实 `effects`；`castSkill`→`applyEffect` 逐算子执行（burst/aoe/snipe/heal/buff_*/shield/dp_gain/slow/dodge/ep_damage…） | 🔶 接入（启发式归类） |
| 职业模板兜底（无真实技能） | `SKILL_BY_PROF`（职业模板） | 无真实技能则包成 `{type, power}` 单算子 | 🔶 兜底 |
| 被动技能（isPassive） | `skill_table`（PASSIVE / 部署触发） | 转成 `deploy` 触发事件，不进充能释放 | ✅ |
| 精锐强化 | 模式规则 | `elite` 时 power×1.5、spCost×0.85 | 🔶 模式级近似 |
| 技能范围（realRangeId） | `range_data` | `entry.rangeGrids` 按精0/1/2；技能自身范围未用于释放判定 | ❌ |

## 3. 天赋 / 特性

| 字段 | 数据源 | 当前处理 | 状态 |
|---|---|---|---|
| name / desc | `talent_table`（talent_data.json） | 展示层渲染（按精英化/潜能解锁，`activeTalents` 取最高级候选） | ✅（展示） |
| effects（真实效果算子） | `talent_table` → `classify_talents.js` × `effect_operators.js` | `activeTalentEffects`→`finalizeOperator`：常驻 buff（atk/def/hp/aspd/dodge）永久乘区；`deploy`/`attack` 触发进 `events`→`applyEvents` | 🔶 接入（启发式归类） |
| 按精英化/潜能解锁 | `candidates[].phase/potential` | `activeTalents`/`activeTalentEffects` 过滤 phase/potential | ✅ |
| 法抗型天赋 | `magic_resistance` 黑板 | `effect_operators` 近似为 `buff_def(0.1)` | 🔶 近似 |
| 元素损伤（ep_damage） | `ep_damage_ratio`/`attack@ep_*` | 接引擎元素损伤累积 + 异常爆发（神经/侵蚀/灼燃/凋亡/狂躁） | 🔶 接入但精度受限 |
| 其它原生效果原语（`effectBuffInfoDataDict` 70 原语） | activity_table | 多数未接（见下） | ❌ |

## 4. 尚未接线 / 已知缺口

| 项 | 说明 | 关联 |
|---|---|---|
| 策略(band) 40 条规则 | 目前仅血量生效；其余机制未逐条可执行 | `I-20260901-008` |
| 装备 mods 扩展 | 属性装备 `mods` 仅 `atk/hp/def/aspd`；`magicRes/blockCnt/respawnTime` 未进 mods（本批 blockCnt/respawnTime 改为阶段取值，但仍未作装备乘区） | `docs/data-progress.md` 缺口 |
| 特殊装备（`use`） | 26 件，机制已结构化，缺“库存 + 使用/装备 + UI” | `U-011` |
| `SERVER_*` 31 种 / 全局选择 | 商店/经济/休整叠层原语未接 | `U-008` |
| `add_enemy_kill_gain_coin` | 击杀金币规则未接 | `U-013` |
| 干员召唤物 / 额外道具 | 未实现 | `U-011` |
| 技能自身释放范围（realRangeId） | 未接入技能判定范围 | — |

## 5. 战斗倍速（本批新增）

- **默认二倍速**：引擎主循环 `loop` 里 `update(dt * GAME_SPEED)`，`GAME_SPEED` 默认 `2`；敌我移动/攻击/技能冷却/复活/回合限时整体 2x。`__stepCamera` 仍用真实 dt，镜头运镜保持顺滑不加速。
- **切换**：顶部栏 `#speed-btn`（×2/×1，默认高亮金色），由 `toggleSpeed()` → `window.setGameSpeed(v)` 驱动；`window.getGameSpeed()` 读当前值。
- **隔离**：倍速只作用于主循环 `loop` 的 `update(dt*SPEED)`；直接调 `update(dt)` 的单元/回归 smoke（`_smoke.js`/`_ui_round_smoke.js` 等）仍按 1x，不受影响（已验证）。
- **语义影响**：`ROUND_LIMIT=60` 为“游戏内秒”，在 2x 下约 30s 现实秒结束一回合；复活 `respawnTime` 同为游戏内秒，`70s` 仍大于一整回合，故阵亡干员当回合基本不会复活（符合原版“下个阶段可复活”）。

## 6. 本批修复

- **blockCnt**：`battle_data` 原只存精0值，`finalizeOperator`/`opDetailHtml`/引擎阻挡恒用 `baseBlockCnt`。现由 `phaseDataOf(charId)` 按账号精英化阶段读取 `level_data.json` 的 `blockCnt`（34 名精一/精二 2→3 或 1→2 的干员修正）。
- **respawnTime**：干员对象从不携带 `respawnTime`，引擎恒用 `RESPAWN_TIME=6`。现 `finalizeOperator` 返回真实 `respawnTime`（70/80/200/…），经 `resolveBoard`/`boardView` 传导至引擎 `tryKill`，缺省仍回退 6s。
- **magicRes**：同 `blockCnt` 方案，按账号精英化阶段取 `LEVEL_DATA[...].magicRes`（术师 10→15→20 等 131 名）；详情卡法抗不再固定 0。
- **倍速**：默认二倍速实装（见上）。
- **策略专用头像**：策略阶段改用卫戍协议专用头像（PRTS「策略发起人」立绘），不再套用干员头像。`tools/copy_band_avatars.js` 从 PRTS 页面 `_files` 复制 40 张 `卫戍协议：盟约_策略发起人_<名>.png` → `web/band_avatars/<bandId>.png`；`avatarUrlForBand` 返回 `band_avatars/<bandId>.png`，失败时 `bandAvatarFallback` 回退干员头像→占位 `?`（仅“森蚺”无专用头像）。
- 数据与代码：`tools/extract_level_data.py` 输出每阶段 `blockCnt`/`respawnTime`/`magicRes`；`web/level_data.json` 已重生（atk/maxHp/def 数值与再生前一致）；`web/engine.js`、`web/mode.js`、`web/index.html` 增补倍速。
