# 调研发现（Phase 0 结论）

> 记录对目标 APK 的解包结果与外部数据核实，供后续阶段引用。日期 2026-08。

## 结论速览

- **日服 APK 含「卫戍协议」**：内部代号 `autoChess`（自走棋），共两赛季 `act1autochess` / `act2autochess`。**无需更换国服 APK**。
- **游戏服务器地址**：`https://gs.arknights.jp`（webview 为 `ak-webview.arknights.jp`）。
- **客户端技术栈**：IL2CPP + **XLua**（大量玩法逻辑在 Lua），`libil2cpp.so` 182MB、`libxlua.so` 3.8MB。
- **静态数据来源**：`Kengxxiao/ArknightsGameData`（每日更新，默认分支 `master`，顶层仅 `zh_CN`——CN 专用）。`yuanyan3060/ArknightsGameData` 已弃用（2021 年旧数据，不含卫戍协议）。

## APK 解包详情（アークナイツ_36.7.22_APKPure.xapk）

xapk 含 2 个有效条目：
- `com.YoStarJP.Arknights.apk`（97.7MB）
- `Android/obb/com.YoStarJP.Arknights/main.2000138.com.YoStarJP.Arknights.obb`（1.83GB，素材主体）

APK 结构要点：
- `lib/arm64-v8a/`：`libil2cpp.so`（182MB）、`libunity.so`（19MB）、`libxlua.so`（3.8MB）——IL2CPP + XLua 确认
- `global-metadata.dat` 位置：`assets/bin/Data/Managed/Metadata/global-metadata.dat`（36.96MB）——Phase 2 的 Il2CppDumper/Cpp2IL 输入
- APK 根目录有 `client_analytics.proto` / `messaging_event.proto` —— protobuf 确认
- `assets/` 下网络/SDK 配置：`u8_developer_config.properties`、`HGUniWebUrlMapping.json`、`SDKConfigSettings.json`、`u8_plugin_config.xml`

## 关键配置内容

### u8_developer_config.properties（节选）
- `YOSTAR_GAME_URL=https://gs.arknights.jp`
- `YOSTAR_AREA_SERVER=jp`、`YOSTAR_PID=JP-AK`

### HGUniWebUrlMapping.json（关键证据）
- `ak_act1autochess` → `.../autoChess/act1autochess`
- `ak_act2autochess` → `.../autoChess/act2autochess`
- 另有 `ak_rogue_1~5`（集成战略）、`ak_sandbox_1`（生息演算）——印证 `autoChess` = 卫戍协议（自走棋）

## 卫戍协议数据位置（已在 Kengxxiao 仓库定位）

- `zh_CN/gamedata/excel/activity_table.json`：`basicInfo`/`activity`/`activityItems` 含 `act1autochess`、`act1vautochess`、`act2autochess`；`activity` 类型含 `AUTOCHESS_SEASON`；另有 `autoChessData` 段
- `zh_CN/gamedata/levels/activities/{act1autochess,act1vautochess,act2autochess}/*.json`：回合/关卡定义（含 `operaConfig`、`runes`、`waves` 等）

## 攻击弹道（projectile）证据状态 & 实现说明（2026-08-31）

**已验证事实**
- `audio_data.json` 中存在多类具名弹道，且区分物理/法术：`battle.ON_PROJECTILE_HIT.projectile_arrow` / `projectile_crossbow`（物理）、`projectile_magic_ball`（法术）、`projectile_sword_rain`、`projectile_mortar` 等 → 印证原版「物理=弹丸/箭矢、法术=法术光球」的分类。
- 干员 `position`（RANGED/MELEE）与 `atkType`（phys/arts，术师/辅助=arts）均在解包数据中可确认，可用于确定攻击方式与弹道形态。

**未验证（研究事项，不得当作原版行为）**
- **逐干员的精确弹道定义与飞行速度**：位于 binary prefab（`resource_manifest_idx.json` 中的 `battle/prefabs/effects/*.prefab`、`gamedata/bakemuzzledata/character/*.bytes`），当前未解包读取，故无法复刻原版逐干员弹速/弹道形态/命中特效。
- 因此当前 `web/engine.js` 采用**统一通用弹道**替代：物理=细长箭矢、法术=带光晕的光球，均附运动拖尾；我方弹速 `PROJECTILE_SPEED=10` 格/秒、敌方 `ENEMY_PROJECTILE_SPEED=6` 格/秒（合理默认，非原版实测值）。攻击方式按 `position` 区分远程/近战（近战瞬时结算，不发射弹道）。
- 后续如需精确复刻，需从 OBB 解包 prefab 并映射每个 `charId`/`enemyId` → 弹道预制体与速度。
- `zh_CN/gamedata/levels/activities/act1autochess/level_autochess_enemy_data.json`：敌人数据
- `zh_CN/gamedata/story/activities/*/guide/*.txt`：官方教学文案（基本玩法）
- `zh_CN/gamedata/[uc]lua/hotfixes/AutoChess*.lua`：模式热修补丁

> 注意：卫戍协议关卡/敌人/Lua 逻辑跨服一致（仅文案本地化不同），CN 数据可直接用于日服客户端。

## OBB / 素材（AssetBundle）—— 已解包分析

- OBB 是 ZIP（解包 1.79GB，3175 条目），主体在 `assets/AB/Android/`：arts(654)/battle(585)/charpack(440)/ui(249)/scenes(208)/`[[jp]]`(27)/activity(1) 等；另有 `assets/bin/Data/`（哈希命名数据）
- **`.ab` 资源包是明文 UnityFS（2021.3.39f1），无 XOR 加密**（国服才有 XOR，日服没有）
- data block 压缩 codec=4/5 是 **LZ4 字节序变种**（M2c 已验证，`tools/decompress_ab.py` 可解压）：Arknights 把标准 LZ4 block 的 token 高低 4 位交换（标准「高4=literal/低4=match」→ AK「低4=literal/高4=match」）、match offset 大小端交换（标准小端 → AK 大端），变换回标准 LZ4 即可解（算法源于 MooncellWiki/UnityPy commit 781badde6d636，Kengxxiao）。注：UnityFS 枚举里 codec=4 名义上叫 Lzham，但 Arknights 实际用 LZ4 变种，UnityPy/AssetStudio 均未实现
- autoChess 命名资源仅 `[uc]emoticon_autochess_basic.ab`（表情主题）；模式 UI/立绘用通用分类名，未用 "autochess" 前缀

## 客户端逆向（libil2cpp / metadata）

- `libil2cpp.so`（182MB）字符串：无游戏端点（端点动态下发）；见构建路径 `arknights-jp` + U8 SDK
- `global-metadata.dat` 字符串扫描（44 万条）发现：
  - 登录方法：`PublicLogin`（游客登录）、`DoSDKLogin`、`DoPasswordLogin`、`Login`、`LoginWithPlugin`、`EventOnLoginClicked`；JSON 模板 `{"userId":"{0}","loginType":{1}}`
  - autochess 类型：`AutoChessTeamStatus`(bannedBond)、`AutoChessBattleAllStateSyncData`(bannedBonds，联防同步)、`AutoChessBattleUIViewStruct`、`AutoChessCheckHasEquip`、`Garrison`、`GetChessIdByIdentifier`
  - 模式事件流 `ON_ACT1AUTOCHESS_*`：ROUNDSTART / SHOP_LOCK/UPGRADE / ADD_BOND / EQUIP_DONE / MAGIC_PLACE / BATTLEOVER / SETTLEMENT / BOSSROUND；多人 PLAYER_JOINROOM / MATCH / DEFENCE_START/UNITE / DISCONNECT
  - 网络库 Best HTTP + SignalR；反作弊 CodeStage ACTk
- **`global-metadata.dat` 头部被 XOR 加密**（magic 非 `AF1BB1FA`），Il2CppDumper 无法直接解析；8 字节已知明文攻击不成立（密钥更长或非简单 XOR）。需逆向 `libil2cpp.so` 的 metadata loader 找密钥，或绕过

## 结论

- **私服无需提取素材**——客户端已在本地 OBB 拥有全部资源，服务器只需下发 gamedata + 正确应答
- 素材提取仅用于理解/参考；`.ab` 的 data block codec=4/5 已用 `tools/decompress_ab.py`（LZ4 字节序变种）打通，可解出 SerializedFile 交给 UnityPy 枚举 Objects

## Web 镜头/预览验证记录（U-VERIFY, T-20260902-002）

- `tools/_smoke.js`：**SMOKE OK** —— 数据/回合循环/部署/战斗（Verified）。
- `tools/_ui_layout_smoke.js`：镜头（`fitS` 收起/展开、`__shopCollapsed`）、`tile_achand` 候选区、商店、冻结/展开等断言通过；**2 项 FAIL**：「开局策略入口紧贴回合 HUD 左侧」「半透明深绿色方形」——属局部 UI 样式，超出本任务（地图/分区/镜头）范围，转 `T-20260902-005`。
- **修复**：`web/engine.js` `onClick` 新增「预览视图下点击预览块(A 区)之外 → 退出预览回作战窗口」（`I-20260902-016`）；`node --check web/engine.js`、`node --check web/mode.js` 通过。
- **视觉分层**：预览块实际渲染、boss 战 C 区镜头/候选/出怪、总览清晰度依赖浏览器/截图，无头环境未验证；**记录为待人工视觉验收**，不冒充为 Verified（对应 `I-20260902-005`）。

## U-ECONOMY 提取与接入记录（T-20260902-003）

- **提取产物**：`tools/build_economy.js` 从 `activity_table.json`（`act2autochess`）生成 `web/shop_level.json`（`shopLevelDataDict.mode_single_normal` 6 级：`charChessCount` 3→5、`itemCount` 1、`upgrade` 5/8/11/12/13/99）+ `web/kill_coin.json`（`add_enemy_kill_gain_coin` 109 条 `enemyId/coin/round/count`）。
- **商店刷新接入**（`mode.js`）：`genShop` 用 `shopLevelInfo()` 取干员卡数(`charChessCount`)+物品卡数(`itemCount`)；`upgradeShop` 升本费用用 `SHOP_LEVEL[G.level-1].upgrade`（替换旧 `4+G.level`）；`renderShop` 槽位用 `shopSlots()`（随等级变化）。无 `SHOP_LEVEL` 时兜底旧逻辑。
- **击杀奖励接入**：`engine.js` `killEnemy` 发 `window.onKillCoin(enemyId)` → `mode.js` `onKillCoin` 按 `enemy_id`+`round` 匹配 `kill_coin` 加金币（普通击杀不掉钱，`I-20260901-020`）。
- **资金**：`roundMoney=12+r*4` 为近似（`turnInfoDataDict`/`constData` 无回合资金公式）；每回合重置机制已满足 `I-20260901-007`（[x]），精确数值无 gamedata 依据 → 保留为后续研究事项。
- **验证**：`_smoke.js` SMOKE OK（商店 4 卡/回合/战斗）；`_ui_layout_smoke.js` 商店断言改为 `shopSlots()` 动态后通过（仅 2 个「策略入口样式」FAIL 属 `T-20260902-005`）；`node --check web/engine.js`、`web/mode.js`、`tools/_ui_layout_smoke.js` 通过。

## U-STRATEGY 提取产物（T-20260902-003）

- **提取**：`tools/build_strategy.js` 从 `act2autochess.bandDataListDict`（`effectId`/`totalHp`/`bandDesc`）× `autoChessData.bandDataDict`（`bandName`）× `act2autochess.effectBuffInfoDataDict`（机制）生成 `web/band_effects.json`（40 条：`bandId/name/hp/effectId/desc/keys/mechs.blackboard`）。
- **机制分布（24 种 `effect key`）**：`env_gbuff_new_with_verify`×10（属性乘区 buff，如阿米娅「众志合一」按激活盟约 3/4/5 种给 atk/max_hp +20/30/40%，blackboard 含 `atk_1..3`/`max_hp_1..3`/`value_1..3`）；`preparation_start_gain_chess_from_round`×10（回合开始从指定回合获得干员/棋）；其余各 1：盟约层数 `prep_finish_char_bond_add_layer`、刷新 `band_first_self_refresh_present_char`/`band_shop_refresh_copy_max_lv_char`、金币 `give_coin_in_round`/`coin_carry_over`/`refresh_shop_count_gain_coin_bond_char_chess`、特殊装备 `up_shop_add_special_goods`/`preparation_start_add_special_goods_every_n_round`、复活 `round_start_activate_char_chess_effect_in_board`、地图切换 `auto_chess_change_map` 等。
- **依赖**：属性 buff（`env_gbuff_*`）与盟约层数、金币类可独立接入；特殊装备类（骑士储蓄罐/寻呼模块）依赖 `U-ITEMS`；复活/干员 buff 类依赖 `U-OPERATOR`/盟约层数系统；经济类依赖 `U-ECONOMY`。
- **复现状态**：提取完成；「逐条可执行 40 条」需先建**策略机制分发框架**（`band_effects.json` 的 `keys` → 钩子），并分系统接入属性/经济/盟约层数/特殊装备/复活等，属跨多轮 deep 项。**未在本 unit 单次假完成**——如实记录为待后续 `U-OPERATOR`/`U-ITEMS` 子系统支持后批量接入。

### 可复用模式（已抽取，降后续难度）
- **`prep_finish_char_bond_add_layer`（盟约层数加成）**：`applyBandStrategy` 按 `entry.tier` 分组随机干员 → 其 `seasonBond`+`regBonds` 的 `G.addLayers[bid]+=layer`（`startBattleRound` 开战前调用）。已接 `band_bldsk` 华法琳。
- **`env_gbuff_new_with_verify`（分档属性 buff，`applyBandStatBuff`）**：解析 `value_1..3`（达标档位）+ `atk_1..3`/`max_hp_1..3`/`def_1..3`/`aspd_1..3`（对应档位加成），达标数默认=激活盟约数量（`bond_id` 时=该盟约 stack），取最大满足档位乘到 `mods`；并支持 `atk_per_cnt`/`max_hp_per_cnt`（按达标数×每层）。在 `resolveBoard`（`computeBonds` 后、`finalizeOperator` 前）调用，一条函数覆盖全部 10 条 `env_gbuff` 策略。已接 `band_amiya` 阿米娅。
- **`give_coin_in_round`（回合开始给金币，`applyBandOnRound`）**：按 `round`/`coin` 匹配，`startRound` 时若当前回合匹配则 `G.money += coin`（多条 `round/coin` 逐回合判断）。已接 `band_oldl` 老鲤（第 3 回合 +15）。
- **`first_buy_in_round_char_price_change`（首购折扣，`bandFirstBuyDiscount`）**：本回合首次购买指定盟约干员降价 `price`（`buyShop` 按 `bond` 匹配 `entry.seasonBond/regBonds` 折算成本，`startRound` 重置 `_firstBuyUsed`）。已接休露丝。
- **`grantBandOperator`（按条件获得干员，通用可复用）**：按 `bond`(盟约)/`tierMax`/`tierMin` 从 `ROSTER_LIST` 随机抽 1 名加入商店/手牌。供获得干员类策略复用：`buyShop` 累计花费触发（绮良每 20、潘格尼尼累计 55 各 1 名）；贾维/哈洛德/松桐/玛恩纳 可在 `refreshShop`/`startRound` 钩子复用。

### 组件覆盖进展（迭代）
- 已接可观察效果：`env_gbuff_new_with_verify`×10 + `prep_finish_char_bond_add_layer`×1 + `give_coin_in_round`×1 + `first_buy_in_round_char_price_change`×1 + `get_op_by_spending`(绮良/潘格尼尼)×2 + `gain_bond_char_per_round`×1 + `round_start_gain_char_chess_in_shop_every_n_round`×1 + `refresh_shop_count_gain_coin_bond_char_chess`×1 + `round_start_bond_check_gain_layer`×1 + `round_start_gain_coin_by_bond_char_chess_buy`×1 + `special_refresh`(杜遥夜/佩佩)×2 = **22 / 40 条**。
- **抽象粒度确认（按特性 key，非按干员）**：每个干员模板 = 一个 `bandId`（`band_effects.json` 的 `keys`/`mechs` 即其特性类型组合）；通用组件按 `key` 聚类（`applyBandStatBuff`/`applyBandStrategy`/`applyBandOnRound`/`grantBandOperator`/`bandFirstBuyDiscount`/`bandRefreshBond`），一个应用器覆盖该类所有干员——这正是「以特性类型划分，每个模板 = 特性组合」。
- **剩余 18 条**：坎诺特(资金继承)、巫恋(卖棋交换)可独立（改动 `startRound`/`sellHand`，成本低）；其余 **15 条依赖子系统**（`gainchess` 装置·获装×9、`specialeq`×2、`operator`×1、`enemy`×1、`map`×1、梓兰寻呼模块）——依赖 `U-ITEMS`/`U-OPERATOR`/敌人/地图系统，**无法在无子系统下真实复现**，机制已提取并记录依赖，待子系统就位后由现有组件批量接入（不臆造）。


### U-STRATEGY 逐条验收（2026-09-05 收尾）

- **24 种 effect key 逐条状态**：已实现 22 种（覆盖 38/40 条策略）；剩余 2 种关键机制未复现、不臆造，明确转交：
  - `round_start_all_player_change_enemy_2`（鸭爵）：从第 5 回合起把部分敌人替换为特殊敌人（`enemylist`），依赖敌人系统 → 转 `T-20260902-004`（敌人战斗行为）。
  - `auto_chess_change_map`（Touch）：场上出现「预备干员-医疗」，战斗开始若有 ≥2 精锐则替换为 Touch，依赖精锐计数与 roster 替换机制 → 转 `U-OPERATOR`。
- **本轮修复（string blackboard 读取 bug）**：`bbNum` 用 `Number(x.v)` 强转，导致所有字符串 blackboard（`bond`/`chess`/`type`/`pool`/`bond_id`）变 `NaN`，使哈洛德/杜遥夜/佩佩/休露丝/玛恩纳/贾维等盟约筛选静默失效。新增 `bbStr`（读原始值）并替换全部字符串读取点（8 处）。
- **本轮修复（回合开始顺序）**：`applyBandOnRound` 原在 `genShop` 之前调用，导致「获得干员/棋」类策略（`intoShop`）在下一行被 `genShop` 清空。已把 `applyBandOnRound` 移到 `genShop` 之后，使哈洛德/松桐/老鲤等获得效果真正入店。
- **本轮新接入 5 条**：坎诺特 `coin_carry_over`（`bandCoinCarryOver`：剩余资金继承 + 剩余≥capital 计息 +interest，接 `startRound`）、巫恋 `first_sell_char_chess_exchange_char_chess_in_shop`（`bandFirstSellExchange`：每回合首次出售改为与调度中心干员交换，接 `sellHand`/`onOpSell`，`startRound` 重置标记）、老鲤 `prep_start_gain_chess_from_pool_in_round`（第 3 回合 `pool_chess_shop_N_reward` → N 阶随机干员，接 `applyBandOnRound`）、梓兰 `band_shop_refresh_copy_max_lv_char`（`bandRefreshCopyMaxLv`：主动刷新复制最高阶干员，接 `refreshShop`）、杜宾 `preparation_start_gain_chess_every_n_round`（每 n 回合获得装置，复用 `rewardTrap`，接 `applyBandOnRound`）。
- **验证**：`node --check web/mode.js` 通过；新增 `tools/_band_strategy_smoke.js` SMOKE OK（坎诺特/巫恋/老鲤/梓兰 11 断言）；既有 `_smoke.js`/`_equip_bond_smoke.js`/`_skill_effect_smoke.js`/`_ui_layout_smoke.js`/`_session_commands_smoke.js` 等 17 项 smoke 通过。`_rich_smoke.js`（harness 缺 `document.addEventListener` mock）与 `_ui_immersive_smoke.js`（盟约图标已改 PNG，测试仍断言 SVG 环形）为既有失败，与本轮无关。

## U-OPERATOR 干员整理（P0）收尾状态

- **干员属性**：`maxHp/atk/def/magicRes/cost/blockCnt/attackTime/respawnTime` 全部来自 gamedata `character_table` `phases.data`；复活时间 6→80/200s（`I-20260902-021`）、阻挡数按精英化阶段（`I-20260902-020`）。
- **技能/天赋**：`skill_data` 433 干员（**430 有 effects**，90%+ 算子近似；`skill_patch.json` 补 14 未分类用近似如 `buff_range`/`slow`/`dodge`/`aoe_damage`，note 均标高「近似」）、`talent_data` 851。**3 个 blocked（指挥调度/激励艺术=天赋增强、开锁工具=随机回费）effects 留空、未瞎编**。
- **铃兰 `SERVER_GAIN`**：定位为 `garrisonDataDict` 干员「获得时」特质（59 个），核心效果（盟约层数/下回合金币/按等级加层）已接；其余 effectType 标注待接入。
- **待引擎级机制（不能做的，留空待补）**：**召唤物**（干员召唤物单位，类似装置/新单位）、**持续伤害 dot**（每 tick 结算）、**姿态切换**（状态机）；以及上述 3 个 blocked 技能。→ 下一工作块：补「召唤物/持续伤害」引擎机制。
- **持续伤害 dot 盘点＝已存在**：`engine.js` 战斗循环已有 `burnUntil`/`burnRate`（干员/敌人每 tick `hp -= maxHp*burnRate*dt`，860/890 行附近）——灼燃类持续伤害已实现，无需重造。
- **召唤物缺口（真正待建）**：`skill_data` 召唤类技能干员 = `char_4162_cathy`（岁月锻打）、`char_4178_alanna`（气动增压）、`char_450_necras`（噩愿）、`char_2023_ling`（重进酒）等；`talent_data` `char_452_bstalk`/`char_110_deepcl` 等。引擎**无 `B.summoned` 召唤物单位系统**。
- **召唤物实施计划**：①`engine.js` 加 `B.summoned`（召唤物单位 `{charId,row,col,hp,atk,attackTime,life}`）；②技能/天赋「召唤」算子 → 生成 `B.summoned`（可自动攻击、按 `life` 存续、死亡移除）；③渲染/阻挡/受伤结算；④回接召唤类技能与 3 个 blocked。


### 阻挡/复活 收尾（2026-09-05）

- **阻挡数按「固定养成」阶段取**（`I-20260902-020`）：`phaseDataOf` 原按账号练度（`getOpAccount`，默认精二）取阶段常量，改为按卫戍协议固定养成——`(精锐 || 阶≥Ⅲ) ? 精二 : 精一`（TIER_TRAIN，与账号练度无关）。修正 12 名近卫（艾丝黛尔/幽灵鲨/布洛卡等）普通态阻挡数 3→2（原误取精二值）。
- **阻挡计数逻辑**：`engine.js` 敌人更新里原只在「非攻击态」执行 `blocker.blocked++`，攻击中的敌人不计数，导致 3 阻挡重装可被 4+ 敌人同时阻挡。改为在找到阻挡者后立即计数（含攻击阶段），`blocked` 每帧按真实被挡敌人数结算。
- **复活时间已正确**（`I-20260902-021`）：`respawnTime` 取自 `LEVEL_DATA`（`level_data.json`，即 `character_table` 再部署时间），普通 70s、快活/处决者 18s、机器 200s，各阶段一致。旧记录「6→80/200s」中 80 为近似，实际标准值为 70s。`battle_levels.json` 的 operators 无 `respawnTime` 字段（只有 `epRes`），故 `baseRespawnTime` 兜底路径无效，仅 `LEVEL_DATA` 路径生效（覆盖 454/454）。
- **验证**：新增 `tools/_block_respawn_smoke.js`（艾丝黛尔普通 2/精锐 3、格雷伊 70s、砾 18s、角峰 3、流星 1）；`_smoke.js`（完整战斗）与其余 17 项 smoke 通过。


### 技能选择/等级 收尾（2026-09-05）

- **技能选择按 `defaultSkillIndex`**：原 `extract_skills.js`/`classify_skills.js` 固定取 `character_table.skills[0]`（首技能），与卫戍协议棋子配置的 `defaultSkillIndex`（`mode_rules.json`，0/1/2）不一致——约 90% 干员（defaultSkillIndex≠0）技能选错。现改为读 `defaultSkillIndex` 取对应技能（`act2autochess` 优先，回退 `act1autochess`）。示例：德克萨斯 defaultSkillIndex=1 → 剑雨（原误取冲锋号令）。
- **技能等级按「固定养成」**：原固定取 `levels[0]`（技能1），现按棋子配置的 `normal.skillLevel=4`/`elite.skillLevel=7` 取 `levels[3]`/`levels[6]`（152 名棋子均 4/7 一致）。`skill_data.json` 结构改为每干员含 `normal`/`elite` 两个变体（`spCost/initSp/maxCharge/duration/blackboard/effects/prefabId/isPassive`），`mode.js` `finalizeOperator` 按精锐选变体，并移除旧「精锐 ×1.5 近似」。
- **验证**：`node tools/extract_skills.js && node tools/classify_skills.js` 重生成（433 干员、860 变体算子、6 未映射）；新增 `tools/_skill_select_smoke.js`（德克萨斯=剑雨、忍冬普通/精锐 spCost+initSp 分取变体）；`_skill_effect_smoke.js` 改为按 normal 变体校验；17 项 smoke 通过。


### 模组/天赋 收尾（2026-09-05）

- **模组（uniequip）接入**：`tools/build_modules.js` 从 `mode_rules.json`（`defaultUniEquipId`+`normal.equipLevel=0`/`elite.equipLevel=1/2/3`）× `battle_equip_table.json`（`phases[].attributeBlackboard`）生成 `web/module_data.json`（150 名干员）。`finalizeOperator` 按精锐取 `elite` 变体扁平加成：`max_hp`/`atk`/`def`/`magic_resistance` 为扁平加法、`attack_speed` 为攻速百分比（×1+N/100）。普通（equipLevel=0）无加成。例：德克萨斯精锐模组 hp+100/atk+35/def+15。
- **天赋（talent）状态确认**：`talent_data` 851 已提取（含 effects 算子 type/power/trigger），`activeTalentEffects` 按精英化阶段解锁并接入 buff/闪避类；**3 个 blocked（指挥调度/激励艺术=天赋增强、开锁工具=随机回费）effects 留空、未瞎编**——属需要更精确客户端证据的延期项，不冒充完成。
- **验证**：新增 `tools/_module_smoke.js`（德克萨斯精锐模组 hp/atk/def 扁平加成 + 普通无加成）；`tools/_skill_select_smoke.js`/`_skill_effect_smoke.js` 等 19 项 smoke 通过。


### U-ITEMS 收尾（2026-09-05）

- **装置（trap）**：`rewardTrap`（获得装置入库存 kind='trap'）→ `deployTrap`（部署到 `B.traps` + `applyTrapEffect`）。`applyTrapEffect` 接 `env_gbuff_new_with_verify`（全队攻击 `G._trapAtk`，在 `resolveBoard` 乘到 mods.atk）。**简化**：装置效果均为全队全局 buff（`env_gbuff`），不按棋盘位置结算；`B.traps` 单位未渲染（无渲染代码，refreshBoard/showBoard 会重置），仅作为部署占位记录。
- **特殊装备（use 类）**：`useSpecialEquip` → `applySpecialEquipEvent` 按 `special_equip_events.json` 的 10 种事件 key 分发（销毁得金币/获得干员/同盟约干员/随机商店干员/下回合金币/盟约层数/刷新获得/招募/升阶/部署次数）；使用即销毁。
- **召唤物（summon）**：引擎 `B.summoneds` 已建（自动攻击最近敌人、按 life 存续、死亡移除），但**干员召唤来源未接入**——召唤师（令/麦哲伦/凯尔希等）的召唤天赋 blackboard 仅含 `cnt`（召唤数量），召唤物 token（`character_table` 73 个 `token_*`）未提取到 `battle_data`，故无 `B.summoneds` 生成源。属「数据已提取（gamedata）未接入」的延期项。
- **验证**：新增 `tools/_items_smoke.js`（rewardTrap/deployTrap 全队攻击 buff、盟约之币销毁得金币+1）；19+1 项 smoke 通过。


### 敌人复杂机制 U-COMPLEX 收尾（2026-09-06）

- **已接入并验证**：`deathrattle`（死亡召唤，`enemy_key`+`cnt`）、`ep_attack`（攻击附带元素损伤，含凋亡降攻/灼燃持续伤）、`shield`（伤害减免）、`revive`（reborn 复活一次）、`buff_atk`/`buff_def`/`speed_up`（出生属性修正）。`setupEnemy` 分发 + `tools/_enemy_ep_smoke.js` 覆盖（deathrattle 召唤、元素损伤累积/爆发、凋亡降攻、护盾）。
- **延期（未接入、未瞎编）**：**变身/吞噬/光环（aura）** 及大量逐敌人特化机制（`reborn.*`、`aura.*`、`summon.*`、`devour.*` 等，enemy_database.json `talentBlackboard` 数百个唯一 key，多为 boss 专属状态机）。`tools/extract_enemy_abilities.js` 注释「召唤/变身等行为暂缓」；这些需要逐敌人客户端行为逆向，属「已证实存在但未接入」，不按名称启发式冒充 Verified。恢复时先按 key 聚类（aura/reborn/summon/devour）逐类接入，不重复定位字段。


### 敌人行为 U-SOURCES 核对（2026-09-05）

- **敌人数据**：`tools/extract_battle_data.py` 从 gamedata `levels/enemydata/enemy_database.json` 提取 2130 名敌人到 `battle_data.enemies`，字段含 `maxHp/atk/def/magicRes/moveSpeed/attackTime/massLevel/lifePointReduce/blockCnt/cost/rangeRadius/motion/flying`（`flying = motion==FLY 或 tags 含 drone`）。**Verified**（直接 gamedata）。
- **静止敌人**：`moveSpeed=0` 共 52 名（结晶/圣徒像/焦竭之火/年代印痕等），为正确静止目标，非「不动 bug」。
- **攻击状态机**（对应 `I-20260902-006`）：`engine.js` 敌人更新已实现「前摇 windup → 命中 strike → 后摇 recover」三段，动作期间锁定不移动，结束后恢复移动；近战被阻挡停住、远程攻击后继续走动（`I-20260901-028`/`I-20260902-015`）。新增 `tools/_enemy_behavior_smoke.js`（近战进前摇 + 锁定不移动 + 远程攻击后走动）验证。
- **复杂机制现状**：deathrattle（死亡召唤）、元素损伤（ep_attack/凋亡/灼燃）已实现（`tools/_enemy_ep_smoke.js`）；**变身/吞噬/光环**等更复杂机制未接入（`I-20260901-006`），转 `U-COMPLEX`。
- **资源**：敌人头像 `_enemy_avatar_smoke.js`（池 324、missing=0）；弹道仍为统一通用弹道（逐干员/敌人弹速未解包，见 findings 弹道节）。

## U-ITEMS 子系统数据基础（选方案2 先建子系统）

- **装置数据**（`tools/build_items.js` → `web/trap_data.json`）：`trapChessDataDict` 115 个（`chess_item_*`→`charId(trap_*)`/`purchasePrice`/`isGolden`/`upgradeChessId`/`trapDuration`/`effectId`）+ `trapShopChessDatas` 59 个商店装置（`itemType=EQUIP`）。
- **特殊装备事件数据**（→ `web/special_equip_events.json`）：`equips.json` 的 `use` 类 26 件，21 件含事件，**10 种事件 key**：`equip_destory_gain_random_coin`×4、`use_equip_reward_char_chess`×2、`equip_destory_deployment_cnt_change`×2、`use_equip_reward_special_goods_char_chess`×2、`use_equip_recruit_new_char_and_give_char_to_player_most_bond`×2、`use_equip_reward_char_chess_with_same_bond`×2、`use_equip_reward_random_char_chess_in_shop`×2、`use_equip_gain_coin_when_next_round_start`×2、`use_equip_reward_char_chess_bond_layer`×2、`use_equip_upgrade_char`×1。均含 blackboard。
- **装备事件分发计划**：`applySpecialEquipEvent(equip)` 按事件 key 分发；`use_equip_reward_*`/`equip_destory_*` 多数可复用 `grantBandOperator`（获得干员）/金币/层数组件；需在 UI 加「特殊装备点击使用 → 触发事件 + 销毁」交互（`equipInv` 中 `kind==='use'` 的装备）。
- **装备事件系统已实施（本轮）**：装备带 `kind`（`use`/`stat`）；`onEquipBenchClick` 对 `kind==='use'` 特殊装备调用 `useSpecialEquip`（`applySpecialEquipEvent` 分发 → 使用即销毁）。已实现事件：`equip_destory_gain_random_coin`（销毁得金币）、`use_equip_reward_char_chess`（获得干员）；其余 `use_equip_*`/`equip_destory_*` 事件框架已就位、标注待接入。`rewardSpecialEquip(count)` 从 `EQUIPS` 的 `use` 类随机加入库存（kind='use'），已接 `specialeq` 策略凯瑟琳（`upgradeShop` 升本加装备）、娜仁图亚（`applyBandOnRound` 每 n 回合加装备）。
- **特殊装备机制**：`effectBuffInfoDataDict` 中 `use_equip_*`/`equip_destory_*`/`bond_layer_added_reward_equip`/`global_special_choice_gain_equip` 等约 20 种（骑士储蓄罐/寻呼模块类，装备**使用/销毁/合层**触发事件）。
- **引擎缺口**：`web/engine.js` 有 `isDeployable`/`spawnEnemyAt`/`summon`，但**无「可部署装置单位」（`trap_*` 部署为棋盘单位，含阻挡/攻击/`trapDuration`）** 与 **「装备使用/销毁事件」系统**——需新增。
- **装置定位修正 = 效果装置，非 HP 单位**：`trap_*` 的 `charId` 不在 `enemy_database`/`battle_data.enemies`，因为它**不是战斗单位**，而是**部署后施加效果**的装置——效果由 `effectId`（如 `eff_acarm040`→`env_gbuff_new_with_verify`：全队 atk+5%/层，`atk_buff_cnt=10`）定义，`trapDuration=-1`（永久）。→ 无需 HP/atk/阻挡表；`web/trap_effects.json`（115 装置）中 **114 个效果是 `env_gbuff_new_with_verify`**，可直接复用 `applyBandStatBuff` 的属性 buff 解析；少量特殊效果（`trap_create_self_choice`/`trap_disney_special`/`trap_copy_front_char`）标注待接入。装置系统 = **部署装置到棋盘格 → 应用其 `env_gbuff` 效果**（引擎需加装置部署交互 + `B.traps` 单位）。
- **实施计划（U-ITEMS）**：①引擎加装置单位（`B.traps`，购买 `trap_data` 后部署到 `isDeployable` 格，行为用 `charId(trap_*)` 数据）；②装备事件系统（`buyShop`/`useEquip` 触发 `use_equip_*`/`equip_destory_*`，代入 blackboard）；③再回 `applyBandStrategy`/`applyBandOnRound` 用 `key` 分发批量接入依赖的 15 条策略（`gainchess` 装置/`specialeq`/寻呼模块等）。
- 三时点组件框架：`startRound`→`applyBandOnRound`（回合经济/获得）、`startBattleRound`→`applyBandStrategy`（盟约层数/一次性）、`resolveBoard`→`applyBandStatBuff`（属性 buff）。
- 剩余 28 条依赖簇：**`gainchess`×10（修正：标注 `type=equip` 的 `chess_item_*` 实为「装置」`trap_*`（`trapChessDataDict`，`equips.json` 无此 id），9 条是「获得装置」→ 依赖装置系统（`U-ITEMS`）；仅 `Pith`(char)/`老鲤`(pool→char) 为干员类，干员映射走 `charShopChessDatas[chess_char_*].charId`）**、`economy` 其余×6（资金结转/首购降价/刷新计数/买盟约棋，需商店/刷新/购买钩子）、`refresh`×3（特殊刷新，需 genShop/refreshShop 钩子）、`specialeq`×2（需 `U-ITEMS`）、`operator`×1（需 `U-OPERATOR`）、`enemy`×1（换敌人，需敌人系统）、`map`×1（换地图）、`sell`×1（卖棋换商店）、`bond`×2（盟约层数，可尝试）。依赖子系统的机制不臆造，待对应子系统或钩子接入后批量接入。

## 玩法数据补充（PRTS 卫戍协议·盟约 下半，2026-09）

> 来源：PRTS「卫戍协议：盟约 下半 作战环境&敌人一览表」。证据等级：PRTS 为社区 Wiki，其中「敌方属性加成情况」「隐秘核心触发条件」明确标注"由用户提供，PRTS 无法保证准确性"→ 记 [用户报告/Inferred]；难度 5 档、策略一览、等阶养成、干员名单与 gamedata 交叉印证较可靠，精确数值仍需 gamedata 核对后升级 Verified。

### 已接入（本轮）
- **难度模式 5 档**（`web/mode.js` `DIFFICULTY`）：入门协议/标准模拟/险境模拟/绝境模拟/终极模拟，替换此前自创 3 档（normal/hard/extreme）。
- **敌人每轮攻/血加成表**（独立模拟列）：`genWaves` 按 `DIFFICULTY[diff].mul(round)` 缩放敌人 atk/hp（boss 同表）。标准全程 ×0.7；险境 ×0.7·1.2^n；绝境 ×0.8·1.2^n；终极 1.2^n（n 按轮次分档）。atk 与 hp 同表同值；防御无官方数据保留自创线性。
- **我方生命与难度解耦**：我方生命仅由策略「我方生命值」（`band_data.血量`）决定，难度不再降低我方生命（修正此前 DIFF lifeMul 错误）。
- **模式数据（gamedata `modeDataDict`，Verified）**：已提取 9 个模式（`mode_{single|multi}_{funny|normal|hard|abyss}` + `mode_training_1`）到 `mode_data.modes`，含每模式的 `activeBondIdList`/`inactiveBondIdList`/`inactiveEnemyKey`/`specialPhaseTime`。**本轮接入**：①盟约栏按当前难度 `activeBondIdList` 过滤（标准 13/23 盟约可用）；②`genWaves` 排除当前难度 `inactiveEnemyKey`（禁用敌人）。**难度命名映射**：FUNNY=标准、NORMAL=险境、HARD=绝境、ABYSS=终极（`modeDataDict.modeDifficulty`）。同时已提取 `difficultyFactorInfo`（FUNNY1/NORMAL1.6/HARD1.7/ABYSS1.7）与 `modeFactorInfo`（SINGLE/MULTI=1.25），**语义待确认后接入**（当前敌人倍率仍用 PRTS 表）。

### 待接入（空缺，PRTS 资料已明确）
- **联机方式**：已接入独立/同盟选择（`MATCH`+`match-select`）；敌人基础倍率独立 ×0.7、同盟 ×0.8。同盟的 4 人联防/表情/成就奖杯未复现（单人），同盟敌人指数表用独立指数近似（PRTS 同盟有独立指数表 + 终极 ×1.08 修正，未精确）。
- **决策机制**：已接入（`DECISION_ROUNDS`+`showDecision`/`applyDecision`）；独立 3选1、同盟 6选1；三类：悬赏（额外敌人+资金）/道具补给（得装备）/战术决策（资金+削弱敌人）。**决策轮次（PRTS「盟约 下半」Verified）**：独立=标准不提供(模拟9轮)/险境[5,8]/绝境[3,8,10]/终极[2,8,10]；同盟=标准[2,8](无悬赏)/险境[2,5,8]/绝境[2,8,10]/终极[2,8,10]。标准模式已按 PRTS 排除「悬赏」选项（`decisionOptions`）。
- **等阶养成精确表**：Ⅰ~Ⅵ 阶等级/技能/模组已记 `TIER_TRAIN`（PRTS 表）。**详情页等级/技能等级已改用 `TIER_TRAIN`**（与干员库练度无关）；战斗属性仍用 `TIER_MULT×精锐` + `selfHoldMult` 自持有加成（精一 +5%攻/防，精二 +10%攻 +5%防 +5%血，精二满级≥60 +10%攻 +10%防 +10%血）。
- **干员名单**：已接入开局简报「参战干员名单」区块——按等阶分组，特许（4/5★，绿标）直接可用、原型（6★，金标）需补位。「活动赠送 6★ 特许」与「原型干员=领主」的具体 charId 名单未定位（待 gamedata/客户端核实）。
- **策略解锁条件**：`band_data` 有血量/效果，缺「解锁条件」字段（如"通关标准模拟后解锁"），进度系统未做。
- **简报**：领袖+特训敌人+可用盟约+缺席+禁用干员——`showSetup` 已有领袖/特训，盟约缺席/禁用未完整。
- **隐秘核心**：已接入（`canEnterSecretCore`/`nextRound`/`genWaves` coreMul ×2.5）；险境+第 14 轮领袖通关后，独立 盟约总层数>350 且生命>1（同盟 >1200）→ 进入第 15 轮「??」（敌人增强，失败不判负）。
- **成就奖杯**：同盟模拟结算按通过回合数给奖杯。

### 具体表（摘录，供后续实现）
- 等阶养成：Ⅰ Lv.55→精锐 Lv.50 / Ⅱ Lv.60→Lv.55 / Ⅲ~Ⅴ Lv.1→Lv.60 / Ⅵ Lv.1→Lv.60；技能 Rank4→Rank7；模组 Stg.1（Ⅵ Stg.3）；信赖 0%。
- 自持有加成：精一 +5%攻/+5%防；精二 +10%攻/+5%防/+5%血（取满足条件最高值）。
- 终极模拟第 3 轮起全体敌人移速 115%。

### 图标资源（盟约/道具）已从 PRTS media 下载（2026-09）
- 此前误判「盟约图标素材缺失（autochesscommon bundle 不在解包目录）」。实际 PRTS media 可获取：盟约图标 23 个（`卫戍协议：盟约_icon_<bondId>.png`）、道具图标 102 个（`卫戍协议_道具_<name>.png`），经 MediaWiki API `allimages` 检索并下载。
- 工具：`tools/download_prts_icons.js`（node fetch + 重试/限速延迟）。产出 `web/bond_avatars/icon_*.png`（23）、`web/equip_icons/*.png`（102）。
- 接入：开局简报盟约 cell 用 `<img bond_avatars/icon_<bondId>.png>`；商店装备卡用 `<img equip_icons/<装备名>.png>`（onerror 回退程序化 SVG/首字兜底）。
- 经验：PRTS media 的卫戍协议图标（盟约/道具/职业/策略头像）均可按 MediaWiki `allimages` API 检索下载，不应因「客户端 bundle 未解包」就判定素材缺失。

