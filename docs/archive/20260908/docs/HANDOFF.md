# 项目交接文档（HANDOFF）

> 供新对话快速理解项目当前状态。最后更新 2026-08-27。

## 一、项目目标

- 游玩明日方舟「卫戍协议」（Guard Protocol / autoChess 自走棋）模式，官方长期不开。
- 最终目标：**单机可玩 + 熟人联机**（共享房间密钥 + 内网穿透）。
- 选定形态：**Windows 浏览器网页版（HTML5 Canvas）**，用官方 gamedata 重做，而非逆向官方 APK。

## 二、当前状态（已建成）

1. **真塔防战斗引擎**（`web/engine.js` + `web/index.html`）：
   - 网格地图渲染、敌人沿路线行进、波次刷怪、干员点选部署、攻击/阻挡、漏怪扣护盾、胜负判定。
   - 数据来自官方 gamedata：`web/battle_data.json` = 454 干员 + 2130 敌人 + 9×14 地图 + 5 路线 + 5 波次。
   - 干员头像已下载到 `web/avatars/`（来自 PRTS wiki，354+ 个；缺失时回退色块，不会白屏）。
2. **数据抽取脚本**（`tools/`）：`extract_battle_data.py`、`extract_mode_data.py`、`fix_routes.py` —— 已改相对路径，并支持共享 gamedata。
3. **卫戍协议模式层**（`web/mode.js`，套在 `engine.js` 上）：
   - 回合循环：休整期（招募/刷新/升级调度中心/凑盟约/穿装备/布阵）→ 自动作战 → 结算（未用完资金清零、升级费每回合 -1）。
   - 商店：干员与装备**混刷**（约 1/4 装备），刷新 1 资金；招募 3 资金、出售返 1。
   - 干员**阶（Ⅰ~Ⅵ）为卫戍协议专属划分，非星级**：数据来自 PRTS 干员数据库（`tools/extract_operator_tiers.py` → `web/operator_tiers.json`，115 名参战干员）；调度中心等级 ≥ 干员阶才进池。
   - 开局策略（band）：**血量 + 效果文字**来自 PRTS 策略报告（`tools/extract_band_data.py` → `web/band_data.json`）；血量已生效，效果文字已展示，逐条效果逻辑待实现。
   - 盟约：8 势力 + 15 通用（调和/独行/绝技等），效果为简化数值版。
   - 装备：穿戴（最多 2 件）/同名自动进阶；精锐合成（3 同名→1 精锐）；干员技能自动充能自动释放。
   - 战斗可视化：敌人头像贴图（`web/enemy_avatars/`）+ 沿路线行进 + 攻击弹道 + 技力条 + **真实攻击范围**（`range_table.json` 解析，含朝向变换）。
   - 交互：拖拽部署 + **菱形二次确认朝向**；点选干员看详情大图/范围；右键撤离；**部署落下动画 + 部署后短暂无敌**。
   - 账号练度：干员库界面（两行横向滚动竖长卡片，立绘背景+精英化/等级；点击进 PRTS 风格详情页：稀有度/中英文名/职业/子职业/信赖/潜能/等级/技能等级），**默认满配**（精二满级·技能7·信赖100·潜能6），3 个一键配置（精一满级·技能7 / 精一1级·技能7 / 全员1级·技能4）；卫戍协议战斗按 `cultivateEffectList` 简化：**精一 +5% 攻/防、精二 +10% 攻**（固定基本属性，防练度差距），练度存 localStorage。
   - 冒烟测试 `tools/_smoke.js`（Node `vm` 无头跑通一整局）。
4. ~~LZHAM DLL~~（死胡同，已废弃）：曾编译 `work/lzham.dll` 误试 LZHAM，实际 codec=4 是 LZ4 字节序变种，已用 `tools/decompress_ab.py` 打通（见第三节）。

## 三、关键技术结论

- **客户端**：明日方舟日服 `com.YoStarJP.Arknights`，IL2CPP + XLua，版本 36.7.22。
- **服务器地址**：`https://gs.arknights.jp`（`assets/u8_developer_config.properties` 明文）。
- **卫戍协议 = autoChess（自走棋）**，3 个赛季：`act1autochess` / `act1vautochess` / `act2autochess`。
- **数据源**：`Kengxxiao/ArknightsGameData`（zh_CN 国服数据），已定位全部模式数据（干员/敌人/盟约/BOSS/关卡/策略）。
- **素材**：OBB 是 ZIP（2617 个 `.ab`）。`.ab` 为 UnityFS formatVersion 8：header `flags&0x3F=3`（LZ4HC，仅用于 BlocksInfo 解压，`tools/inspect_bundle.py` 已成功解压且长度闭合）；**data block 级 codec 经精确解析 block `uint16 flags` = 4**（M2a 确认，大 bundle 含 codec=4+None 混合块）。**codec=4 已打通（M2c 验证，`tools/decompress_ab.py`）**：它并非 LZHAM，而是 **LZ4 字节序变种**（token 高低 4 位交换 + match offset 大小端交换），变换回标准 LZ4 即解压（算法源于 MooncellWiki/UnityPy commit 781badde6d636，Kengxxiao）。已用该脚本解出 `[uc]campaign.ab` 的 157 个对象（76 Texture2D + 76 Sprite + 4 MonoBehaviour + 1 AssetBundle）。→ 贴图/头像可直接从 OBB 提取。**完整生产流程（每个文件怎么来、怎么重新生成）见 `docs/asset-pipeline.md`。**
- **global-metadata.dat** 头部被 XOR 加密（Il2CppDumper 无法解析）。
- **PRTS 头像 URL 规律（已破解）**：`https://media.prts.wiki/{h[0]}/{h[0:2]}/头像_{干员名}.png`，其中 `h = MD5("头像_{干员名}.png")`。
- **素材源（以直接解析官方 OBB 为最终目标，ArknightR 仅一次性兜底）**：官方 APK 素材主体在 OBB（`Android/obb/.../main.2000138...obb`，1.83GB ZIP）。`.ab` 的 container 层已确认（UnityFS v8）；header 用 LZ4HC 压 BlocksInfo（可解），**data block 用 codec=4（M2a 已确认，实为 LZ4 字节序变种，非 LZHAM）**，已用 `tools/decompress_ab.py` 打通——持续资产管线可直接解析官方 OBB。历史上曾用第三方修改版 ArknightR（`D:\下载\Games\ArknightR`，UnityPy 直接读）**一次性解包素材**，但其数据做了修改、玩法自研，且不含 `arts/misc/profession_icons_hub`（职业图标，现已从官方 OBB 解出）等资源，**不可作持续资产依赖**。当前贴图/头像从 **PRTS** 下载（`头像_{干员名}.png` / `立绘_{干员名}_1.png`，MD5 分目录，`tools/download_portraits.py`），干员立绘 115/115、领袖头像 7。**已接入官方 OBB 资产**（阶段 F，见 `TASKPLAN.md`）：职业图标 256×256 高清（`PROF_ICON`）、技能图标 1483 个 128×128 独立图标（`realIcon`，替代 FairyGUI atlas 切图）、autochess 段位图标、敌人头像 OBB 补 1229 个（共 1601，含 PRTS 缺失的假想敌）。

## 四、关键决策

1. **放弃逆向官方 APK + 本地私服**，改为**用官方 gamedata 重做网页版**（更务实、Windows 可用、熟人零安装）。
2. 贴图用 **PRTS wiki 头像**（此前 OBB 素材被 codec=4 卡住，现已用 `tools/decompress_ab.py` 打通，可切换为 OBB 提取）。
3. 战斗引擎做**简化塔防**（非完整 Arknights 战斗引擎；攻击间隔/技能/天赋未全实现）。

## 五、项目结构

```
卫戍协议复刻/
├── web/               # 网页游戏
│   ├── index.html     # 界面
│   ├── engine.js      # 塔防战斗引擎（由 mode.js 驱动）
│   ├── mode.js        # 卫戍协议模式层（回合/商店/盟约/装备）
│   ├── battle_data.json  # 干员+敌人+关卡数据
│   ├── mode_data.json    # 盟约/策略/BOSS/装备（做模式层用）
│   └── avatars/       # 干员头像（charId.png）
├── tools/             # 数据抽取/下载脚本
├── docs/              # 文档（findings.md / mode-spec.md / data-inventory.md / roadmap.md）
├── data/              # 我的稀疏 gamedata clone（可删，改用共享，见第八节）
├── work/              # 解包产物 + AssetStudio 等（gitignore，大文件）
├── server/            # 早期协议探针服务器（未用）
└── run.bat            # 一键启动 web
```

## 六、运行方式

- 双击 `run.bat`（或 `cd web && python -m http.server 8000`），浏览器打开 http://localhost:8000。
- 操作：开局情报页选策略 → 休整期在商店买人 / 刷新 / 升级调度中心 / 买装备 → 点手牌选中干员、再点地图绿格部署 → 点装备再点棋盘干员穿戴 → 点「开始作战」自动战斗 → 结算后「下一回合」。

## 七、剩余工作（按优先级）

1. **卫戍协议模式层** ✅ 第一版可玩（回合循环 + 商店混刷干员/装备 + 真实阶划分 + 盟约 + 装备 + 精锐 + 领袖战 + 干员技能[自动] + 撤离 + 弹道 + 拖拽部署/二次拖动确认朝向 + 攻击范围/详情大图 + 敌人头像贴图 + 开局策略血量/效果展示）。后续可：策略效果逐条实现（40 种规则，目前仅血量生效+效果文字展示）、盟约效果对齐官方逐干员归属与层数叠法、机变阶段、原型干员/特许干员/自选编入、装备/敌人数值平衡调优。
2. **联机**：共享房间密钥 + 内网穿透（Tailscale/frp）。
3. **OBB 贴图**：已用 `tools/decompress_ab.py` 打通（codec=4 是 LZ4 字节序变种，非 LZHAM），可批量导出官方 OBB 素材。
4. **子模块对接**（见第八节）。

## 八、子模块 / gamedata 共用（最近工作，待完成）

- 项目已移到 `D:\OneDrive\Project\ArknightsResearch\卫戍协议复刻`。
- `ArknightsResearch\.gitmodules` 已声明 `ArknightsGameData` **顶层子模块**（Kengxxiao），但**未 checkout（空）**。
- 实际完整数据在 `ArknightsResearch\ArknightsStoryParse\ArknightsGameData`（rel65.0 / 2025-09-12，最新）。
- 我的脚本已改为「优先 `../ArknightsGameData`（共享），不存在则回退自己 `data/ArknightsGameData`」。
- **待办**：
  1. 用户执行 `git submodule update --init ArknightsGameData`（checkout 顶层共享数据）。
  2. 我的项目作为 ArknightsResearch 的子模块：GitHub 远程（`git submodule add <url> 卫戍协议复刻`）或本地子模块（`git submodule add ./卫戍协议复刻 卫戍协议复刻`）。
  3. 清理重复：`卫戍协议复刻\data\ArknightsGameData`、`ArknightsStoryParse\ArknightsGameData`（若 StoryParse 改用顶层共享）。

## 九、环境与工具链

- 本机：Python 3.10/3.11/3.12/3.14（`py -0p` 可见）、.NET 9、Node 22、Java 17、git。
- C 编译器：`D:\OneDrive\Tool\LLVM`（clang 11，`--target=x86_64-w64-mingw32` 可编译 C++）。
- UnityPy 1.25（Python 3.12，已装）。

## 十、注意事项

- 换新会话后，**终端 cwd 需改为** `D:\OneDrive\Project\ArknightsResearch\卫戍协议复刻`（旧路径 `D:\OneDrive\Project\卫戍协议复刻` 已不存在，会导致 shell 启动失败）。
- `work/`、`data/ArknightsGameData/`、`web/avatars/` 已在 `.gitignore`（`web/avatars/` 视情况是否入库）。
