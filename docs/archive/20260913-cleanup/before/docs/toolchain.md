# 本地运行、构建与提取

从仓库根目录执行。游戏运行需要浏览器和已有web产物；Node用于构建/检查，Python用于本地服务与提取。Unity资源导出按脚本需要UnityPy、lz4、Pillow等；不为普通运行安装整套逆向工具。

## 环境准备（优先）

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -U pip
python -m pip install -r requirements.txt

# 可选能力（音效导出）
python -m pip install -r requirements-optional.txt
```

默认不需要 `npm install`。游戏运行链和联机服务使用仓库内置 Node 运行时，不依赖工作区全局 npm 包。

## 运行与代码构建

```powershell
node tools/build_mode.js --check
python tools/run_server.py --host 127.0.0.1 --port 8000
```

打开 http://127.0.0.1:8000/ 。修改 `web/mode/*.js` 后运行 `node tools/build_mode.js`，再检查 `--check`。源码模块的拼接顺序由构建脚本维护，不直接修改生成的mode.js。专属特质源目录用 `node tools/build_garrison.js` 重建，`--check` 只验证数据漂移。

统一基础验收：`node tools/check_game.js`，`--list` 列出当前检查项，包括生成漂移、特质、战斗、单机/联机、存档、UI 与文档链接；遇到失败立即非零退出，不改写产物、不启动浏览器、不播放音频。修改源文件后先运行对应生成器再验收。

逐人/逐敌清单：`node tools/audit_implementation_checklist.js` 对照本地源表与实际名册生成 [实施总表](implementation-checklist.md) 和 `docs/generated/*-checklist.md`，`--check` 检查漂移。只写文档，不改游戏数据或打包。人工勾选和紧邻的“记录”行会按稳定 ID 保留；源数据/可观测目录变化重开相关项。维护格式见总表，不将“数据存在”当作“行为完成”。

定向验证：

```powershell
node tools/_elemental_smoke.js
node tools/build_elemental_data.js --check
node tools/_operator_combat_smoke.js
node tools/_common_cost_skills_smoke.js
node tools/audit_operator_mechanics.js --check
node tools/_training_smoke.js
node tools/_skill_timing_smoke.js
node tools/_mode_rounds_smoke.js
node tools/_source_battles_smoke.js
node tools/_source_wave_smoke.js
node tools/_source_mode_smoke.js
node tools/_source_consumers_smoke.js
node tools/_source_coordinates_smoke.js
node tools/_setup_routes_smoke.js
node tools/_economy_terrain_smoke.js
node tools/_battle_feedback_smoke.js
node tools/_shop_economy_smoke.js
node tools/_projectile_lifecycle_smoke.js
node tools/_simulation_clock_smoke.js
node tools/_rest_save_smoke.js
node tools/_bond_shop_regression_smoke.js
node tools/_responsive_camera_smoke.js
node tools/_audio_preference_smoke.js
node tools/_ui_fixes_smoke.js
node tools/_smoke.js
node tools/check_docs.js
```

training测试需要本地character_table源文件；其余相关行为按变更选择skill_select、module、block_respawn等smoke。浏览器画面/输入必须在真实浏览器另验；数值测试不代替截图验收。性能方法见 [performance-baseline.md](performance-baseline.md)。

音乐默认静音；音乐按钮会记住静音与音量（同origin的`arknightsAudioV1`），进入策略页面不重置设置。布局样式修改须更新HTML资源版本，避免浏览器继续使用旧CSS。响应式布局按实际HUD/商店高度预留棋盘空间，窄屏商店横向滚动；缩放回归覆盖390×844、844×390、820×1180、1280×720和1920×1080，投影/点击逆变换另覆盖640×360。

## 数据生成

### 数据源与脚本回退策略

脚本默认优先读取 `data/ArknightsGameData/zh_CN/gamedata/`。若仓库缺失上述目录，部分 extractor 会回退到 `../ArknightsGameData/zh_CN/gamedata/`（同级共享目录）。本仓库当前不要求 Git 子模块作为强制依赖，不要把外部仓库当作必需运行前置。

建议更新共享数据后再运行本地导出脚本，避免一人使用新表一人用旧表。

休整存档：局内左上「保存」，刷新或重开页面后从主菜单「继续休整存档」。只保存无决策/晋升奖励/拖拽/升级确认的休整状态；包含本局账号快照，不重发回合资金，不重刷冻结商店。浏览器同一origin的localStorage单槽位，schema版本或已加载规则目录指纹变化会拒绝读取；2026-09-08路线坐标修复前后的精确目录对有兼容入口，不代表支持任意数据版本迁移或战斗中途恢复。

原始JSON根为 `data/ArknightsGameData/zh_CN/gamedata/`。只运行当前修改影响的生成器，检查生成diff；现阶段没有可以无审查全量覆盖全部产物的统一命令。

技能/养成相关依赖顺序：

```powershell
node tools/build_mode_rules.js
python tools/extract_level_data.py
python tools/extract_range_data.py
python tools/extract_talent_data.py
node tools/extract_skills.js
node tools/classify_skills.js
node tools/build_detail_catalogs.js
node tools/build_modules.js
node tools/build_mode.js
```

前置：extract_skills读取已存在的battle_data.json和mode_rules；classify_skills会再写skill_data并应用skill_patch.json。仅运行extract_skills可能丢掉分类/补丁效果。当前各生成器的赛季选择不完全统一，详见[数据表](data-inventory.md)。

| 改动数据域 | 主入口 |
|---|---|
| 基础干员/敌人 → 地图集合 | extract_battle_data.py → build_levels.js；路线另查fix_routes.py/rebuild_routes.py的当前输入输出 |
| 轮次/敌群/路线关联与消费 | node tools/build_mode_rounds.js → node tools/build_source_battles.js；两者支持--check。后者还依赖已分类battle_data与enemy_database，输出source_battles.json供运行期读取 |
| 商店/击杀金币 | build_economy.js（当前act2、shop为single_normal） |
| 策略/盟约 | build_strategy.js、extract_bond_data.js、build_op_bonds.js |
| 装备/装置 | build_equip_data.js、build_items.js |
| 元素损伤/爆发/抗性目录 | node tools/build_elemental_data.js；支持 --check，原始 buff 与源属性，不改 source_battles |
| 敌人能力 | extract_enemy_abilities.js |
| SQLite和配套导出 | build_db.js；先检查覆盖文件，勿把旧常量覆盖当成源数据更新 |

源表字段、产物与消费者只在data-inventory维护。保留源ID、版本/哈希和原始blackboard，未理解字段不要猜成机制。

## 资源查找与导出

已有输入 `work/main.obb`，资产索引 `work/inventory.sqlite`。先查询再定向导出；只有索引缺失或换包才重建。

```powershell
python tools/search_assets.py skill --kind image
python tools/search_assets.py profession --kind image
python tools/search_assets.py --kind text
```

定向导出格式：`python tools/export_asset.py --bundle <bundle> --path-id <id>`，或 `--bundle <bundle> --name <name>`。用查询结果替换占位符。重建索引入口 `python tools/build_inventory.py`，会扫描整个包，耗时较长。

底层链路：main.obb ZIP → decompress_ab.py解析UnityFS/项目LZ4变种 → SerializedFile/resS → UnityPy对象 → PNG/TextAsset等。

| 用途 | 现有导出器 / 输出 |
|---|---|
| 职业图标 | export_profession_icons.py / web/assets/profession_icons；高清variants先输出work/export/profession_large，需检查后复制 |
| 技能图标 | export_skill_icons.py / web/ui/skillicons；通用skcom别名需保留 |
| 模式段位/棋子/表情 | export_autochess.py / web/ui/autochess |
| 敌人头像 | export_enemy_icons.py / web/enemy_avatars |
| 地块/界面图集 | extract_dungeon_tiles.py、extract_ui_atlas.py、split_ui_atlas.py |
| 音效 | export_sfx.py；按脚本检查音频解码依赖与输出格式 |

详细历史bundle样本保存在[资产管线归档](archive/20260908/docs/asset-pipeline.md)。无需重复导出当前已用的全部头像。APK反编译、IL2CPP和私服工具只用于具体缺口取证，不是运行Web游戏的前置步骤。

## 任务恢复

依次运行 `supervise.ps1 -Action Validate`、`SyncInbox`、`Status`；脚本位于 `.agents/skills/automaintain/scripts/`。完整运行说明见 [RUNBOOK](../.agents/skills/automaintain/RUNBOOK.md)。不要用文档中的“完成”表述替代任务状态，也不要重开已完成unit。

本轮资金/策略/地图联动回归：`node tools/_economy_terrain_smoke.js`、`node tools/_battle_feedback_smoke.js`，已纳入check_game。覆盖两赛季策略、老鲤/利息、前两轮升级、无AI虚构收入、8部署、Ⅱ·第4关实际移动、预置工事寻路、远程高台部署与交换。测试中的临时资金期望不是客户端证据；确认边界见findings R13/R14。

## 联机实验

Windows入口：`Start-Room.cmd` 自动准备Node与EasyTier并打开联机首页，创建生成分享码，加入自动入席；`Package-Room.cmd` 生成一个Universal通用包。`Start-Room.cmd -LocalOnly` 保留局域网入口；发行边界维护于[multiplayer.md](multiplayer.md)。开发用底层入口仍为 `node tools/room_server.js`。服务端复用`tools/lib/room-game-runtime.js`中的隔离VM，每名玩家单独的G/B/RNG；不依赖外部npm包。规则/目录首次加载后缓存，修改mode源先构建，再重启房间服务；仅刷新浏览器不能更新服务端缓存。

启动器检查：`node tools/_room_launcher_smoke.js` 验证地址、EasyTier优先展示、端口占用回退和真实HTTP大厅，已纳入check_game。Windows依赖检查：`powershell.exe -NoProfile -ExecutionPolicy Bypass -File tools/_room_node_bootstrap_smoke.ps1`，使用本地测试ZIP覆盖校验、路径和OneDrive兼容，不下载安装；`Start-Room.cmd -CheckOnly -PortableOnly` 检查实际便携缓存，缺少时才从官方准备。分享包默认包含缓存，收件人无需 npm 或 Python。

发行目录验收：`node tools/_room_package_smoke.js <分享目录>`，移除子进程PATH里的Node，在非项目工作目录使用包内启动器、运行时和真实HTTP页面；不打开浏览器，结束只关闭测试自己启动的进程。此检查需要先生成完整分享包，未加入日常全量检查。

覆盖更新包：已拿到完整通用包的玩家可以只接收小更新ZIP；首次使用仍直接领取完整ZIP。维护者先生成并验收新完整包，再将下面的目录名替换为`dist`中的两个实际发行目录：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File tools/package-room-update.ps1 -BasePath ".\dist\旧通用包目录" -NewPath ".\dist\新通用包目录"
node tools/_room_update_package_smoke.js
```

可选`-OutputPath ".\dist\本次覆盖更新.zip"`。工具按SHA256只收录变化或新增文件，更新`package-info.json`，附中文说明与ZIP校验文件，不修改两个原包；排除`user-config.json`、`.user-config.*`、`online-room.json`等本机数据。输入、输出限于工作区`dist`内，拒绝链接和已有输出；新版若删除旧文件，必须改发完整包，不生成无法清除旧文件的覆盖包。专项测试使用独立小目录验证覆盖后的文件哈希与新完整包一致、个人配置保留和路径边界。

收件人双方先关闭旧启动程序，将适用旧版本的小更新ZIP直接覆盖解压到原包根目录（与`Start-Room.cmd`同级），保留原有资源和`user-config.json`。双方更新完再启动`Start-Room.cmd`，重新创建同盟并发送新分享码。重启不恢复旧对局，已经判定弃权的旧局也不能靠刷新复活；不要将小更新ZIP当作完整游戏单独运行。

EasyTier集成：`tools/lib/room-easytier.psm1` 校验并准备官方CLI，优先用根目录本地ZIP；`tools/room-online.js` 管理无TUN进程、房主发现、DHCP、端口转发和退出清理。`node tools/_room_online_smoke.js` 使用本机三个真实核心进程；追加 `--public-relay` 会连接社区公网节点并禁用P2P测试中继，只有明确测试网络时运行。

分享码流程：`node tools/_room_share_smoke.js [通用包目录]` 验证真实核心进程组网、码校验、API来源约束、自动创建/加入、准备开局、退出后恢复首页及取消清理。可直接针对发行目录执行；另以两个实际浏览器入口验收单码入席、四席和邀请显示。这些检查不安装驱动；脚本测试不打开浏览器。

名片配置：`node tools/_room_profile_smoke.js` 覆盖115立绘、磁盘配置原子保存、损坏恢复、API鉴权、名片更新及首页心跳。生命周期：`node tools/_room_lifecycle_smoke.js` 使用真实VM验证断线暂停/恢复、弃权观战、结束重开与旧runId拒绝；`_room_game_client_smoke.js` 验证实际前端脚本的完整快照恢复、旧操作取消、双击观战及同房第二局。

本地资源与慢加载：`node tools/_room_web_client_smoke.js` 检查加入者本地静态读取、API代理、gzip、版本指纹和慢图片并发；`node tools/_room_startup_smoke.js` 检查首战前慢加载可恢复、启动取消和轻心跳不排队；`node tools/_room_presence_smoke.js` 读取真实HTML并故意阻塞后续脚本/初始化，跨过90秒旧超时线后继续入局。实际EasyTier检查可用`node tools/_room_online_smoke.js --root <通用包目录>`；加入者浏览器现在访问本地网关，API才经过其背后的EasyTier转发。

现有静态服务下访问 http://localhost:8000/net-lab.html 。独立页面不播放音乐、不读写游戏存档；手工交换邀请/回复测试准备状态与延迟。复现步骤、分享包边界和公网条件见 [multiplayer.md](multiplayer.md)。语法检查：node --check web/net-lab.js；真实连接需两个浏览器端，不能用语法检查替代。

商店研究导出：node tools/extract_shop_research.js，校验追加 --check；产物与边界见 [源表审计](generated/shop-source-notes.md)。运行价格仍经 build_source_battles.js 生成，修改mode源码后build_mode.js；专项检查 node tools/_shop_source_smoke.js。研究JSON不直接加载进游戏。

基础攻击配置：node tools/build_basic_attacks.js（character_table → web/basic_attacks.js）；--check检测漂移。行为验证 node tools/_basic_attacks_smoke.js，已纳入check_game。尚未覆盖的分支见data-inventory的基础攻击表。

Boss定向提取：`node tools/build_boss_mechanics.js` 读取 `work/main.obb` 内3个敌人prefab AB和源表，导出受击区、固定站位、选择器及已解释技能字段至 `web/boss_mechanics.json`；只读核对追加 `--check`。`_boss_mechanics_smoke.js`验证源组件/黑板，`_boss_runtime_integration_smoke.js`验证真实引擎的站位、受击区、目标与伤害事件，均已纳入check_game。[已执行及尚缺机制](generated/boss-mechanics.md)集中维护，不全包复制AB到网页。

部署费用：extract_level_data.py新增阶段cost，finalizeOperator→boardView→engine复活扣费贯通；node tools/_deployment_cost_smoke.js验证30tick回费、等待与自动复活、技能回费及资金隔离。

## 录像核对与四人房间（2026-09-10）

`python tools/slice_reference_video.py <视频> <输出目录> --prefix extra --times 120,280,2490,2720`：ffmpeg只读抽帧，Pillow生成带时间联系表，现有产物见[核对记录](video-review-20260910.md)。不要重提取整包音画。

`node tools/room_server.js`启动四席同盟大厅及权威战斗服务，默认127.0.0.1:8001；与已有调试服务共存时可用`--port 8003`。`_room_server_smoke.js`覆盖大厅，`_room_game_*_smoke.js`覆盖运营/客户端，`_room_battle_runtime_smoke.js`、`_room_battle_session_smoke.js`、`_room_battle_server_smoke.js`覆盖固定帧、共享Boss/联防、统一过轮、HTTP观战、压缩与缓存。均使用临时端口或隔离VM，结束后关闭。局域网显式host参数、打包目录、异地条件见[联机专题](multiplayer.md)。

入口专项：`node tools/_room_home_smoke.js`验证游戏主页、单人/多人分级入口、功能页回链、显式续接、单人不调用组网及EasyTier延迟准备；`node tools/_room_entry_smoke.js`验证房间配置鉴权与冻结、单人真实经济/战斗/Boss结算、同图人数模式转换和首领预告一致。大厅客户端另覆盖未成功保存配置的回滚显示，以及人数变化使配置失效时禁止开局。

新增Boss选取/14轮、阵型迁移/存档、视频流程、决策奖励、部署费用、战斗反馈、价格和房间专项均已纳入check_game。
