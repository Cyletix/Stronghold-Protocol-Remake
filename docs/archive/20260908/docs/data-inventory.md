# 卫戍协议 基础数据清单

> 数据源：Kengxxiao/ArknightsGameData（zh_CN，每日更新）。路径相对 `zh_CN/gamedata/`。
> 模式内部代号 `autoChess`。官方活动（`activity.AUTOCHESS_SEASON` + `versionInfoDict`，gamedata）仅有 `act1autochess`（V1，seasonName「盟约」）与 `act2autochess`（V2，seasonName「盟约」）。`act1vautochess` 未出现在二者中，属需复核的单独结构（见「赛季与上下半归属」，`[Inferred]`）。
> 当前「抽取/接入进度」（哪些已提取、哪些待接）见 `docs/data-progress.md`。

## 0. 赛季与上下半归属（U-SEASON 核对）

> 结论以 gamedata 为准（`activity_table.json` 的 `AUTOCHESS_SEASON`/`versionInfoDict`，证据等级 **Verified**），PRTS 页面与代码映射作为交叉参考。

- **赛季**（Verified）：`act1autochess` = V1（seasonName「盟约」，`versionInfoDict.V1_1/V1_2`）；`act2autochess` = V2（seasonName「盟约」，`versionInfoDict.V2_1/V2_2`）。两个官方活动都有 name/起始时间；`act1vautochess` 不在 `AUTOCHESS_SEASON`/`versionInfoDict` 中，其关卡文件（`level_act1vautochess_01-0X.json`，章-关命名）与其余结构不同，仅凭命名硬编码映射，`[Inferred]`。
- **上下半**：PRTS「卫戍协议：盟约」（上半，页面 f1）与「卫戍协议：盟约 下半」（2nd Phase，页面 f2）。页面 f1 出现「森蚺」、f2 无——即森蚺属上半，下半已删除（`I-20260902-023`，页面检索 Verified）。
- **策略头像 / band 数据来源**：来自**下半**页面（`卫戍协议：盟约 下半 - PRTS...`）。`tools/extract_band_data.py` 抓「卫戍协议：盟约 下半/PRTS盟约记录」策略报告生成 `band_data.json`；`tools/copy_band_avatars.js` 从该页 `_files` 复制 `卫戍协议：盟约_策略发起人_<名>.png` → `web/band_avatars/<bandId>.png`。即策略阶段用**专用「策略发起人」头像**，不用干员头像（`I-20260902-022`）。
- **森蚺（上半）补齐**：森蚺属上半（下半已删，`I-20260902-023`）。其策略数据实际在客户端 `activity_table.json` 的 `bandDataListDict.band_zumama`（`bandDesc=【机械援助】…`、`totalHp=38`、`effectId=aceffect_band_43`，Verified），已据此补入 `web/band_data.json`（策略「机械援助」/血量 38）；策略发起人头像取自上半页面 `_files\卫戍协议：盟约_策略发起人_森蚺.png` → `web/band_avatars/band_zumama.png`。`mode_data.json` 本就含 `band_zumama`（`bandInfoDict`），故森蚺可正常出现在策略选择中。
- **代码映射标注**：`tools/build_levels.js` 的 `SEASON_CN`/`SEASON_KIND`/`KNOWN_V1` 为硬编码推断（`[Inferred]`），其中把 `act1vautochess` 视作第一版（AC-*）、`act1autochess` 视作「盟约」；与上述 gamedata 官方赛季定义并非同一语义，不得静默当作客户端确定事实，需在 `T-20260902-002` 中复核。

## 1. 活动与模式配置（excel/activity_table.json → autoChessData 段）

| 配置 | 键 | 说明 |
|---|---|---|
| 赛季版本 | versionInfoDict | V1_1/V1_2=act1autochess、V2_1/V2_2=act2autochess，seasonName=「盟约」 |
| 开局策略/阵营 | bandDataDict | ~20 个 `band_*`（band_amiya、band_duyaoy…），含 bandId/bandName/bandIconId/unlockDesc |
| 盟约 | bondInfoDict | 20 个舰船（yanShip/sargonShip/victoriaShip…），含 bondType、powerIdList（引干员） |
| 领袖/BOSS | bossInfoDict | boss_1~boss_10，含 enemyId/handbookEnemyId |
| 特训敌人 | enemyTypeDatas | 7 类：SPECIAL/FLY/TIMES/ELEMENT/DOT/INVISIBLE/REFLECTION |
| 效果类型 | effectTypeDataDict | BAND_INITIAL/ENEMY/ALLY/EQUIP/MAGIC/CHAR_MAP/BOND/ENEMY_GAIN/BUFF_GAIN/GARRISON/NONE |
| 常量 | constData | 38 键：匹配/计时/敌人模板/聊天/资金颜色等 |

## 2. 干员数据

| 数据 | 位置 | 说明 |
|---|---|---|
| 基础干员 | excel/character_table.json | 全部干员属性/技能/潜能 |
| 技能 | excel/skill_table.json | 干员技能定义 |
| 原型干员（当前赛季） | excel/char_master_table.json | master_radian_6、master_mcnist_3、master_mcnist_2，各含 candidates |
| 原型干员完整定义 | excel/char_meta_table.json → charMasterDataMap | master_radian_1~6、master_mcnist_1~6，含 levelList（各阶天赋） |
| 干员→原型映射 | char_meta_table.json → charIdMasterListMap | 如 char_4195_radian → master_radian_1~6 |
| 同名干员分组 | char_meta_table.json → spCharGroups | 如 char_502_nblade ↔ char_1029_yato2（3 同名合并用） |

## 3. 装备 / 补给 / 增益

| 数据 | 位置 | 说明 |
|---|---|---|
| 装备/补给 | excel/charm_table.json → charmList | 如 level_cost_1（等级费用减免等） |
| 科技增益 | excel/tech_buff_table.json → runes | 如 tree_branch_1_1（分支增益） |

## 4. 关卡与敌人

| 数据 | 位置 | 说明 |
|---|---|---|
| 回合/关卡 | levels/activities/{act1autochess,act1vautochess,act2autochess}/*.json | 22 键：options/mapData/runes/globalBuffs/waves/enemies 等 |
| 敌人数据 | levels/activities/act1autochess/level_autochess_enemy_data.json | 敌人定义 |
| 敌人图鉴 | excel/enemy_handbook_table.json | 敌人基础数据 |

### 4.1 地图 / 地形 / 候选区 / 路线来源（U-SOURCES）

- **关卡地图**（Verified，gamedata）：`zh_CN/gamedata/levels/activities/{act1autochess,act1vautochess,act2autochess}/level_*.json` → `mapData.map`（tile 索引网格）+ `mapData.tiles[]`（每 tile `passableMask`/`buildableType`/`heightType`/`playerSideMask`）。
- **候选区 `tile_achand`**（Verified，stage_table）：`zh_CN/gamedata/excel/stage_table.json` → `tiles.tile_achand`（name「手牌区」，描述「待部署区域，置于其中的干员不会加入战斗」）。候选区由地图 `tile_achand` 网格承载，不再退化为独立 DOM 手牌列表（Project.md 约束）。
- **地形贴图**：`tools/extract_dungeon_tiles.py` 从 OBB 解包的 `dungeontile` AssetBundle 导出 → `web/ui/tiles/`。OBB 内 `.ab` 的 data block codec=4 是 **LZ4 字节序变种**（`[Verified]`，M2c，`tools/decompress_ab.py` 已打通：token 高低 4 位交换 + offset 大小端交换），可直接解析官方 OBB。
- **怪物路线**：`tools/fix_routes.py` / `tools/rebuild_routes.py` 依 `passableMask` 做四邻接 BFS（红门 `tile_start`→蓝门 `tile_end`，紫门 `tile_telin`→`tile_telout` 分段传送），供 `tools/build_levels.js` 生成 `web/battle_levels.json` 的 `segs`。
- **赛季活动名**（Verified）：`activity_table.json` → `activity.AUTOCHESS_SEASON.act1autochess` / `act2autochess` 的 `name` 均为「卫戍协议:盟约」（V1/V2）。
- **当前玩法主赛季**：`web/mode.js` 用 `COVENANT_KINDS=['covenant','covenant2']` 过滤，即 act1autochess（covenant）与 act2autochess（covenant2）为当前可玩，act1vautochess（v1）不参与（`[Inferred]`，见本文件 0 节）。

## 5. 文案

- story/activities/{act1autochess,act1vautochess}/guide/*.txt：官方教学文案（基本玩法）

## 尚未在 gamedata 明确定位（推测在客户端编译代码 libil2cpp.so 内）

- 「目标干员」名册的精确名单 + Ⅰ~Ⅵ阶的精确分配。gamedata 提供干员定义 + 原型补位体系，但「哪些干员进补给池、各自阶数」的精确表未在 JSON 中找到，可能在客户端 C# 内（或由稀有度派生：5~6 阶=★6）。
  - 注：本仓已用 `charShopChessDatas`(chessId→charId) 定位到 121 名干员名单（见 `web/op_bonds.json`），阶数见 `web/operator_tiers.json`；「精确名单」已部分解决。
- 装备/特殊装备的 **cost**（商店售价）：未在 `effectInfoDataDict`/`effectBuffInfoDataDict`/`shopLevelDataDict` 中找到，可能另有一张定价表或在客户端。