# 卫戍协议 玩法说明与数据地图

> 来源：官方客户端教学文案（`gamedata/story/activities/act1vautochess/guide/*.txt`）+ `玩法简介.txt`。
> 内部代号 `autoChess`（自走棋）。官方活动（`activity.AUTOCHESS_SEASON`/`versionInfoDict`，gamedata）为 `act1autochess`（V1，seasonName「盟约」）与 `act2autochess`（V2，seasonName「盟约」）；`act1vautochess` 不在官方赛季列表（`[Inferred]`，见 `docs/data-inventory.md` 0 节）。当前可玩关由 `mode.js` `COVENANT_KINDS` 过滤为 `act1autochess`(covenant)/`act2autochess`(covenant2)。

## 〇、地图分区与阶段/半区模型（U-MODEL）

> 证据等级：关卡网格/分区为 **Verified**（gamedata `levels/activities/*/level_*.json` + `web/battle_levels.json`）；窗口、半区、镜头、出怪交互为 **Inferred**（现有 `mode.js`/`engine.js` 实现 + 用户规格，未逐项做客户端对照），不把交互推测当确定规则。

- **关卡网格**（Verified）：当前可玩关为 `covenant`（act1autochess）/`covenant2`（act2autochess），**19 行 × 21 列**；`v1`（act1vautochess）为 8×32，不参与当前玩法（`COVENANT_KINDS=['covenant','covenant2']` 过滤）。候选区由 `tile_achand` 网格承载，位于行 10,11（B 区底）与 17,18（C 区底）。
- **纵向三段**（Verified，`engine.js` `modeBattleSections`/`modeBattleZoneRows`；整行 `tile_forbidden`/`tile_wall` 作分隔，对半区宽度 `colsW` 判定）：
  - **A 区（上，怪物预览）**：约行 0–4（5 行），含 `tile_start`（预览出怪），供策略阶段放大镜预览下一轮怪。
  - **B 区（中，普通/联防战场）**：约行 6–11（战场行 6–9 含 `tile_start`/`tile_end`/`tile_road`，候选区 `tile_achand` 行 10–11）；单人默认在此。
  - **C 区（下，14–15 boss）**：约行 13–18（含 `tile_end`、候选区 `tile_achand` 行 17–18）；boss 战在此。
- **单机作战窗口**（Inferred，`fitGoal`）：**13 宽 × 7 高**，居中、高度占满；`rowTop=max(0,lb-1)`（顶部含块顶上一空行）、`rowBot=rb`（底端含候选区并贴商店顶）。
- **半区与总览**（Inferred）：`viewMode` 0=左半（最左 13 列）、1=右半（最右 13 列）、2=全图总览（横向全宽 `colsW`）；左/右半平移矩阵互为镜像；局部↔总览用缩放过渡。
- **出怪半区**（Inferred，`genWaves`）：非联防单人只用左半区红门路线（路线起点列 `< ceil(cols/2)`）；联防按规则拼接；boss 关（回合>13，`NORMAL_ROUNDS=13`）出怪落 C 区。
- **阶段归属**（Inferred）：普通关（1–13）准备/战斗/联防均在 B 区；boss 关（14–15）准备/战斗在 C 区，boss 无联防阶段。
- **镜头变换**（Inferred，`fitGoal`/`CAM_BASE`）：纯平移+缩放，默认俯视（`CAM_BASE.pitch≈-20°`），无朝向旋转；`?view=0|1|2`/`?preview`/`?boss` debug 入口切换视图（`engine.js`）。

## 一、玩法本质

自走棋式运营 + 自动塔防 + 阵营/职业盟约 + 多回合生存，最终领袖战。多人（1~4 人）带「联防」。

## 二、核心循环（每回合）

1. 补给驳船送资金 → 花资金采购
2. 招募干员（通常 3 资金/名）、刷新商店、升级驳船（调度中心）、买装备
3. 拖拽部署干员、穿戴装备（每名干员最多 2 件，锁定不可卸）
4. 3 名同名干员自动合成为「精锐」（金色），装备返还手牌，奖励「晋升调配特许」
5. 开战：舰船生成护盾，护盾≠0 即胜；胜利按「剩余护盾 + 上阵数」对敌方 HP 造成伤害
6. 回合结束：未用完资金清零（不继承），下回合资金更多

## 三、关键机制

- 干员阶级 Ⅰ~Ⅵ 阶（5~6 阶由 ★6 组成）；高阶干员需更高驳船等级才进补给池
- 驳船升级费每回合递减
- 甄选干员：5~6 阶各 2 个名额（仅 ★6）
- 原型干员 / 好友助战补位（助战上限 20）
- 装备：2 件相同装备可合并升级
- 策略（cbuff）：特定回合选择，选后不可改
- 胜利目标：将两个敌方势力的 HP 全部降为 0
- 敌人从上下两个甲板入口进攻，敌我 HP 实时显示

## 四、数据地图（Kengxxiao/ArknightsGameData · zh_CN）

- `excel/activity_table.json`：`basicInfo` / `activity` / `activityItems` 含三个赛季；`activity` 类型含 `AUTOCHESS_SEASON`；另有 `autoChessData` 段存模式专属配置，子键包括：
  - `bandDataDict`（开局策略/阵营）、`bondInfoDict`（20 个盟约）、`bossInfoDict`（10 个领袖/BOSS）、`enemyTypeDatas`（特训敌人 7 类：SPECIAL/FLY/TIMES/ELEMENT/DOT/INVISIBLE/REFLECTION）、`effectTypeDataDict`（效果类型，含 BOND/EQUIP/MAGIC/GARRISON）、`constData`、`shopStateTokenDict` 等
- `levels/activities/{act1autochess,act1vautochess,act2autochess}/*.json`：回合/关卡定义（`options`、`mapData`、`runes`、`globalBuffs`、`routes`、`enemies`、`waves`、`operaConfig` 等）
- `levels/activities/act1autochess/level_autochess_enemy_data.json`：敌人数据
- `story/activities/*/guide/*.txt`：官方教学文案（基本玩法说明）
- `[uc]lua/hotfixes/AutoChess*.lua`：模式热修补丁（核心逻辑在 `libil2cpp.so` 内）

## 五、对私服的启示

- 客户端（`libil2cpp.so`）已内置模式全部规则，Lua 仅热修；私服只需下发上述数据 + 正确应答
- 战斗自动结算，可信任客户端；服务器需做账号/进度/经济存续 + 多人房间/联防中转