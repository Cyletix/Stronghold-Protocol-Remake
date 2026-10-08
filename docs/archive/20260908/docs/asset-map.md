# 官方 OBB 资产地图（asset map）

> 数据源：`work/inventory.sqlite`（2617 bundle / 1527506 Unity 对象）。
> 方法：SQLite 语义聚类（不重新扫描 OBB），工具 `tools/asset_survey.py`、`tools/survey_detail.py`、`tools/search_assets.py`。
> 目的：回答「官方包里到底有哪些对卫戍协议复刻有价值的资产，分别在哪」。

---

## 1. 职业图标（6 个 variant，重点）

| bundle | Sprite 数 | 尺寸 | 说明 |
|---|---|---|---|
| `profession_icons_hub.ab` | 8 | 26×26 | 已导出（`web/assets/profession_icons/`） |
| `profession_icons_v2_hub.ab` | 9 | 26×26 | 多一个 `icon_profession_token` |
| `profession_hub.ab` | 16 | 42×42 / 200×100 | `icon_*` + `icon_profession_*` 两套 |
| **`profession_large_hub.ab`** | 16 | **108×109 / 255×256 / 256×256** | **高清大图标**，含 `_large` + `_large_white` 两版 |
| **`profession_no_shadow_hub.ab`** | 8 | **74×76** | 无阴影中等尺寸 |
| `friend_assist_profession_hub.ab` | 8 | 42×42 | 助战用 |

路径前缀：`assets/AB/Android/arts/misc/`（icons/v2）、`arts/`（hub/large/no_shadow）、`arts/friend_assist_*`。

**→ 建议**：UI 用 `profession_large_hub.ab`（256×256）或 `profession_no_shadow_hub.ab`（74×76）替代当前 26×26。

---

## 2. 技能图标（干员技能图标，价值高）

- **`spritepack/skill_icons_0.ab`、`skill_icons_1.ab`**：`skill_icon_skchr_{干员}_1/2/3`，**128×128**。
- `[%skill_icon%]` 共命中 **2968** 个 Sprite（含 `lock_skill_icon` 等通用件）。
- 命名模式清晰：`skill_icon_skchr_amiya_1`（阿米娅技能1）、`skchr_excu_2`（陈技能2）…，可直接按 `skill_table.iconId` 接入干员技能面板。
- 另有 `skill_icon_sktok_bondtw`（128×128，盟约技能，`skill_icons_1.ab`）。

**→ 建议**：这是此前「技能图标图集名→矩形」未解问题的替代路径——官方包里有**独立 128×128 单图标**，无需从 atlas 切图。

---

## 3. 卫戍协议（autoChess）专属素材

| 名称 | 类型/尺寸 | bundle |
|---|---|---|
| `act1vautochess_token_chess` | Sprite 180×180 | `activity/commonassets.ab` |
| `autochess_level_1~6` | Sprite 42×42 | `arts/ui/[uc]battlecommon.ab` |
| `deco_chess` | Sprite 60×102 | `arts/ui/hometheme/[uc]tm_avemujica_1.ab` |
| `bg1_chess_black/white` | Sprite 33×33 | `ui/gacha/limited_jp_40_0_4.ab` |

- **盟约（bond）**：`skill_icon_sktok_bondtw`（128×128）、`trap_423_bondtw`（180×180）、`bond.ab` 里 `bond_laterano_reload_01` 等、`trap.ab` 里 `bondtw_01/02`。
- 注意：关键词 `covenant` 在 OBB 内 **0 命中**——卫戍协议「盟约」资源用 `bond`/`chess` 命名，而非 `covenant`。

**→ 建议**：`act1vautochess_token_chess` 是模式专属棋子 token，`autochess_level_*` 是段位/关卡等级图标，可直接用于卫戍协议 UI。

---

## 4. 角色立绘 / 头像

- **`arts/charportraits/portraits_hub.ab`**：`char_XXX_YYY` 立绘（`char_002_amiya_epoque`、`char_510_amedic_1` …）。
- **`spritepack/char_portrait_0.ab`、`char_portrait_1.ab`**：立绘图集。
- **`arts/dynavatars_0.ab`**：动态头像（`assets_avatar_dyn_*`，452~500×272~372）。
- `avatar_special_amiya`（180×180，`mailsender.ab`）等散落头像。

**→ 建议**：立绘已用 PRTS 下载 115/115，官方 OBB 立绘可作备源；动态头像/特殊头像可补 PRTS 缺失项。

---

## 5. 敌人

- **`arts/enemies/ahub_enemy_icons.ab`**：敌人图标。
- `enemy` 词族 168 bundle / 232314 对象，但大量是 Mesh/Particle/Animator（敌人模型/特效），真正图标在 `ahub_enemy_icons` + `enemy_XXXX_*` 命名的 Sprite。
- `enemy` 相关 TextAsset **3114** 个（敌人配置/预制参数，价值高）。

**→ 建议**：敌人头像/图标从 `ahub_enemy_icons.ab` 定向导出，替代 PRTS 缺失的 6/14。

---

## 6. 地图 / 地形

- `map` 词族 417 bundle / 166346 对象：`maps/` 下 mesh（16k+）、texture、material、特效。
- `tile` 词族 61 bundle：`TileSelector`、`tile`、`TraceTile` 等（网格/地块选择器）。
- `dungeon` 词族 15 bundle：`tm_dungeon_1`（TextAsset JSON）、`bg_dungeon_1` 等。

**→ 建议**：地形贴图之前靠 ArknightR 一次性兜底（仅 stone_000），官方 `maps/` 有完整 mesh/texture，可补战场地形。

---

## 7. UI 组件

- `ui` 词族 916 bundle / 247013 对象：Sprite 12832 + Texture2D 13710。
- 关键 bundle：`arts/ui/[uc]battlecommon.ab`、`[uc]charcommon.ab`、`[uc]campaign.ab`、`activity/commonassets.ab`。
- 通用件：`btn_*`（confirm/cancel/back/stage_main…）、`icon_*`、`img_bkg`、`panel_*`、`sprite_white`。

---

## 8. TextAsset 配置（复刻价值可能最高）

- `TextAsset` 共 **4086** 个（60 bundle）。
- 已成功导出 `tm_dungeon_1`（12767 字节 JSON 主题配置）。
- 敌人 TextAsset 3114 个、campaign 相关 1064 MonoBehaviour 等，可能含地图参数、关卡布局、UI 配置、资源映射。

**→ 建议**：重点查 `campaign`/`autochess`/`chess`/`dungeon`/`map` 的 TextAsset，判断是否存在此前缺失的卫戍协议规则/地图/UI 配置数据。

---

## 下一步（定向导出优先级，不批量全导）

## 落地状态（阶段 F，已全部完成，见 `TASKPLAN.md`）

1. ✅ **职业图标高清**：`profession_large_hub.ab`（256×256）+ `profession_no_shadow_hub.ab`（74×76）已导出，256×256 接入 UI。
2. ✅ **技能图标**：`skill_icons_0~3.ab` 1483 个 128×128 独立图标，92%（393/427）接入干员技能面板。
3. ✅ **卫戍协议专属**：`act1vautochess_token_chess`、`autochess_level_1~6`、`pic_*_battle` 13 个导出，段位图标接入。⚠️ 盟约图标 `icon_*Ship` OBB 0 命中，需 fui/atlas 或 PRTS。
4. ✅ **敌人图标**：`icon_enemies_0~5.ab` 1597 个，补 1229 个 PRTS 缺失（含假想敌）。
5. ✅ **TextAsset**：确认卫戍协议规则/地图配置不在 OBB（在 gamedata `autoChessData`）。
6. ✅ **角色立绘/地图地形**：备源确认（PRTS 已齐全 / 卫戍协议 2D tile 未找到，维持兜底）。
