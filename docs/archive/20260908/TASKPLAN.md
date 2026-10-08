# 卫戍协议复刻 · 任务计划 / TODO 维护

> 历史计划：本文仅供定位旧实现和既有验证记录；当前任务状态与执行顺序以 `assets/task/T-*.md` 为准。
> 状态取值：`[ ]` 待办 / `[~]` 进行中 / `[x]` 已完成 / `[!]` 阻塞。优先级 P0(阻断玩法)/P1(重要)/P2(打磨)。
> **历史目标：全量还原** —— 干员技能/装备/天赋/敌人技能均接真实 gamedata（用户已确认，周期长）。

---

## 0. 数据管线（现状）
```
官方 gamedata JSON  (data/ArknightsGameData/zh_CN/gamedata/)
   │  tools/extract_*.py + fix_routes.py
   ▼
web/*.json  (battle_data / mode_data / range_data / level_data / operator_tiers / band_data ...)
   │  engine.js / mode.js 加载
   ▼
浏览器渲染与战斗
```
- 数据源性质：**官方解包导出的 gamedata JSON**（`excel/` 54 张表 + `levels/`），非第三方开源库。
- `tools/` 里另有 AB/il2cpp 反编译脚本（`decrypt_meta_try.py`、`test_unitypy.py`、`test_libil2cpp.py`）与图集抽取（`extract_ui_atlas.py`、`split_ui_atlas.py`）。

---

## 1. 与真实玩法的差距（现状 vs 目标）
| # | 现状 | 真实卫戍协议/明日方舟 | 根因 |
|---|------|---------------------|------|
| 1 | 怪物只在地图上直线走 | 沿 `tile_road` 路线、尊重传送/停留/消失 | `fix_routes.py` 把 `APPEAR_AT_POS` 当行走点、漏 `WAIT/DISAPPEAR` |
| 2 | 怪物不从红门出生 | 从 `tile_start`(红)出生、到 `tile_end`(蓝)漏怪 | route 起点/终点取错（`[6,13]`/`[2,4]`，非红/蓝门） |
| 3 | 怪物不会攻击干员 | 用攻击范围扫描，命中即停下攻击 | `engine.update` 只在「被阻挡」时才攻击，无 `rangeRadius` 换算 |
| 4 | 无怪物投射物 | 远程怪物有弹道 | 只有干员攻击有 `B.projectiles` |
| 5 | 飞行单位≠飞行 | 飞行怪走 FLY-only、不被地面阻挡 | 未提取 `enemy_database.motion`(WALK/FLY) |
| 6 | 地图语义不明（紫块） | 紫=传送 in/out、红=出生、蓝=漏怪 | 地块渲染只认 `tileKey`，没讲清楚紫块；说明文案缺失 |
| 7 | 干员范围/技能简化 | 用 `range_table` 精确范围、`skill_table` 技能 | 未接 `range_table`/`skill_table` |

---

## 2. 任务列表

### 阶段 A：数据提取(先做，阻断一切玩法保真)
- [x] **A1** 敌人基础属性补全（P0）：已提取 `motion`(→`flying`)、`rangeRadius`(→攻击范围)、`blockCnt`、`cost`、`massLevel`、`lifePointReduce`。天赋/技能归 **A10**。验收：`enemy_1005_yokai.flying==true`、`enemy_1427_lrnazg.rangeRadius==1.3` 已验证。
- [ ] **A2** 飞行标记权威来源（P0）：从 `enemy_handbook_table.json` abilityList「飞行单位」校验 `motion`；写进 `web/enemies`。
- [x] **A3** 干员攻击范围（P1）：已接 `range_table.json` → `range_data.json`（`character_table.phases[i].rangeId` → `range_table.grids`，按精英化 0/1/2 分阶段）。`buildRoster` 写 `rangePhases`+`rangeGrids`，`entryRangeGrids` 按账号精英化取阶段，`boardView`/`boardView` 落 `rangeGrids`，`engine.rangeCellsFor` 按朝向展开为绝对格子，战斗 `o.cells` 与展示 `rangeGridHtml` 均用真实范围。验收：跃跃(char_4100_caper) 精0/1/2=12/15/15；`rangeCellsFor` 朝向右/左/上/下均正确；战斗射程格命中、射程外不命中（`_tmp_a3.js`/`_tmp_a3b.js`）。**遗留**：`finalizeOperator` 的数值 `range`（`RANGED?3:1`）仅为无 rangeGrids 时的兜底，现全部干员皆有 rangeGrids，属死代码。
- [x] **A4** 关卡/地块补全（P0）：已提取 `tiles[].passableMask`(→`level.passable`)、`heightType`(→`level.height`)、完整 `buildableType`。验收：`passable[2]==['FLY_ONLY','FLY_ONLY','ALL',...]` 已验证。
- [x] **A5** 路线与寻路（P0）：重写 `fix_routes.py` —— 解析 `MOVE/WAIT_FOR_SECONDS/DISAPPEAR/APPEAR_AT_POS` 为**分段**；每段内用**四邻接 BFS 沿可通行格**展开成正交路线（依据 `passableMask`：WALK 走 `ALL/WALK_ONLY`、FLY 走 `ALL/FLY_ONLY`），不再斜穿地形；分段处仍为传送。出生/漏怪取关卡数据 `startPosition/endPosition`（**撤回门吸附**，因条带间仅靠传送连通、吸附会强行斜连）。`engine.js` 出生/分段移动/停留/传送/漏怪/分段渲染接入。验收：`diagJumps=0`、端到端模拟 5 条均漏怪、`node --check` OK。
- [x] **A6** 关卡选择（P1）：新增 `tools/build_levels.js`（Node 版多关卡生成器，复用 `battle_data.json` 的 operators/enemies + fix_routes 的 BFS 路线 segs），输出 `web/battle_levels.json`（当前 3 关：教学关/前线/正规军，均 9×14、routes 5/12/13、waves 5/12/13，敌人可沿路线到终点）。引擎新增 `setLevel({enemies,level})` 切图；mode.js `LEVELS/CUR` + `selectLevel(i)` + `showStages()` 列表；`initMode`/`buildRoster` 改用 BATTLE(operators/enemies)。验收：`node tools/build_levels.js` 生成 3 关、`_tmp_levels.js` 全关可跑、`selectLevel` 切换 `BDATA.level.levelId`。
- [x] **A7** 干员技能（P1，**已落地：数据提取+展示**）：新增 `tools/extract_skills.js` —— `battle_data.json.operators × character_table.skills[0].skillId × skill_table.levels[0]` 提取真实技能，`{key}` 占位符按 blackboard 值替换（富文本 `<@ba.vup>` 等标记保留），输出 `web/skill_data.json`（**454 干员 → 433 有真实技能**，21 无技能回退职业模板）。`finalizeOperator` 的 `skill` 增加真实字段 `realName/realDesc/realRangeId/realSpCost/realInitSp/realMaxCharge/realDuration/realType/realDurationType`（保留职业模板 type 供战斗），展示层（`opDetailTabBody` 技能 Tab + `renderSelected`）优先显示真实技能名/描述/技力（富文本高亮）。验证：`tools/_a7_smoke.js`（A7 SMOKE OK，115 干员全带真实技能，技能Tab 富文本无残留标记，样例「战术咏唱·β型 sp=45 MANUAL」贴合原版）。**遗留**：战斗释放（B5）仍用职业模板 `type`，`realRangeId` 尚未接入技能释放范围。验收：`node --check`、`_smoke.js`/`_ui_smoke.js`/`_rich_smoke.js`/`_a7_smoke.js` 均 OK。
- [ ] **A8** 干员天赋/特性（P2）：接 `character_table.json` 的 `talents`/`trait`（含 `blackboard` 数值），产出天赋数据。
- [ ] **A9** 装备/模组（P2）：接 `battle_equip_table.json` + `uniequip_table.json`，产出真实装备（图标/属性/描述），替换当前 `kit` 简化装备。
- [ ] **A10** 敌人天赋/技能（P1）：接 `enemy_database` 的 `talentBlackboard`/`skills`，产出敌人能力数据（飞行/自爆/召唤/减速等）。

### 阶段 B：引擎战斗（engine.update）
- [~] **B1** 怪物攻击逻辑（P0）：`engine.update` 已加**远程攻击**分支——`rangeRadius>0` 的敌人扫描攻击范围内干员（格中心距 ≤ rangeRadius+0.5），命中即停下按 `attackTime` 直伤并打粒子；无目标再走原近战/移动。验收：`enemy_1427_lrnazg(rangeRadius=1.3)` 放置干员后停下射击、未漏怪（`_tmp_b1.js` 验证 4000→1450）。**遗留**：近战(半径=-1)仍只在「被地面阻挡位(blockCnt>0)干员」接触时攻击，对 `blockCnt=0` 的干员接触不反击（需 B1 延伸或并入 B2）。
- [x] **B2** 怪物投射物（P1）：`engine.js` 远程敌人(B1)改为**发射弹道**（`B.projectiles.push({...,enemy:true,...})`，`speed:6`），飞行命中后结算伤害；投影物 update 支持**干员目标**（用 `col/row` 追踪、命中 `tryKill` 走不屈/复活）；渲染敌方弹道红色、我方灰色。验收：远程敌人停射、`enemy:true` 弹道命中干员(8000→7150)。**遗留**：敌方投射物不可被「闪避/格挡」等交互（纯命中判定）。
- [~] **B3** 飞行单位（P0）：已修复「飞机原地发呆」——`update()` 里 `if(e.flying)continue` 原本跳到移动前，现改为「飞行单位跳过地面阻挡但仍沿路线移动」。验收：飞行怪不再原地不动、不被地面干员阻挡。**遗留**：飞行/地面路线分离（FLY 只走 FLY_ONLY、地面走 WALK/ALL）尚未完全按 `passableMask` 区分（当前飞、地共用同一套 lanes）。
- [~] **B4** 出生/漏怪语义（P0）：已修复「凭空出现」——`update()` 出生点吸附到最近红门 `nearestSpawnCell(tile_start)`，敌人在红门出现并从红门走向路线首点。`tile_end` 漏怪扣血仍生效。**遗留**：route0-3 起点原为禁格/FLY_ONLY 高台，非红门；`telin/telout` 传送拓扑仍需按地图门位校准（当前为吸附到红门 + 分段接力）。
- [ ] **B5** 干员技能释放（P1）：按 `A7` 技能数据接 range/倍率/技力/冷却进入战斗（替换当前模板技能）。
- [ ] **B6** 干员天赋/特性作用（P2）：按 `A8` 天赋在战斗中生效（数值加成/触发条件）。
- [ ] **B7** 敌人技能/天赋作用（P1）：按 `A10` 在战斗中触发（召唤、自爆、减速、飞行等）。
- [ ] **B8** 装备加成生效（P2）：按 `A9` 装备修正干员面板并体现在面板/战斗。（未完）
- [x] **B9** 自身格交锋攻击（P0）：`update()` 攻击目标判定 —— 依据「**攻击范围是否含干员自己所在格**」，自身格上的交锋（接触/被阻挡、距离≤`0.5+eR`）计入攻击范围（**无论朝向、无论近战/远程**）；其它攻击范围格 `o.cells` 仍按格子判定；接触判定不打飞行单位。验收：逻辑测试 `melee/ranged+背身接触=true`、`飞行/远处=false`，`node --check` OK。
- [x] **B10** 回合计时（P0）：`engine.js` 加 `ROUND_LIMIT=60`，`update()` 累加 `B.roundTime`；超时未清场则**剩余存活怪物按数量直接扣血**（每只按 `lifePointReduce` `leak`）后判定回合失败并 `onBattleEnd(false, B.shield)`；`render()` 在画布顶部绘制倒计时（≤10s 变红）。`startBattle` 初始化 `roundTime:0`。验收：`node --check`、`node tools/_smoke.js` SMOKE OK。
- [~] **B11** 盟约/技能实测（P1）：`mode.js` 已实现 `BOND_DEFS`/`computeBonds`/`applyBondMods`/`resolveBoard`（激活=成员数≥`need`，效果见 `BOND_EFFECT_TXT`），并经 `resolveBoard`→`finalizeOperator` 应用到战斗干员；技能（`castSkill` 的 burst_damage/aoe_damage/snipe/heal/buff_atk/buff_atkspd/shield）自动充能自动释放。**待完善**：多数盟约 `need` 值与官方逐干员归属为近似值；`reviveChance`/`dmgTaken` 等个别效果是否完全生效需实测；部分技能类型/策略（band）效果仍缺。

### 阶段 C：表现与说明
- [x] **C1** 主界面与流程顺序（P0）：新增 `#menu` 首屏（干员库/编队/关卡/进入卫戍协议），重排为 **主界面→进入卫戍协议→选协议→局内**；`initMode` 首屏 `showMenu()`，`chooseBand` 才进局内；`endRun` 显示「返回主界面」。接 `index.html` + `mode.js`（`showMenu/enterMode/backToMenu/showStages/showFormation`）。
- [x] **C2** 地图图例（P0）：说明补齐「红=刷怪、蓝=漏怪、绿=可部署、紫=传送、禁用格」；对应 `#side` 提示与 `TILE_COLOR`。
- [x] **C4** 漏怪直接扣生命（P0）：`engine.leak` 回调 `window.onLeak`；`mode.onLeak` 每漏怪扣 `G.life`（`lifePointReduce`），生命归零调 `window.haltBattle(false)`；`onBattleEnd` 加 `G.battleDone` 幂等保护、失败分支不再重复扣血；模态关闭（`closeRoster/closeDetail`）后 `renderAll()` 重同步按钮。
- [x] **C5** 选中干员管理菱形改用图集并支持关闭（P0）：`render()` 中选中干员界面由手绘虚线改为**图集大空框菱形(index1)** + 三图标按钮（上撤退22/右装备18/下技能27），按钮放菱形顶点外侧；`opButtons` 改顶点布局；`onClick` 支持**点棋盘外/空格关闭**选中；选中界面仅在休整期显示。
- [~] **C3** 关卡选择/下一关（P1）：关卡**选择**已完成（主界面「关卡」→ `showStages()` 列表 → `selectLevel(i)` 切图进局）。**遗留**：通关后的**自动开启下一关**（当前为手动选关）；「下一回合」仍仅在当前关内循环到通关/失败。
- [~] **C6** UI 布局重构（P1，模块一/四，已落地一版）：顶部状态栏规范化（左退出/延迟、中回合/阶段/生命、右大号倒计时+准备就绪/下一回合）；羁绊(契约)徽章移至顶部横条（圆形层级环）；~~备战席实体化（左侧纵向卡槽）~~ **该方案已废弃**：当前架构以 `assets/task/T-002.md` 和 `docs/architecture.md` 为准，卫戍协议候选区必须由地图真实 `tile_achand` 承载，DOM 手牌只用于普通模式；商店+资产栏下移为底部抽屉（左调度中心等级+升级环、中**6 卡槽**、右冻结/刷新/资金/收起），形成 **1+6+1** 紧凑结构；移除右侧调试栏（玩法说明拆入 #side-tip、装备栏移入抽屉左列）；新增 `冻结` 机制（`G.frozen`，回合更替不刷新卡池）与「剩余可放置角色」提示。**遗留**：商店/装备 UI 卡片复用占位；「冻结」仅 UI 状态无独立视觉冻结样式；装备栏仍用旧 `.card` 未迁移到抽屉风格；倒计时大字仅在战斗渲染循环刷新。验收：`node --check`、`tools/_smoke.js`/`tools/_ui_smoke.js` 均 SMOKE OK。
- [x] **C7** 放置限制与交互提示（P1，模块二第3项，已落地）：新增 `deployLimit()`（=3+调度中心等级）作为可同时在场上限；`onDeploy` 已达上限时拒绝部署并提示「可部署角色已达上限」；拖拽 ghost 阶段用 `window.onCanDeploy(row,col)`（可部署+未达上限+无占位）实时判定落点——**绿=可放（显示攻击范围预览）/ 红=不可放（显红叉）**；悬停格高亮在休整期也按此逻辑着色、拖拽中抑制避免与落点高亮叠加；`onUp` 部署分支同样接入上限校验（`window.onCanDeploy`）。`updatePlacement`/`deployLimit` 统一。验收：`node --check`、`tools/_smoke.js`/`tools/_ui_smoke.js` 均 SMOKE OK。
- [!] **C8** 模块二第1/2项（棋子 SD 模型/立绘切片、3D 地形/障碍木箱）：**现实阻塞 = 缺素材**。① SD 模型/立绘切片依赖 ArknightR `units/char_XXX` Spine 解包（E3），项目内无解包产物；② 3D 地形高低差/草水高地/阻挡木箱依赖 ArknightR `bundles/dungeontile` 更丰富地形图集（E6 已确认仅 `stone_000`+`start_000`+6 特殊图标，无地形图集）。**对策**：待 E2/E3/E5 解包后接入；当前用「石头地板+门标+图标」近似还原。
- [x] **C9** 属性详情浮窗排版 + 富文本解析（P1，模块三第1/2项，已落地）：
  - **详情浮窗 Tab 化**：`opDetailHtml` 重构为「左上紧凑面板」——名称+称号、标签行（阶级/职业·副职业/远近/精英化等级/季节主题/盟约）、生命条+五维（攻/防/法抗/阻挡/攻速）、底部 **概览/技能/天赋 三 Tab**（`detailTab` 全局 + `setDetailTab()` 切页并保持选中渲染）。概览=攻击范围九宫格+盟约+装备+位置；技能=技能名+描述（富文本）+技力消耗；天赋=各阶段天赋描述（富文本）。
  - **方舟富文本解析** `richText(s)`：把天赋/技能描述里的方舟原生标记转成**高亮词条 + 悬浮 tooltip**——`<$ba.状态>中文</>`（晕眩/脆弱/冻结/神经损伤…）、`<@ba.kw>关键字</>`、`<@ba.vup|vdown>`、`<中文地形/装置词>`（树丛/屏障/宝刺金属箱…）。同款 `stripRich()` 生成纯文本 tooltip（避免嵌套 HTML 泄漏）。CSS 新增 `.ba-tag`（金/蓝/绿/红多色）。
  - **官方释义**：新增 `tools/extract_rich_term.js` 从官方 `gamedata_const.json` 的 `termDescriptionDict` 提取 **64 条 `ba.*` 权威释义** → `web/battle_richterm.json`；`richText` 优先查询它（`RICHTERM`），`BA_GLOSS` 作兜底。
  - **测试**：新增 `tools/_rich_smoke.js`（RICH SMOKE OK，覆盖 9 类标记用例 + 断言）。`node --check`、`_smoke.js`/`_ui_smoke.js` 均 SMOKE OK。
- [x] **C10** UI 层叠规范与抽屉/备战席重构（P1，模块一/四深化，已落地）：
  - **底部商店抽屉居中吸附**：`#shopdrawer` 由**通栏 flex 页脚**改为 `position:fixed; left:50%` 居中悬浮（去掉 `width:100%`、`width:fit-content`、圆角顶 + 上阴影），内容 `1+6+1` 紧凑结构——左升本单元（`#shop-left`：等级大数字 + 升级进度环 + 升本钮）、中卡槽区（`#shop`）、右资产控制（`#shop-right`：资金 + 收起）。
  - **商店 6 槽右对齐**：`SHOP_SLOTS=6`（`genShop` 由 5→6）；`renderShop` 先补空槽占位（`shop-slot` 虚线框）再排真实卡（`shop-card` 固定 92px 槽宽），`#shop` 用 `grid-template-columns:repeat(6,92px)`——**卡数不足时左侧空槽靠左、卡片严格右对齐**（`_ui_layout_smoke` 验证买 1 张后=1 空槽+5 卡且空槽在左）。
  - **解耦刷新/冻结**：从底部卡槽移出，改为独立悬浮胶囊 `#shop-fabs`（定位于底栏正上方居中），`refresh-btn`/`freeze-btn` 用 `.fab` 胶囊样式；**仅休整期显示**（`renderShop` 依 `G.phase==='rest'` 切换 `.hidden`）。
  - **[已废弃旧方案] 备战席锚点修正**：曾将 `#bench` 固定在屏幕左侧纵向显示；该方案会把候选单位从地图语义中剥离，现已由真实 `tile_achand` 引擎实体替代。
  - **[仅普通模式保留] DOM 手牌卡槽**：`.handcell` 的头像/职业/费用样式不再用于卫戍协议候选区；卫戍协议左侧不得常驻未部署干员。
  - **全屏铺底 + 顶层层叠**：`#main-body` 改 `position:relative`、`#canvas-wrap` 改 `position:absolute; inset:0` 全屏铺底；`#side`（选中干员面板）改 `position:fixed; right:0; top:46px` 右侧浮层；`#placement`（剩余可放置）改 `position:fixed; right:16px` 右下气泡。`sizeCanvas` 用 `overlayW=470/overlayH=210` 避让浮层。
  - **测试**：新增 `tools/_ui_layout_smoke.js`（UI LAYOUT SMOKE OK，验证 6 槽右对齐/备战席新卡/冻结胶囊/抽屉收起）。`_smoke.js`/`_ui_smoke.js`/`_a7_smoke.js`/`_rich_smoke.js` 均 SMOKE OK，HTML 无重复 id。

### 阶段 E：素材补齐（观感保真，接阶段 C 表现）
- [x] **E1** 全量实战敌人头像（P0）：扫描 `act1autochess`+`act1vautochess` 所有关卡 wave 的 SPAWN 敌人，用 PRTS `头像_敌人_{名}.png`（MD5 分目录）补齐头像；新增 `tools/download_all_enemy_avatars.py`（支持分批 LIMIT）。验收：116 个实战敌人 → 115 有头像（仅 `enemy_9023_acdums`「假想敌」PRTS 无素材，保留色块回退）；全部为有效 158×158 PNG，`node tools/_smoke.js` SMOKE OK。
- [!] **E2** 当前关敌人立绘（`enemy_portraits`）：**现实阻塞 = 无干净敌人立绘来源**。已排查：① PRTS 无敌人立绘（`立绘_敌人_*`/`敌人_*` 均 404，仅 158px `头像_敌人_*`，E1 已全量补齐=干净单一怪物形象）；② ArknightR `bundles/units/` 敌人贴图是 **Spine 纹理图集**（alpha 连通块 26~123，身体部件散落，非单帧整只怪——与干员立绘弃用 ArknightR 同类），且 bundle 共享（一个含多个敌人贴图，旧 `extract_biggest_texture` 按最大尺寸会**抓错敌人**）；③ `enemy_handbook_table.json` 仅给能力文本（`abilityList`/`damageType`/`enemyLevel`），无立绘图片引用。**对策**：敌人详情/图鉴改用 PRTS 头像（`web/enemy_avatars/`）作形象 + handbook 能力文本作内容；参考脚本 `tools/extract_enemy_portraits.py`（按 `tex.m_Name` 匹配，产出为图集不作立绘用）。
- [ ] **E3** 干员战斗小人（Spine chibi）：ArknightR `units/char_XXX` 可解包，用于战场上更还原的干员形象（目前用头像代替）。
- [~] **E4** 技能图标（已定位+切图，名→矩形待解）：在 ArknightR 找到并用 UnityPy 导出 FairyGUI 包 `web/ui/skillicon_fui.bytes`（头 `FGUI`，`.fui` 即 `skillicon_fui_*.bundle` 内 TextAsset）；已解析其**字符串表**（2410 条，含全部 1199 个 `skill_icon_*` 名）。`web/ui/` 已含 `SkillIcon_atlas0*.png` 图集；新脚本 `tools/extract_skill_icons.py` 用 alpha 连通域切出 **1199 张 128×128 图标**到 `web/ui/skillicons/skill_icon_{seq}.png`，并写 `web/ui/skill_icon_map.json`（每图块 page/x/y/w/h + `namesInFguiOrder`）。⚠️ 前 81KB 的逐条 item 记录按 FairyGUI 二进制内容（`ff fe` 索引表）编码，`姓名↔矩形` 精确对照尚未解码（共享 `skcom_*` 通用技能处会漂移）；解码后可把图标按 `skill_table.iconId` 接入干员技能面板。
- [ ] **E5** 战斗/部署音效：目前仅 BGM；补部署/攻击/命中等 SFX（AudioClip 提取受 FairyGUI 限制）。
- [x] **E6** 地形环境贴图：ArknightR `bundles/dungeontile` 仅含 `stone_000`(地面,512×256,不透明暗石) + `start_000`(出生塔,16%透明红) + 6 特殊格图标；`image` 空、`data`/`other` 无地形图集（战场地形图集未打包）。已导出到 `web/ui/tiles/`（`tools/extract_dungeon_tiles.py`）。`engine.js` `render()`：**整幅地图用 `stone_000` 左上 256×256 无缝瓦片铺成连贯地牢石地板**；`tile_forbidden` 叠加深色(8,10,15,0.82)“虚空”遮罩突出道路；红门画 `start_000` 出生塔+红光、蓝门蓝光+漏怪环、紫传送紫光+环；`tile_battle/event/heal/reward/shop` 预留图标映射（`iconMap`，有此类格的地图自动叠加 monster/event/rest/chest/shop 图标）。保留路线线、可部署屏、绿色可放格。验收：`node --check`、`node tools/_smoke.js` SMOKE OK。**局限**：因 ArknightR 无更丰富的地形图集，land 只能靠 stone 石地板 + 门标 + 图标还原；无草/水/高地等独立贴图。


### 阶段 F：官方 OBB 资产接入（资产管线已打通：OBB→AB→LZ4变种解压→UnityPy→导出）

> 资产情报详见 `docs/asset-map.md`；索引库 `work/inventory.sqlite`（`tools/search_assets.py` 查询，`tools/export_asset.py` 定向导出）。

- [x] **F1** 职业图标高清 variant（P1）：`profession_large_hub.ab`（256×256 `_large`）已导出并接入 UI。`web/assets/profession_icons/` 换成 256×256 高清 PNG；`engine.js` 加 `PROF_ICON` 映射，`mode.js` 4 处（商店卡 `op-prof` / 备战席 `prof-badge` ×2 / 详情抽屉 `od-skill-icon`）由单字徽章改为 `<img>` 图标，`index.html` 对应样式改 img。验收：`node --check`、`tools/_smoke.js` SMOKE OK。
- [x] **F2** 技能图标（P1）：`spritepack/skill_icons_0/1/2/3.ab` 的 128×128 独立图标已导出 **1483** 个到 `web/ui/skillicons/`（`tools/export_skill_icons.py`），命名 = `skill_icon_{skillId}`。`mode.js` skill 构造加 `realIcon`（= `skill_data.json` 的 `prefabId`），技能面板显示 `skill_icon_{prefabId}.png`（`skcom_*` 通用图标生成去 `[n]` 别名）。命中 **393/427（92%）**，剩余 34 个（8%，新手干员技能1用通用图标但 OBB 无对应）`onerror` 回退不显示图标。验收：`node --check`、`tools/_smoke.js` SMOKE OK。
- [x] **F3** 卫戍协议专属素材（P1）：导出 **13** 个 autochess 专属素材到 `web/ui/autochess/`（`tools/export_autochess.py`）——`act1vautochess_token_chess`（171×174 棋子 token）、`autochess_level_1~6`（38×38 段位图标）、`pic_*_battle`（120×120 联机表情）。接入详情抽屉段位显示（`od-tiericon`）。⚠️ 盟约图标 `icon_*Ship`（23 个，`bondInfoDict[].icon`）在 OBB **0 命中**，需 FairyGUI fui/atlas 或 PRTS。验收：`node --check`、`tools/_smoke.js` SMOKE OK。
- [x] **F4** 敌人图标（P1）：`spritepack/icon_enemies_0~5.ab` 的 158×158 敌人图标（**1597** 个，命名 = `enemy_{enemyId}`）已导出，补 `web/enemy_avatars/` 里 PRTS 缺失的 **1229** 个（`tools/export_enemy_icons.py`）。此前 PRTS 缺失的 `enemy_9023_acdums`「假想敌」现已补齐。验收：`enemy_avatars` 368 → **1601**，`enemy_9023_acdums` 158×158 有效，`tools/_smoke.js` SMOKE OK。
- [x] **F5** 角色立绘/头像（P2，备源确认，暂不接入）：OBB 干员立绘在 `spritepack/char_portrait_0~13.ab`（**14 bundle / 2612 obj**，180×360，命名 `char_{id}_{皮肤}#{序号}`），动态头像 `dynavatars_0.ab`（132 obj）。PRTS 立绘已齐全（干员 115/115、头像 446），故仅记录备源，不接入。
- [x] **F6** 地图/地形贴图（P2，备源确认，维持兜底）：OBB `maps/*/res.ab` 有 3D 地图地面贴图（`TX_*_Ground_D/N/M/BG`，1024~2048×1024~2048，切尔诺伯格/多索雷斯等）；`[uc]crisisv2.ab` 有 2D 地块图标（`g_map_tile_*`，50×50）。但**卫戍协议（autoChess）2D 战场 tile 贴图未在 OBB 找到**（autochess 资源仅 token/段位/表情），维持 ArknightR `stone_000` 兜底（E6）。
- [x] **F7** TextAsset 配置（P1，结论：卫戍协议配置不在 OBB）：OBB TextAsset 共 **4086** 个，主要是主界面主题配置（`tm_*_1` JSON，如 `tm_dungeon_1` 12767 字节已导出）、Spine 骨骼图集（`enemy_*.skel/.atlas`）、口型（`lipsync CN_*`）。**卫戍协议规则/地图配置不在 OBB 的 TextAsset**（`autoChessData` 已在 gamedata `activity_table.json` 提取）。


### 阶段 D：任务维护
- [x] **D1** 建立本 `TASKPLAN.md`，作为旧工作流当时的 TODO 汇总来源。
- [~] **D2** 先让用户确认优先级/范围，再逐项落地（当前处于「只了解、未动手改玩法」状态）。

---

## 3. 已确认 / 待你确认
- **[x] 已确认**：目标 = **全量还原**（干员技能/装备/天赋/敌人能力均接真实数据）。周期长，按 A→B→C 顺序推进。
- [ ] **待确认（推进中会影响选关）**：主地图用 `act1vautochess_01-01`（教学）还是 `_m01`（领袖图）/其它？先按 01-01 推进，后续再切。
