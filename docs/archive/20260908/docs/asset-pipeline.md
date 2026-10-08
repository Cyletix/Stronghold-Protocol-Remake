# 官方 OBB 资产生产流程（可复现溯源）

> 目的：让**无上下文的后来者**能回答「哪个文件干什么、怎么来的、怎么重新生成」。
> 前提：本仓库已打通 OBB 解包（`codec=4/5 = LZ4 字节序变种，非 LZHAM`），核心入口 `tools/decompress_ab.py`。

## 0. 前置依赖

| 依赖 | 说明 |
|---|---|
| `work/main.obb` | 官方 OBB 包（1.83GB ZIP，2617 个 `.ab`），本地已有 |
| Python 3.12 | 运行所有 `tools/*.py` |
| pip 包 | `UnityPy`（解析 SerializedFile）、`lz4`（解 BlocksInfo/LZ4）、`Pillow`（PNG 编码） |

## 1. 生产链路总览

```
work/main.obb (ZIP)
  → tools/decompress_ab.py  parse_ab()      # UnityFS v8 header + LZ4HC 解 BlocksInfo
  → data block codec=4/5 = LZ4 字节序变种    # token 高低4位交换 + offset 大小端交换
  → SerializedFile + resS
  → UnityPy 枚举 Objects
  → 导出 PNG / TextAsset
```

解包算法出处：MooncellWiki/UnityPy commit 781badde6d636（Kengxxiao），与 UnityPy issue #308 对应。

## 2. 每步生产命令（按依赖顺序，可直接复制运行）

### 2.1 资产索引 SQLite

产出：`work/inventory.sqlite`（2617 bundle / 152 万对象，含分类视图）。

```bash
python tools/build_inventory.py        # 全量，约 5-10 分钟
python tools/build_inventory.py 20     # 前 20 个（快速测试）
```

**`inventory.sqlite` 没了怎么办**：跑上面命令即可重建，不依赖任何其他产物。
（历史快照 `work/inventory.json` 如需 → 用 `tools/inventory_to_sqlite.py` 迁移回 SQLite。）

### 2.2 各 PNG 资产目录（从 OBB 直接导出，互不依赖）

| 产出目录 | 生成命令 | 源 bundle |
|---|---|---|
| `web/assets/profession_icons/` | `python tools/export_profession_icons.py`（26×26）<br>`python tools/export_profession_variants.py`（256×256 → `work/export/profession_large/`）<br>再把 `work/export/profession_large/*.png` 复制进 `web/assets/profession_icons/` | `profession_icons_hub.ab` / `profession_large_hub.ab` |
| `web/ui/skillicons/` | `python tools/export_skill_icons.py`<br>（`skcom_*` 通用图标再生成去 `[n]` 别名：`skill_icon_skcom_x[n].png` → `skill_icon_skcom_x.png`） | `spritepack/skill_icons_0~3.ab` |
| `web/ui/autochess/` | `python tools/export_autochess.py` | `activity/commonassets.ab` / `[uc]battlecommon.ab` / `emoticon_autochess_basic.ab` |
| `web/enemy_avatars/`（OBB 部分） | `python tools/export_enemy_icons.py` | `spritepack/icon_enemies_0~5.ab` |

### 2.3 定向导出单个资源

```bash
python tools/export_asset.py --bundle <xxx.ab> --path-id <id>   # 按 path_id
python tools/export_asset.py --bundle <xxx.ab> --name <名>       # 按名称模糊
python tools/export_asset.py --name <名> --type TextAsset        # TextAsset
```

## 3. 产出物清单（干什么 / 怎么来 / 怎么重生成）

### 3.1 资产索引
| 文件 | 用途 | 重生成 |
|---|---|---|
| `work/inventory.sqlite` | 全量资产索引（供 `search_assets.py` 查询） | `python tools/build_inventory.py` |

### 3.2 已接入 UI 的 OBB 资产
| 文件 | 用途（consumer） | 重生成 |
|---|---|---|
| `web/assets/profession_icons/*.png`（256×256 高清） | 职业图标，`mode.js` `PROF_ICON` | 见 2.2 第 1 行 |
| `web/ui/skillicons/*.png`（1483 个 128×128） | 技能图标，`mode.js` `realIcon`（92% 命中） | 见 2.2 第 2 行 |
| `web/ui/autochess/*.png`（13 个） | 段位/棋子/表情，`mode.js` `od-tiericon` | 见 2.2 第 3 行 |
| `web/enemy_avatars/*.png`（OBB 补 1229 个） | 敌人头像，`engine.js` `getEnemyAvatar` | 见 2.2 第 4 行 |

### 3.3 备源（已确认、未接入）
| 资产 | 位置 | 结论 |
|---|---|---|
| 干员立绘 | `spritepack/char_portrait_0~13.ab`（180×360） | PRTS 已齐全，备源 |
| 动态头像 | `arts/dynavatars_0.ab` | 备源 |
| 3D 地图地面贴图 | `maps/*/res.ab`（TX_*_Ground_*） | 不适用 2D tile |
| 盟约图标 `icon_*Ship` | OBB 0 命中 | 需 FairyGUI fui/atlas 或 PRTS |
| 卫戍协议规则/地图配置 | 不在 OBB TextAsset | 在 gamedata `autoChessData` |

## 4. 查询工具

```bash
python tools/search_assets.py skill --kind image          # 技能图标
python tools/search_assets.py profession --kind image     # 职业图标
python tools/search_assets.py --kind text                 # TextAsset
python tools/search_assets.py --type Texture2D --min-width 512 --min-height 512
```

## 5. 已知边界（复现时须知）

- `inventory.sqlite` 重建需完整 `main.obb`，约 5-10 分钟（CPU 密集）。
- 技能图标有 8%（34 个干员技能1）OBB 无对应图标（用通用 `skcom_*` 但 OBB 缺），`onerror` 回退不显示。
- 盟约图标（`icon_*Ship`）在 OBB **0 命中**，当前盟约栏用 `bond_avatars/icon_*.png`（PRTS），非 OBB。
