# 构建、提取与验证命令

[开发环境与启动](README.md) · [文档导航](../README.md)

以下命令从项目根目录执行。只运行影响本次修改的生成器；没有可以无审查覆盖全部源数据与游戏产物的统一重建命令。

## 日常检查与清单

```powershell
node tools/build_mode.js --check
node tools/check_game.js --list
node tools/check_game.js
node tools/check_docs.js
```

修改 `web/mode/` 后先运行 `node tools/build_mode.js`；其他生成物分别按下表重建。`check_game` 是只读验证，失败非零退出；列出的 smoke 能验证行为和数据，不代替真实画面、GPU 或异地链路实测。性能方法见[性能记录](performance-baseline.md)。

```powershell
node tools/audit_implementation_checklist.js
node tools/audit_implementation_checklist.js --check
node tools/audit_content_coverage.js --check
node tools/audit_operator_mechanics.js --check
```

逐人/逐敌生成表位于 `docs/checklists/`，维护规则见[总表](../checklists/README.md)。重建保留 review ID、依据摘要、人工勾选及记录；字段或相关执行依据变化会重新打开受影响项。生成器数量/处理器存在不代表行为完成。

专项验证命令由[机制专题](../mechanics/README.md)维护；完整检查组以 `check_game --list` 为准，文档不再复制一份随时过期的全量测试列表。

## 数据生成

### 数据源与脚本回退策略

脚本默认优先读取 `data/ArknightsGameData/zh_CN/gamedata/`。若仓库缺失上述目录，部分 extractor 会回退到 `../ArknightsGameData/zh_CN/gamedata/`（同级共享目录）。本仓库当前不要求 Git 子模块作为强制依赖，不要把外部仓库当作必需运行前置。

更新数据源前记录所用快照，只重建本次改动需要的产物，避免同级共享目录与本仓库源表混用。

原始JSON根为 `data/ArknightsGameData/zh_CN/gamedata/`。只运行当前修改影响的生成器，检查生成diff；现阶段没有可以无审查全量覆盖全部产物的统一命令。

技能/养成的源表与旧兼容产物依赖顺序：

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

前置：extract_skills读取已存在的battle_data.json和mode_rules；classify_skills会再写skill_data并应用skill_patch.json。仅运行extract_skills可能丢掉旧兼容分类/补丁效果。这条链不能生成完整客户端行为，后续机制开发从下面的原始逻辑链开始，不能把“重新分类全部描述”当作批量还原。全部等级参数由`build_operator_skill_levels.js`独立维护；各旧生成器的赛季范围见[数据表](../research/data-inventory.md)。

| 改动数据域 | 主入口 |
|---|---|
| 基础干员/敌人 → 地图集合 | extract_battle_data.py → build_levels.js；路线另查fix_routes.py/rebuild_routes.py的当前输入输出 |
| 轮次/敌群/路线关联与消费 | node tools/build_mode_rounds.js → node tools/build_source_battles.js；两者支持--check。后者还依赖已分类battle_data与enemy_database，输出source_battles.json供运行期读取 |
| 敌群计划与六模板换算 | node tools/build_enemy_encounters.js（支持--check）保留实战覆写和独立数量属性；enemy-replacement.js / run-setup.js 接开局、预览、主机和存档。验证：_enemy_replacement_smoke、_enemy_plan_source_smoke、_enemy_runtime_smoke |
| 商店/击杀金币 | build_economy.js（当前act2、shop为single_normal） |
| 策略/盟约 | build_strategy.js、extract_bond_data.js、build_op_bonds.js |
| 装备/装置 | build_equip_data.js、build_items.js |
| 第一季训练经济 | tools/extract_training_config.py用父`.venv`的APK依赖环境定向解出battle_misc_table；`node tools/_training_economy_smoke.js --source-only`自动选择该环境并核产物，运行检查省略--source-only。不重扫完整OBB，不外推正式/第二季配置 |
| 元素损伤/爆发/抗性与敌人分级目录 | node tools/build_elemental_data.js；支持 --check，原始 buff、源属性和图鉴enemyLevel，不改 source_battles |
| 干员全部技能等级 | node tools/build_operator_skill_levels.js；支持 --check，输出按skillId共用的源等级差异，消费端skill-levels.js；不会生成技能行为 |
| 客户端属性图的Web适配 | python -B tools/build_client_stat_buffs.py；支持--check，复用父项目不可变证据库/严格图编译器，只导出Web已支持的自增益契约。游戏运行只加载生成JS，不依赖Python或父研究目录；来源与行为见[属性图专题](../mechanics/client-stat-buffs.md) |
| 最终防御与模式合同 | tools/inspect_attack_contracts.py读取现有SQLite/原生，保存14同合同候选及15方法；父编译器输出的mode_graph或attack_constants须由Web显式适配。`node tools/_client_stat_buff_smoke.js --source-only`同时核生成一致及七项适配器拒绝边界，不把相同形状自动计入执行 |
| 最终防御消费者 | `node tools/_final_defense_smoke.js`核银灰十级源字段、真实侵蚀/承伤、Boss/链接/面板及鉴权恢复；ArkAttributes version2让已有最终因子覆盖末端平加，不证明所有旧负修正类别 |
| 比例自疗与受保护参数桥 | tools/inspect_self_heal.py保存SelfSelector/ApplyHeal/Entity的20原生方法及真实skcom_heal_self图；父DPS三个治疗模型独立于伤害覆盖，Heal.NewHealNode/DoSetData桥仍严格拒绝。不要重复同保护页解码或把现有Web三个自疗重计新增 |
| 胄子实体转伤 | tools/inspect_enemy_transfer.py定向恢复modifier事件/原生调用；build_enemy_passives.js共用根被动数据。`node tools/_enemy_transfer_smoke.js`核真实入站伤害、BOSS等级覆写、弹体及鉴权恢复 |
| achunt首领死亡清理 | tools/inspect_achunt_cleanup.py定向读取四个根标记和InstantKill→Suicide→SetHpInternal，`node tools/_achunt_cleanup_smoke.js`核同场标记、复活/坠落/漏怪/直接置零、即时胜利及鉴权恢复；TARGET转伤桥和多个首领组合仍拒绝 |
| 炎国短刀单件叠层 | `node tools/build_equip_skill_stacks.js --check`核共享GlobalBuff/8节点及两季普通/进阶数值；`node tools/_equip_skill_stacks_smoke.js`核施法后叠层、满层RNG、旧静态mods修复、购买奖励与恢复。`python -B tools/inspect_equip_skill_stacks.py`重建15方法/4布局。多件归并/同次瞬发优先级未核 |
| 防暴盾条件命中 | `node tools/build_equip_protection.js --check`核真实GlobalBuff/4节点动作及两季独立数值；`node tools/_equip_protection_smoke.js`核真实来源、动态阻挡、购买/穿戴/合法空槽与房主恢复。多件去重是本地约定，环境实例归并仍未证 |
| 训练同版活动表与生命 | `../.venv/Scripts/python.exe -B tools/inspect_training_activity.py --check`定向重读已定位匿名FlatBuffers，不扫全包；`node tools/_training_runtime_smoke.js`核新局45/剩余生命恢复/跨模式及既有第四轮源HP。NPC转换调用方和JP/CN均缺号的运行处理仍是恢复入口 |
| 敌人能力 | extract_enemy_abilities.js保留源表能力参数；执行语义另读已提取enemy prefab、Buff动作与EnemySkill/TriggerEnemySkill原生方法 |
| SQLite和配套导出 | build_db.js；先检查覆盖文件，勿把旧常量覆盖当成源数据更新 |

源表字段、产物与消费者只在data-inventory维护。保留源ID、版本/哈希和原始blackboard，未理解字段不要猜成机制。

## 资源查找与导出

技能/敌方/装备/环境逻辑已有[批量提取入口](../research/client-logic-pipeline.md)。当前`work/client-logic/`已含原组件、顺序动作、metadata和部分原生汇编，先读取它们；敌人调度、经济、机变和阶段转换的具体方法见[领域入口](../research/native-domain-entrypoints.md)。按源`prefabId`与引用图连接执行器，集中报告未解析节点，不从每条描述重猜效果。

`python -B tools/extract_client_logic.py --recover-metadata --enemies --operators`用于新快照或修复提取范围，日常续做不重复运行全提取；只刷新metadata/方法目录时有`--native-only`。源包、语言、版本和SHA须保留，不能把新包输出无标记覆盖为旧版证据。提取器只写研究输出，不自动增加运行期支持、DPS可计算项或验收勾选。

已有输入 `work/main.obb`，资产索引 `work/inventory.sqlite`。先查询再定向导出；只有索引缺失或换包才重建。

旧索引不保证覆盖匿名`.bin`包；已找到的MonoScript和battle_misc_table都来自匿名容器。名字查询无结果时，先核包清单与AssetBundle内部目录，再增量补确实缺失的包；不能把旧索引未命中当作APP没有该配置，也不因此每轮扫描全包。

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

详细历史bundle样本保存在[资产管线归档](../archive/20260908/docs/asset-pipeline.md)。无需重复导出当前已用的全部头像。APK/IL2CPP原始逻辑已成为批量机制研究的现有入口；原客户端或私服无需运行，Web游戏也不依赖这些研究工具启动。早期XOR失败记录不表示当前方法目录和可读函数不可获取。

## 联机、启动与交付验证

操作与方案见[联机专题](multiplayer.md)。开发底层服务为 `node tools/room_server.js`，默认 `127.0.0.1:8001`；需要时指定 `--port 8003`。服务端用隔离 VM 复用浏览器规则，修改模式源码须构建并重启服务，仅刷新页面不能更新已缓存规则。

| 验证范围 | 入口 |
|---|---|
| 本机依赖与中文路径 | `powershell.exe -NoProfile -ExecutionPolicy Bypass -File tools/_room_node_bootstrap_smoke.ps1`；使用测试 ZIP，不安装系统依赖 |
| 启动、进程和页面生命周期 | `_launcher_window_smoke.js`、`_game_process_smoke.js`、`_room_startup_smoke.js` |
| 大厅、名片和入口 | `_room_server_smoke.js`、`_room_profile_smoke.js`、`_room_home_smoke.js`、`_room_entry_smoke.js` |
| 权威战斗与恢复 | `_room_battle_runtime_smoke.js`、`_room_battle_session_smoke.js`、`_room_battle_server_smoke.js`、`_room_lifecycle_smoke.js` |
| 本地资源与轻心跳 | `_room_web_client_smoke.js`、`_room_presence_smoke.js` |
| 完整发行目录 | `node tools/_room_package_smoke.js <实际发行目录>`；不打开浏览器，使用包内运行时与真实本地 HTTP |

表中简写的 JS 位于 `tools/`，用 `node tools/<文件>` 执行。日常集成纳入哪些组以 `check_game --list` 为准。实际组网专项 `node tools/_room_online_smoke.js` 会启动本机 EasyTier 核心；`--public-relay` 连接公网中继，只在明确测试网络时运行。`node tools/_room_share_smoke.js [通用包目录]` 验证真实分享码组网。

完整包由 `tools/Package-Room.cmd` 制作。覆盖更新需要两个已存在且已验收的发行目录：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File tools/package-room-update.ps1 -BasePath ".\dist\旧通用包目录" -NewPath ".\dist\新通用包目录"
node tools/_room_update_package_smoke.js
```

工具按 SHA256 只收变化/新增文件，保留个人配置，拒绝目录外输入、链接、输出覆盖及无法表达的文件删除。若新版删了旧包文件，改发完整包。使用方法见[联机说明](../../联机使用说明.txt)。按用户持续要求，每完成可验收大项即制作完整包；本地打包不等于上传或对外发布。

## Boss逻辑与观测交叉核验

```powershell
python tools/slice_reference_video.py <视频> <输出目录> --prefix extra --times 120,280,2490,2720
node tools/build_boss_mechanics.js --check
```

Boss生成器目前只消费早期定位的3个AB子集，不能据此把现有研究资源范围限为3个包；全敌方预制体和共享动作已在`work/client-logic/`。先追模式条件、技能调度和装置引用，执行缺口见[Boss报告](../generated/boss-mechanics.md)。已有[录像切片](../../assets/reference/video-audit-20260910/index.html)与[阶段审计](../archive/20260913-cleanup/video-review-20260910.md)用于交叉核验；只有剩余时序/运行时分支才补定向观测，不为单项未知重解整包或重录整局。
