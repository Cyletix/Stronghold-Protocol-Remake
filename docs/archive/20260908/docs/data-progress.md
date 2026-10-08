# 卫戍协议复刻 · 数据抽取与接入进度（现状总结）

## 2026-09-05 快速改善与数据优先级（优先于下方历史盘点）

当前产品是纯 Web 单机复刻。下方 2026-09-01 盘点含历史状态，不能用来判断本轮接入完成度。

### 当前最需要的数据

| 优先级 | 数据与用途 | 本轮事实 / 下一步 |
|---|---|---|
| P0 | 普通/精锐棋子的固定养成、技能选择、账号加成 | **已提取未接入**：`tools/build_mode_rules.js` 从本地 `activity_table.json` 导出 `web/mode_rules.json`，两个赛季共 233 个棋子配置，每个保留 normal/elite status、技能/模组索引、原型备用干员。`cultivateEffectList` 保留四档账号加成。下一步统一属性、技能、范围、天赋、详情消费者，替换 `TIER_MULT` 与账号阶段直接控制战斗的路径。 |
| P0 | 按模式、回合、领袖选择战斗关卡及真实波次 | **已提取未接入**：同一文件保存两个赛季 16 个模式配置的 `battleDataDict` 和 `stageDatasDict`。现在 `genWaves` 仍是 Web 自定出怪；主地图 `_m*` 的模板波次不能直接当完整逐回合战斗。下一步关联 `battleData.levelId`、敌人模板替换与路线分区。 |
| P1 | 决策阶段准确时序 | 原始 `isSpPrepare` 已保留；不能单凭字段名确认弹窗发生在上一回合结束还是标记回合开始。当前 Web 决策表无第 1 回合，但重开时会残留上一局弹窗，本轮修复清除。精确时序仍待客户端流程证据。 |
| P1 | 技能/天赋/模组完整战斗效果及特殊装备、策略效果 | 数据大量存在，完整行为消费者尚未闭合。`defaultSkillIndex`、status.skillLevel 与当前 `extract_skills.js` 固定取首技能 Lv1 的路径不一致，需要一起迁移，不能仅改详情数字。 |
| P2 | 实际单位动画、技能特效、地形与 UI 资源 | 职业图标八类均已存在并接入，避免重复解包。下一步按当前场景缺失资源做定向导出和加载验证；本轮不全量导出不参与运行的素材。 |

生成物包含源路径和 SHA-256；命令：`node tools/build_mode_rules.js`。以上 JSON 字段为 **Verified（本地客户端 gamedata 直接支持）**；是否完整复刻行为以消费者和实验为准。

### 本轮已改善与验收边界

- 补齐中断留下的 `GameActions` HTML 商店按钮入口，核心 smoke 加载真实命令模块，验证冻结切换和重开清除决策。
- 盟约外圈改为 48px、内缘半径 19px，图标半径 15px，留 4px 空隙；图标使用 contain。独立内容轨道实现两端最多 56px 弹性越界、释放/取消回弹、拖拽后抑制点击、窗口变化重新限制偏移，渐隐留在固定视口。
- 范围格保持最多 20px；大范围按横纵尺寸等比缩小至 104px 内。小范围不撑满，3×4 范围保持 20px。
- `tools/_quick_ui_smoke.js` 覆盖两端越界、取消、误点击、resize、范围格与八张 PNG 文件；浏览器实测冻结、商店购买、候选区部署、职业图标、单格范围、盟约间隙和拖拽后回弹。
- 本地真实数据对 11 地图 × 7 类特训敌人 × 13 普通回合，共 1001 组生成队列检查，无空队列、缺失敌人或无效路线索引。**不能据此宣布“无怪”已全面修复**：镜头/分区、禁用组合、领袖回合及真实波次仍需专项复现。
- `_ui_layout_smoke.js` 原有两条误报已定位：正则在内嵌情报面板闭合标签处截断 HUD；把同样处于正常布局流的 `position:relative` 错当失败。以浏览器实际相邻布局验证后修正检查器，未改产品布局来迎合测试。
- 冻结回归检查同步现有二次确认升阶行为和真实 `shop_level.json` 卡数，增加首次不扣款/第二次只扣一次断言，并与页面一样加载状态及命令模块；移除测试中固定六卡及首击立即升阶的旧假设。

### 按用户要求延期

完整养成/技能管线迁移、精确决策时序、真实波次和分区映射、复杂敌人机制、Spine/粒子完整表现、大规模模块拆分。恢复时先用已导出的结构化配置和现有提取工具，不重复定位这些已找到的字段。

> 生成于 2026/09/01。用于梳理「大方向 + 哪些数据已提取、哪些未提取 + 已接入引擎的逻辑 + 下一步」。
> 原始数据源、工具、权威分域见 `docs/data-inventory.md` / `docs/toolchain.md` / `docs/findings.md`。

## 0. 大方向（任务目标）

用官方 gamedata **数据驱动**地重建「卫戍协议」自走棋（私服前端，`web/`）：把散落在 `activity_table.json`（`AUTOCHESS_SEASON.act2autochess` 段）里的盟约归属、干员特质（garrison）、策略（band）、装备/特殊装备语义抽成结构化 JSON，再接进 `web/mode.js`（自走棋逻辑）与 `web/engine.js`（实时战斗）。

数据管线：`data/ArknightsGameData/.../*.json` → `tools/build_*.js` → `web/*.json` → `web/mode.js`/`engine.js`。

**现状一句话**：已完成「盟约归属 + 干员特质（GAIN_BUFF / ADD_BOND）」与「装备 / 特殊装备」的可执行语义抽取并**部分接入引擎**；策略（band）与 `SERVER_*`、敌人/地图/全局选择仍是「数据已结构化、待接引擎」。

## 0.5 生成物生产→消费链账本（U-INVENTORY 盘点）

> 加载入口：`web/mode.js` 的 `initMode()` 用 `fetch('*.json')` 把各生成物读入全局变量；`web/engine.js` 的 `initEngine(data)` 接收 `battle_data.json` 作为战斗 `BDATA`；`web/index.html` 仅引入 `ui_atlas.js` / `engine.js` / `mode.js` 三个脚本，数据全部来自上述 `fetch`。
> 「接入状态」字段按下表区分：**已接入**（引擎读取并用于行为）、**部分接入**（字段/子集被用、其余待接）、**已提取未接入**、**未提取**。

| 生成物 | 提取程序（producer） | 数据来源 | consumer（全局变量/文件） | 接入状态 |
|---|---|---|---|---|
| `battle_data.json` | `tools/extract_battle_data.py` | `character_table.json` + 敌人表 | `engine.initEngine`→`BDATA`；`mode.js` `BATTLE.operators` 供 `buildRoster` | 已接入 |
| `battle_levels.json` | `tools/build_levels.js`（复用 `fix_routes.py` 的 BFS 分段路线） | `levels/activities/{act1vautochess,act1autochess,act2autochess}/level_*_m*.json` | `initMode`→`BATTLE`/`LEVELS`；`engine` `BDATA.level` | 已接入 |
| `mode_data.json` | `tools/extract_mode_data.py` | gamedata 模式数据 | `MDATA`（`.bosses`→`BOSS_LIST`） | 已接入 |
| `operator_tiers.json` | `tools/extract_operator_tiers.py`（PRTS） | PRTS 干员数据库 | `TIER_DATA` | 已接入 |
| `band_data.json` | `tools/extract_band_data.py`（PRTS） | PRTS 策略报告 | `BAND_DATA` | 已接入（策略机制仅血量生效，完整逐条实现见 T-20260902-003/U-STRATEGY） |
| `range_data.json` | `tools/extract_range_data.py` | `character_table.phases[].rangeId → range_table.grids` | `RANGE_DATA` | 已接入 |
| `level_data.json` | `tools/extract_level_data.py` | `character_table` 各阶段等级属性 | `LEVEL_DATA` | 已接入 |
| `talent_data.json` | `tools/extract_talent_data.py` | `character_table.talents[]`（含 blackboard） | `TALENT_DATA` | 已接入 |
| `skill_data.json` | `tools/extract_skills.js` | `skill_table.levels[]` | `SKILL_DATA`（优先真实技能，回退职业模板） | 已接入（技能释放范围 `realRangeId` 为遗留） |
| `appellation.json` | `tools/extract_appellation.py` | `character_table` 英文名 | `APP_DATA` | 已接入 |
| `bond_data.json` | `tools/extract_bond_data.js` | `activity_table.autoChessData.bondInfoDict` | `BOND_DATA`/`applyAuthoritativeBondData` | 已接入 |
| `op_bonds.json` | `tools/build_op_bonds.js` | `charShopChessDatas` × `charChessDataDict` × `garrisonDataDict` | `OP_BONDS`（`buildRoster` 替代按职业猜测） | 已接入 |
| `equips.json` | `tools/build_equip_data.js` | `effectInfoDataDict` × `effectBuffInfoDataDict` | `EQUIP_MODS`（stat 类） | 部分接入（`use` 特殊装备机制未接，见 T-20260902-003/U-ITEMS） |
| `battle_richterm.json` | `tools/extract_rich_term.js` | `gamedata_const.json` `termDescriptionDict` | `RICHTERM`（富文本释义） | 已接入 |
| `constants.json` | `tools/dump_db.js` | `web/data.db` 投影 | `CONST`/`applyConstants` | 已接入 |
| `data.db` | `tools/build_db.js` | `battle_data/bond_data/band_data.json` + 仓库硬编码 | 经 `dump_db.js` 投影为 `constants.json` / `db_export.json` | 已接入 |
| 干员头像/立绘 | `tools/download_avatars*.py` / `download_portraits.py` | PRTS | `engine.getAvatar`（`web/avatars/`） | 已接入 |
| 敌人头像 | `tools/download_enemy_avatars.py` / `download_all_enemy_avatars.py` / `export_enemy_icons.py` | PRTS + OBB `icon_enemies_0~5.ab` | `engine.getEnemyAvatar`（`web/enemy_avatars/`） | 已接入（OBB 补 1229 个，共 1601，含 PRTS 缺失的假想敌） |
| 策略头像 | `tools/copy_band_avatars.js` | PRTS | 策略选择 UI（`web/band_avatars/`） | 已接入 |
| UI 图集 | `tools/extract_ui_atlas.py` / `split_ui_atlas.py` | OBB / AssetBundle | `engine.drawUIIcon`（`ui_atlas.js` + `ui/BattleUI_atlas0.png`） | 已接入 |
| 地形贴图 | `tools/extract_dungeon_tiles.py` | OBB / AssetBundle | `engine.getTile`（`web/ui/tiles/`） | 已接入（部分贴图缺失，见 T-20260902-005/U-ASSETS） |
| 职业图标 | `tools/export_profession_icons.py` / `export_profession_variants.py` | OBB `profession_large_hub.ab` | `mode.js` `PROF_ICON`（`web/assets/profession_icons/`） | 已接入（256×256 高清，替换单字徽章） |
| 技能图标 | `tools/export_skill_icons.py` | OBB `spritepack/skill_icons_0~3.ab` | `mode.js` `realIcon`（`web/ui/skillicons/`） | 已接入（1483 个 128×128 独立图标，92% 命中，替代 atlas 切图） |
| autochess 素材 | `tools/export_autochess.py` | OBB `commonassets/battlecommon/emoticon` | `mode.js` `od-tiericon`（`web/ui/autochess/`） | 已接入（棋子 token/段位/表情 13 个，段位图标接入详情抽屉） |

> 只读/探索脚本（`tools/inspect_*.py`、`scan_*.py`、`probe*.py`、`brute.py`、`verify*.py`、`test_*.py`、`find_*.py`、`debug_*.py`、`examine_*.py`）属一次性排查，**不计入上述正式管线**，不产出 `web/*.json` 供引擎消费。运行期验证脚本前缀 `_`（如 `_smoke.js`、`_ui_smoke.js`、`_equip_bond_smoke.js`、`_a7_smoke.js`、`_rich_smoke.js`、`_projectile_smoke.js`、`_respawn_smoke.js`）为对应生成物/行为提供可复现证据。



## 0.6 四态与缺口路由总表（U-GAPS 盘点）

> 四态（从「源」到「证据」逐步，避免混为一谈）：
> - **已获取**：源数据已定位/下载（gamedata 或 PRTS/OBB 存在）。
> - **已提取**：已解析为 `web/*.json` 生成物。
> - **已接入**：`mode.js`/`engine.js` 读入并用于行为。
> - **已验证**：有 `tools/_*_smoke.js` 等可复现证据。

| 缺口 | 状态 | 路由 |
|---|---|---|
| 商店装备售价 cost | 未定位（`effectInfo`/`effectBuff`/`shopLevelDataDict` 内无） | `T-20260902-003/U-ECONOMY` 或另找定价表/客户端 |
| 属性装备引擎字段 `magic_res`/`block_cnt`/`respawn_time` | 已提取未接入 | `T-20260902-003/U-OPERATOR`（复活时间） |
| 特殊装备 `use` / 策略物品<特殊装备> | 已提取（26 件）未接入 | `T-20260902-003/U-ITEMS` |
| 技能释放真实范围 `realRangeId` | 已提取部分接入 | `T-20260902-003/U-OPERATOR` |
| `SERVER_*`(31) / `enemy_*` / `auto_chess_change_map` / `global_special_choice_*` | 已结构化未接入 | `T-20260902-003/U-*`、`T-20260902-004` |
| 干员名册精确名单 + Ⅰ~Ⅵ 阶 | 已接入（`op_bonds`/`operator_tiers`） | 无（已解决） |
| 真实干员 MODULE（`battle_equip_table` 505 mod / 1515 phase）与「装备池」关系 | 未梳理 | `T-20260902-003/U-ITEMS` 或独立研究 |
| 敌人移动/攻击状态机、远程原地攻击、部分敌人不动 | 行为偏差 | `T-20260902-004` |
| 地图 A/B/C 分区、镜头、`act1vautochess` 赛季归属 | `[Inferred]` 待复核 | `T-20260902-002` |
| 地形/敌人贴图、技能特效等局部素材缺失 | 部分缺失 | `T-20260902-005/U-ASSETS` |

## 1. 已抽取的数据（`web/*.json`）

### 1.1 新提取，且已接入引擎
| 文件 | 内容 | gamedata 来源 | 工具 | 接入状态 |
|---|---|---|---|---|
| **op_bonds.json** | 121 名干员**官方**盟约归属（`seasonBond`/`regBonds`）+ 135 条特质（`garrison[]`，含 `rule:{kind,eventType,bondIds,perDivide}`） | `charShopChessDatas`(chessId→charId) × `charChessDataDict`(bondIds) × `garrisonDataDict`(320) | `tools/build_op_bonds.js` | ✅ `buildRoster` 用 `OP_BONDS` 替代职业猜测；特质已接引擎 |
| **equips.json** | 115 件装备（`stat` 82 / `use`(特殊装备) 26 / `misc` 5 / `none` 2），含名称/描述/档位(`normal`/`golden`)/`mods`/`mechanics` | `effectInfoDataDict`(EQUIP 115) × `effectBuffInfoDataDict`(mechanics) | `tools/build_equip_data.js` | ✅ 属性装备 mods 经 `EQUIP_MODS` 覆盖商店；⚠️ `use` 特殊装备机制已结构化、未接 |

### 1.2 已提取 / 沿用（基础 & 运营数据）
| 文件 | 内容 | 状态 |
|---|---|---|
| `bond_data.json` | 官方盟约定义（23 个 `bondInfoDict`，bondType/powerIdList/desc） | 已提取（沿用） |
| `band_data.json` | 40 条开局策略（策略/血量/效果文本；`bandDataListDict` × `effectInfoDataDict`） | 已提取；**精确机制在 `effectBuffInfoDataDict` 已结构化**，未接 |
| `operator_tiers.json` | 干员 → Ⅰ~Ⅵ 阶 | 已提取（沿用） |
| `range_data.json` / `level_data.json` / `talent_data.json` / `skill_data.json` / `appellation.json` | 范围格 / 等级曲线 / 天赋 / 技能 / 英文名 | 已提取（沿用） |
| `battle_richterm.json` / `constants.json` | 富文本词条 / 零散常数 | 已提取（沿用） |
| `battle_data.json` / `battle_levels.json` / `mode_data.json` | 敌人 / 关卡 / 模式 | 已提取（沿用） |

### 1.3 已结构化、但仍待接引擎
| 来源 | 条目 | 说明 |
|---|---|---|
| `garrisonDataDict` | 320 条特质 | 除 `GAIN_BUFF`/`ADD_BOND` 外，还有 **31 种 `SERVER_*`**（商店/经济/休整叠层：`SERVER_CHESS_PRICE`/`SERVER_ONCE_GOLD`/`SERVER_POOL_*`/`SERVER_ADD_BOND_*` 等），数据在、未接 |
| `effectBuffInfoDataDict` | 361 条机制 | 70 个原语 `key`（含 `use_equip_*`/`equip_destory_*`/`env_gbuff_*`/`char_attribute_mul`/`add_enemy_*`/`global_special_choice_*` 等），已解析、未接 |
| `effectChoiceInfoDict` | 109 条选择事件 | `EQUIP_FREE`/`EQUIP` 特殊物品/装备选择（「定向投放」等），未接 |
| `equips.json` 的 `use` 类 | 26 件特殊装备 | 机制已结构化，缺「物品库存 + 使用/装备」系统与 UI |

## 2. 已接入引擎的逻辑（`web/mode.js` + `web/engine.js`）

- **盟约归属**：`buildRoster` 用 `OP_BONDS[charId]` 的 `seasonBond/regBonds` 替代原 `REG_BY_PROF` 按职业猜测；不再落入表里时回退旧逻辑。
- **属性装备**：`initMode` 加载 `equips.json` → `EQUIP_MODS`；商店装备生成用 `EQUIP_MODS[名字] || 原值` 覆盖（`finalizeOperator` 应用乘区）。
- **garrison GAIN_BUFF（按层数加属性）**：`computeBonds`/`applyGarrisonStatMods` 对 `act1autochess_gar_eff_attrByBond` 按「在场盟约有效层数 ÷ `divide`」累加乘区（`active[bid]` + `G.addLayers[bid]`）。
- **garrison ADD_BOND（事件叠层）**：引擎 `killEnemy`/`castSkill`/`tryKill` 触发 `window.onBondGarrison` → `onBondGarrison` 按阈值累加 `G.addLayers[bid]`（受 `max_add_count_per_battle` 上限），重算 `resolveBoard` 并经 `__setAllOpStats` 实时回写在场干员属性。

## 3. 还没提取 / 待定位（Gap）

- ~~**装备 cost**：未定位~~ → **已定位（2026-09）**：干员价 `shopCharChessInfoData.purchasePrice`（按阶 2/3/4）、道具价 `trapChessDataDict.purchasePrice`（1~5），已接入 `TIER_PRICE` + 商店装置卡（`genShop`）。
- **属性装备的引擎字段缺口**：引擎 `mods` 只支持 `atk/hp/def/aspd`；`magic_resistance`/`block_cnt`/`respawn_time` 等字段未扩展到引擎。
- **特殊装备（`use`）与策略物品<特殊装备>**：无「物品库存 + 使用/装备 + UI」，机制未跑起来。
- **`SERVER_*` / 敌人 / 地图 / 全局选择**：`enemy_*`/`auto_chess_change_map`/`global_special_choice_*` 需 shop/server、敌人、地图钩子。
- **干员名册「精确名单 + Ⅰ~Ⅵ 阶」**：名册已用 `charShopChessDatas` 定位（121 人），阶数在 `operator_tiers`；`data-inventory.md` 早期「未定位」提示在此已部分解决（精确名单→`op_bonds`）。
- **真实干员 MODULE（`battle_equip_table.json`，505 module / 1515 phase）**：是标准「模组」系统，与模式「装备池」的关系未梳理（本次装备语义取自 `effectInfoDataDict` 的 `EQUIP`，非 module）。

## 4. 任务清单（待接 / 待解析数据）

> 原 `T-003` 混合了研究、系统规则、局部 UI 与工程重构，现已取消并按主次重新承接：资料账本见 `T-20260902-001`，系统规则见 `T-20260902-003`，敌人行为见 `T-20260902-004`，工程拆分见 `T-20260902-006`。任务实时状态以 supervisor `Status` 为准。

| unit | 目标 | 范围 | 验收 | 前置数据 |
|---|---|---|---|---|
| **T-20260902-003 / U-STRATEGY** 策略(band) 40 条实现 | 把 40 条开局策略从「仅血量生效」改为逐条可执行 | `web/mode.js`、`web/band_data.json`、`tools/` | 每条策略效果触发后有明显可观察结果；数值可追溯 | `effectBuffInfoDataDict`(361/70 原语)、`effectInfoDataDict`、`bandDataListDict` |
| **T-20260902-003 / U-OPERATOR** 系统性补齐缺失机制 | 补齐未实现的技能、天赋、阻挡和复活规则 | `web/mode.js`/`engine.js`、`tools/` | 来源字段、规则语义、consumer 与边界验证闭合 | `effectBuffInfoDataDict` 70 原语分类 |
| **T-20260902-003 / U-ITEMS** 召唤物 / 额外道具 | 实现干员召唤物与可使用额外道具（`special_goods`） | `web/**`、`tools/` | 道具装备/使用后产生对应效果（刷新/金币/升阶/层数） | `web/equips.json`(use 26)、`effectBuffInfoDataDict`(`use_equip_*`) |
| **T-20260902-003 / U-OPERATOR** 复活时间 | 从基础资料修正干员复活时间 | `web/mode.js`、相关数据 | 复活时间与 `char_table`/`battle_equip` `respawn_time` 一致 | `respawn_time` 数据（尚未接引擎字段） |
| **T-20260902-003 / U-ECONOMY** 击杀金币 | 仅指定特殊奖励关卡敌人掉落指定金币 | `web/mode.js`/`engine.js` | 普通击杀不掉金币；特殊敌人按 `add_enemy_kill_gain_coin` 掉 | `effectBuffInfoDataDict`(`add_enemy_kill_gain_coin`)、`effectChoiceInfoDict` |
| —（数据前置已做） | 盟约归属 + 特质解析 | — | — | `web/op_bonds.json`、`web/equips.json`（本次已完成） |

## 5. 待定位 / 需新数据源

- **装备 cost**：不在 `effectInfo`/`effectBuff`/`shopLevelDataDict`，需另找定价表或在客户端。
- **引擎字段缺口**：`magic_resistance`/`block_cnt`/`respawn_time` 未扩展到 `mods`（当前仅 `atk/hp/def/aspd`）。
- **`SERVER_*` 31 种**（商店/经济/休整叠层）与 `enable_*` 敌人/地图/全局选择：需 shop/server 钩子。


## 6. gamedata 字段利用总清单（系统排查，2026-09）

> 状态：✅ 已提取+已接入；🔶 已提取/部分接入；⬜ 未提取/未接入。
> 数据源：`activity_table.json` 的 `autoChessData`（22 键）+ `AUTOCHESS_SEASON.act2autochess`（29 键）。

### 6.1 autoChessData（模式通用配置，22 键）

| 字段 | 内容 | 状态 |
|---|---|---|
| versionInfoDict | 赛季版本 V1/V2 | ✅ 赛季判定 |
| bandDataDict | 开局策略 | ✅ band_data/band_effects → 22/40 |
| bondInfoDict | 盟约 20 | ✅ bond_data → 盟约 |
| bossInfoDict | 领袖 10 | ✅ mode_data.bosses → BOSS_LIST |
| enemyTypeDatas | 特训敌人 7 类 | ✅ mode_data.enemyTypes |
| randomEnemyAttributeDict | 敌人池 324 | ✅ enemyPool → genWaves 兜底 |
| constData | 常量 38 | ✅ constants.json |
| effectTypeDataDict | 效果类型分类 | 🔶 部分（findings 提及） |
| cultivateEffectList | 养成效果 | ⬜ |
| enterStepList | 进入步骤 | ⬜ |
| shopStateTokenDict | 商店状态 token | ⬜ |
| skillTriggerDataList | 技能触发 | ⬜ |
| skillRangeDict | 技能范围 | ⬜ |
| prepareStateDict | 准备状态 | ⬜ |
| enabledEmoticonThemeIdList | 表情主题 | ⬜（同盟表情未做） |
| gameTipsList | 游戏提示 | ⬜ |
| medalDataList | 勋章 | ⬜ |
| turnInfoDataDict | 回合信息 | ⬜ |
| roundScoreDataList | 回合分数 | ⬜ |
| reportPlayerDataList | 报告玩家 | ⬜ |
| broadcastList | 广播 | ⬜ |

### 6.2 act2autochess（赛季具体数据，29 键）

| 字段 | 内容 | 状态 |
|---|---|---|
| modeDataDict | 模式数据 | ✅ mode_data.modes（9 模式：可用/禁用盟约、禁用敌人，本轮接入盟约栏限制 + genWaves 排除） |
| bandDataListDict | 策略列表 | ✅ band_effects |
| charChessDataDict | 棋子定义 | ✅ op_bonds（盟约归属） |
| charShopChessDatas | 商店棋子→charId | ✅ chess_map/op_bonds |
| trapChessDataDict | 装置 115 | ✅ trap_data（装置+价格） |
| trapShopChessDatas | 商店装置 59 | ✅ trap_data.shop（道具+价格） |
| shopLevelDataDict | 商店等级 | ✅ shop_level |
| shopCharChessInfoData | 棋子价格/养成 | ✅ TIER_PRICE（本轮） |
| garrisonDataDict | 特质 320 | ✅ op_bonds.garrison（GAIN_BUFF/ADD_BOND） |
| effectInfoDataDict | 效果信息 | ✅ equips |
| bondInfoDict | 盟约 | ✅ |
| bossInfoDict | 领袖 | ✅ BOSS_LIST |
| specialEnemyInfoDict | 特训敌人 67 | ✅ enemy_type_pool |
| effectBuffInfoDataDict | 效果 buff 361 | 🔶 部分（use_equip/特殊装备） |
| specialEnemyRandomTypeDict | 特训随机类型 | 🔶 间接（enemy_type_pool） |
| effectChoiceInfoDict | 选择事件 109 | ⬜（定向投放/决策） |
| baseRewardDataList | 基础奖励 | ⬜ |
| chessNormalIdLookupDict | 棋子 ID 查找 | ⬜ |
| diyChessDict | 自定义棋子 | ⬜ |
| shopLevelDisplayDataDict | 商店等级显示 | ⬜ |
| stageDatasDict | 关卡数据 | ⬜ |
| battleDataDict | 战斗数据 | ⬜ |
| enemyInfoDict | 敌人信息 | ⬜ |
| trainingNpcList | 训练 NPC | ⬜ |
| milestoneList | 里程碑 | ⬜ |
| modeFactorInfo | 模式因子（SINGLE/MULTI=1.25） | 🔶 已提取（mode_data.modeFactorInfo），未接（语义待确认） |
| difficultyFactorInfo | 难度因子（FUNNY/NORMAL/HARD/ABYSS） | 🔶 已提取（mode_data.difficultyFactorInfo），未接（当前难度用 PRTS 表） |
| playerTitleDataDict | 玩家称号 | ⬜ |
| constData | 常量 | ✅ |

### 6.3 小结

- **已接入（✅）约 22 键**：盟约/策略/领袖/特训敌人/敌人池/装置/商店/价格/养成/特质/效果装备/常量/棋子映射/模式数据（可用盟约+禁用敌人）。
- **部分接入（🔶）约 4 键**：effectTypeDataDict、effectBuffInfoDataDict（特殊装备 use 类）、specialEnemyRandomTypeDict（经 enemy_type_pool 间接）、modeFactorInfo/difficultyFactorInfo（已提取未接）。
- **未接入（⬜）约 25 键**：多数是「进度/勋章/表情/称号/奖励/广播/提示」等联机与成就外围，以及「决策选择（effectChoiceInfoDict）」等玩法项。

