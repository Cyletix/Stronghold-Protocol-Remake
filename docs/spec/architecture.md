# Web 架构现状与目标

核对日期：2026-09-14。离线游戏仍在浏览器内运行；联机由主机维护每人的运营、普通战与随机状态，联防/Boss消费配对输入形成最多两组共享战场。浏览器只提交运营操作、渲染自己或队友的服务端快照。长期目标是以卫戍协议为重点的明日方舟 Web 复刻；本轮接线不代表复杂Boss规则和跨网稳定性已全部验收。任务顺序统一见[当前计划](../plan.md)。

## 实际运行链

```text
本地同版 gamedata / 带哈希的 APK、OBB、原生库 / 已保存的行为资料
 → tools 批量提取 prefab、顺序Buff动作、元数据与原生方法证据
 → 按明确规则/节点编译与构建 → web/*.json + 图片/音频
 → index.html → ArkState / session-commands / ArkRender
 → engine.js + mode.js → Canvas2D 战场 + DOM 界面
```

[客户端逻辑管线](../research/client-logic-pipeline.md)已输出478个逻辑包及部分可读原生方法。`work/client-logic/`是研究产物，运行时继续加载生成数据与已实现执行器；没有把提取JSON或原生地址直接当作可执行C#。尚未替换的描述分类属于旧运行路径，新增机制应按真实prefab/组件/事件与原生语义确认，未知节点保留拒绝原因。

父工作区通过显式导入将提取物保存为独立的`data/derived/client-logic/<evidence_id>/logic.sqlite`，由`src/arkresearch/client_logic.py`查询；DPS数值仍取独立的`source_id`，严格图编译仅生成其已有执行器可消费的小模块。共用路径、查询和拒绝批次见[父工作区客户端逻辑入口](../../../docs/client-logic.md)，不让父项目运行时隐式依赖本子项目目录，也不把JP证据和CN参数合称同版数据。

| 文件/模块 | 当前职责 | 仍存在的边界问题 |
|---|---|---|
| web/mode/data.js | 配置、全局状态适配、固定养成入口 | 多份目录数据和旧全局共存 |
| web/mode/rules.js | 加载、名册、属性、经济和部署规则 | 规则与加载混合，部分直接修改 G |
| web/src/rules/diy-roster.js / web/src/ui/diy-selection.js | 非固定六星的四槽配置、严格资格、两季势力/协防映射；主页/房间共用编辑器，主机按席位保存 | [甄选编队](../mechanics/diy-roster.md)；原型/好友助战和角色专属机制完整度分开验收 |
| web/mode/garrison.js | 按赛季/普通精锐解析专属特质，运营事件、战斗叠层、传递和属性；单机/房主共用 | 定制品池、部分权重、复杂弹药与状态来源仍缺，见 [特质接入记录](../mechanics/garrison-implementation.md) |
| web/mode/strategy.js | 开局、策略选择和效果 | 效果解释和界面耦合 |
| web/mode/decision.js | 决策与道具使用 | 操作、规则和弹窗混合 |
| web/mode/save.js | 休整快照、版本/目录/完整性与实体校验、敌潮计划与种子恢复；旧无计划休整档保留旧波次 | 依赖现有G与目录，战斗快照未迁入；不能在读档时重抽新计划 |
| web/src/simulation/ | 源地图转换、波次调度、固定步长与逻辑随机；paired-battle保留归属并转换联防平移/Boss镜像，已用于主机共享战斗 | 动态分支/随机组合/巡逻循环仍有差异 |
| web/src/simulation/elemental.js / elemental-operators.js | 元素损伤积累、爆发、恢复、抵抗/抗性；5 名当前干员的明确处理；普通对象状态可随房间快照恢复 | 参数/近似及缺口见[elemental-damage.md](../mechanics/elemental-damage.md) |
| web/src/simulation/enemy-cold.js / enemy_cold_data.js | 三个明确敌人的死亡寒冷、冻结状态和条件攻击倍率；engine延时结算，渲染与房主VM共用 | [参数与验证边界](../mechanics/enemy-cold.md)；完整状态来源及其他冰系技能未完成 |
| web/src/simulation/common-skills.js | 27个精确公共ID：回费、增益、自愈、部署增益与扩格；源参数由rules装配，engine执行与结束清理 | [公共回费技能](../mechanics/common-cost-skills.md)、[公共增益](../mechanics/common-buffs.md)；固定养成验证与资料库、其他个体机制分开记录 |
| web/src/simulation/medic-skills.js | 18个医疗技能主体；技力光环、开启/敌人倒下触发、录武官条件治疗与莎草屏障模组；属性共用计算层，源玩家/部署代次/时钟随主机快照恢复 | [医疗技能及边界](../mechanics/basic-actions.md)；链跃/远距几何、复制体叠加、屏障覆盖、特殊SP事件、致命伤和精确时序、完整天赋/模组另核 |
| web/src/simulation/operator-combat.js、render/battle-presentation.js | 蜜蜡S1/S2切换、沙之碑源实体与退场、基础闲时回复 | [蜜蜡范围与待核解释](../mechanics/operator-mechanics.md)；隐藏身份不进入普通商店，落点权重/出场时序和模组HP未核 |
| web/src/simulation/operator-combat.js、engine.js | 夕S1–S3、首次攻击生成/刷新小自在、真正击杀叠层；部署代次与主人归属保存在权威实体 | [夕实现边界](../mechanics/operator-mechanics.md)；默认X模组源范围/天赋已接，Y/ISW与跨副本互刷另核 |
| web/src/simulation/medic-drone.js、mode/tactical.js | 赫默技能库存、阻回、候选拖放/5费用、九格治疗、10秒一次性装置与共享鉴权；白面鸮/华法琳模组及赫默职业攻速继续由medic-skills消费 | [实体和模组边界](../mechanics/basic-actions.md)；跨轮库存、主人再部署继承、原版首末帧与其他光环/特殊装置能力待核 |
| web/src/simulation/client-programs.js / web/client_program_data.js | 从共享IR绑定源技能，解释六属性四乘区、Buff实例/寿命、生命比例与当前战斗状态；两端共用父侧编译器 | [程序执行边界](../research/client-program-integration.md)；未知节点/黑板、原版帧相位和保护页调度不自动放行 |
| web/src/simulation/attributes.js | 保留天赋前基础，普通正向攻击/防御与攻速加算；额外当次攻击与最终伤害倍率分层 | [属性边界](../mechanics/common-buffs.md#属性与传播)；装备/盟约、HP及负面修正类别仍有旧路径；resolveBoard和boardView必须传递attributeBase/basicAttack/combatTalents |
| web/src/simulation/hunter.js | 猎手源弹仓/装填、雪猎施法独立弹与我方寒冷；弹仓和状态随权威快照恢复 | [猎手与雪猎](../mechanics/hunter.md)；S2特殊敌方动作分类、全账号养成与其他猎手技能未验收 |
| web/src/simulation/mystic.js | 标准秘术师蓄存、深靛逐发束缚与S1/S2；根据信息装配特性，主机共用状态与计时 | [秘术师与深靛](../mechanics/mystic.md)；4个固定配置验证，其他秘术师专属机制及合并能量仍待实现 |
| web/src/simulation/tactician.js / flow-shape.js / blacknight.js | 战术点/狼群/磐蟹生命周期、独立流形复制、眠兽休眠与睡眠来源；候选拖放、复制窗口与主动撤退通过主机鉴权命令传递，战术点阵型可保存 | [战术实体专项](../mechanics/tactician.md)；手动复制窗口已接，精确拖拽物理仍是近似 |
| web/src/simulation/tactical-specials.js | 樱桃残骸/两技能、牙猎犬/限次挂弹、指挥中心/三技能/迟钝；状态与延迟事件随签名快照恢复 | [七名战术家](../mechanics/tactician.md)；精确物理、未确认黑板和特殊敌人时钟仍单列 |
| web/src/simulation/dollkeeper.js | 四名标准傀儡师形态与9个精确技能ID、独立纸偶；形态/技能/实体随鉴权快照恢复 | [傀儡师专项](../mechanics/dollkeeper.md)；风丸/归溟幽灵鲨20个实际固定配置，贝娜/维荻4个源样例；原版转场帧与非标准形态仍待完成 |
| web/src/simulation/boss-mechanics.js | 源prefab受击区/固定站位、指定普攻目标、低血机制、按模式与源CD产生技能事件，engine消费伤害和元素损伤 | 昆图斯自动阶段转换/预设子代、其他Boss复杂分支仍缺；不等于完整Boss状态机 |
| web/mode/equip.js | 装备、合成、拖拽适配 | 直接调用引擎与界面 |
| web/mode/battle.js | 源轮次/关卡选择、按持久化计划替换本轮六模板、共用预览/开战目录、联防近似和结算 | 动态token/额外援军、分支动作与复杂敌方技能未补齐；计划外回合沿原关卡 |
| web/src/simulation/enemy-replacement.js | 类型排期、按半程/禁用/权重选池、随从关联、float32强度预算/数量/间隔；首wave首fragment六模板替换 | [JP默认原生分支证据与边界](../research/enemy-replacement-native.md)；具体PRNG/热修/服务器覆盖未核，不能当作同种子逐值复现 |
| web/enemy_encounters.json | 两季敌群、随从/权重/前后半/禁用、324随机池和专用覆写；325个实际作战定义，另存数量fallback属性 | 由build_enemy_encounters.js导出并已供正式替换器消费；数量fallback与专用作战覆写不能混用 |
| web/mode/settlement.js | 真实用时、逐轮结果快照、两屏个人结算 | 没有真实队友结果或服务器经验/奖杯/称号；不等于四人同盟结算 |
| web/mode/ui.js、roster.js、debug.js | 战局 UI、454人资料/练度库与两季独立固定名册筛选（I 95 / II 112）、调试入口；rosterLibraryEntries仅建立展示索引，不扩大ROSTER或商店池；styles/roster.css共用主页与局内布局 | HTML action 和 window 回调仍存在；资料可见不代表个体机制已接入 |
| web/src/domain/game-state.js | catalog/session/battle 根、命令分发、事件 | snapshot 只冻结根，内层仍是可变 G/B 引用 |
| web/src/rules/session-commands.js | 部分经济、冻结、回合命令 | 尚未覆盖全部状态写入 |
| web/src/rules/hidden-boss.js | 两赛季社区隐藏门槛、参与玩家当前层数/生命的纯计算；联机输入同盟真实记录 | 客户端阈值未Verified，不能由本地判定自证原版规则 |
| web/src/simulation/operator-combat.js | 共用攻击形状、明确技能处理、战术装备生命周期、模块化伤害与状态；本机与房主 VM 同源 | 未接技能仍用旧分类；范围/时序近似见[攻击机制](../mechanics/operator-mechanics.md) |
| web/engine.js | 战斗、索敌、移动、技能、画面、相机、输入 | 模拟与表现未形成独立可替换模块 |
| web/src/ui/shortcuts.js | A 收展商店、S 冻结、D 刷新、G 升级、C 准备；触发现有 HUD 按钮，保留二次确认与联机命令入口 | 仅休整阶段，输入法/文字输入、弹窗、隐藏或禁用按钮、按住重复事件不触发；`_shortcuts_smoke.js` 与 `_room_game_client_smoke.js` 验证 |
| web/src/render/render-policy.js | 质量档位、可见性和对象池工具 | 不等于完整独立渲染器 |
| web/index.html | 页面结构、样式、脚本装配 | 大量 DOM/CSS 集中于入口 |
| web/solo-session.js、src/rules/run-setup.js | 单人配置传递、赛季目录、与多人共用轮次/Boss/禁用及独立enemySeed生成的敌潮计划 | 单人不建房间或发送心跳；本地HTTP仍提供资源和名片保存，战斗在浏览器运行；训练固定类型与禁用抽样仍是本地约定 |
| tools/room_server.js、web/room-lab.html/js | 四席大厅、房主统一启动、鉴权/重连、按房间串行处理操作；静态ETag和API gzip | 房间与进度只存内存；用户已验证异地连通，四人长局负载/弱网与HTTPS适配仍待验证 |
| tools/lib/room-game-runtime.js | 每玩家独立VM复用mode/engine，执行运营、固定步长战斗和过轮；失败回滚、G/B/RNG/待选项快照 | 不开放客户端状态patch；目录/规则缓存需重启更新，复杂规则沿用仿真实现边界 |
| tools/lib/room-battle-session.js | 统一时钟/轮次选择、准备门槛、普通独立战、联防/Boss共享战、3秒过轮等待、基地升级和伤害节点事件 | 无主机迁移、磁盘续局或战斗回放；共享结果完整验收见联机专题 |
| web/room-game.js | 运营意图提交、断线禁写；完整快照与ack确认恢复、取消未执行旧操作、队友只读观战和席位镜头 | 响应结束后100 ms再轮询战斗全量状态；已测样本负载见[体验核查](../research/data-inventory.md)，动态位置插值已接；仍缺真实四人带宽验收 |

**web/mode.js 是生成物**：`tools/build_mode.js` 按十三个 mode 源文件的依赖顺序拼接。修改源码后构建，用 `--check` 检测漂移。文件拆分已有进展，剩余任务是行为边界迁移。

## 已实现与未实现

| 方面 | 已有实现 | 尚未达成的目标 |
|---|---|---|
| 状态边界 | ArkState 根和部分 command handler | 所有写入走命令、深只读 FrameSnapshot、独立 BoardWorld |
| 运行循环 | 离线ArkSim固定1/30秒tick；联机主机按1/30游戏秒推进2倍速，倒计时独立按真实秒；浏览器远端模式只渲染 | 完整输入命令化与战斗回放；主机卡顿及长时间压力实测 |
| 随机性 | 可保存的逻辑seed/state；敌潮用独立enemySeed和持久化enemyPlan，同房共享，预览/情报不推进逻辑RNG；粒子用独立Math.random | 原版PRNG逐值对齐、完整命令回放、战斗状态校验 |
| 渲染 | 当前战区离屏表面与像素预算、静态地形/投影缓存、动态层、三档质量与上下文恢复；独立普通战与共享战快照切换，右侧席位镜头 | 自动档不由CPU/RAM推断高档GPU；真实移动设备和重负载待测，见[性能记录](../development/performance-baseline.md) |
| 空间查询 | 数组 filter/扫描/排序 | 格空间桶，避免逐攻击者全量扫描 |
| 多人形态 | 各自运营/普通战、联防/Boss最多两组共享战、同房队友观战、每组独立Boss血量和25/50/75%动态 | 复杂阶段与Boss行为校准；跨设备、跨网和持续运行验收 |
| 保存 | 离线账号/休整存档；联机页面刷新恢复主机内存中的战斗 | 服务重启续局、主机迁移、跨版本迁移 |
| 数据加载 | 分项 JSON；mode_rules 有 schemaVersion 校验 | 统一目录 schema、资源 manifest、赛季隔离和缺失诊断 |

`server/`、`client-patch/` 不被游戏加载。`tools/run_server.py` 提供本地静态文件与调试截图接口，不运行游戏规则。

联机运行链为 `room-lab/room-game → HTTP room API → room-battle-session → 各玩家VM/共享战斗 → G/B快照 → Canvas/DOM`。`node tools/room_server.js` 默认监听127.0.0.1:8001，`/`和`/room-lab.html`为大厅；局域网需显式`--host 0.0.0.0`。服务仅提供web静态读取及房间API，不提供仓库/data读取或文件写入。房主PC即可运行，无需先租Linux主机或配置SSH；异地可达性仍需组网/隧道等条件，见[multiplayer.md](../development/multiplayer.md)。

房间命令包括`room/set-config`、`room/set-ready`、`room/start`、`room/start-local`、`room/kick`、`room/set-profile`和`room/return-lobby`；hostId/creatorId、稳定slot与lobbyPhase由主机管理。waiting阶段settings由房主确定，修改清除全员准备；start冻结有效config，game-enter仅接受该配置和个人策略。1名成员也可启动，使用对应单人源模式，2–4名使用同盟源模式，地图必须在目标模式中合法，不隐式替换。单人入口不创建服务端房间；旧playMode=solo HTTP接口仅保留兼容，新的单人客户端不调用。多人房间容量为4，单人启动通过room/start-local冻结并转本机，禁止再game-enter分配VM；重试返回同一配置与seed，临时席位最终释放。游戏协议为`room-game-20260910.3`，写操作校验runId，游戏接口另校验目录指纹、gameSequence和expectedRevision。操作revision与计时frame分开；失败回滚G/RNG及临时选择，不接受客户端战斗、伤害、结果或任意状态patch。查看队友通过game-sync的viewPlayerId选择本房间快照，写入始终鉴权到本人。断线等待、只读恢复、结束重开及本机配置边界统一见[联机专题](../development/multiplayer.md#恢复缓存与验收边界)。

加入者以`room-web-client.js`在本机提供web静态文件，只有白名单API经EasyTier转发；不额外运行仿真。开局前比对本地页面/规则指纹防止混包。`room-presence.js`在大型资源之前启动轻心跳，`presence`接口独立于战场命令队列；首战前加载等待不触发弃权，快照未准备好不推进战斗。主持人可取消启动；首战后的实际掉线和画面同步等待分别处理。

所有成员进入后消费准备时间，存活玩家全部就绪才开始自动战斗；房间控制器等待本轮所有战场结束，再经过3秒间隔统一过轮。每组共享战场只有一个模拟驱动；各成员读取同一B，但保留各自运营与结果。响应包含battle/battleLevel/battleView、成员级别/生命/阶段和同盟事件；远端engine循环不推进模拟或真实计时。前台准备约500 ms、战斗约100 ms轮询，后台2秒；超时取消准备并暂留席位，已开始的战斗继续运行。

页面刷新只恢复仍在主机内存中的身份和进度，不写个人离线存档；服务重启后房间及战斗全部丢失，没有磁盘续局和主机迁移。静态资源使用ETag重新验证，未变更返回304；API no-store并按协商gzip压缩较大JSON，HTML/JS/CSS/JSON/SVG使用流式gzip。缓存减少后续资源重传，不消除实时快照流量，随机域名变化也会影响缓存复用。

大厅配对预览只随成员变化更新，不代表游戏存活配对。真正开战由room-battle-session使用主机当前生命、pairSeed和轮次形成并保存分组；准备、观战、刷新与短暂断线不会重抽本场席位，客户端不能改生命或淘汰状态。

## 多人战场契约

这是用户已明确、并于2026-09-10再次纠正的实现目标，来源为[原需求I-20260902-003及后续勘误](../../assets/todo.md)和[归档架构8.1](../archive/20260908/docs/mode-architecture.md#81-三段式地图)，不依赖联机传输方案是否完成。

- 房间最多四名玩家；每人保留独立运营与普通战状态，**普通战不合并为两人共享战场**。联防和Boss阶段才按存活名单两两随机配对，一个共享战场最多两人，剩一人时独占左侧。玩家ID、原单位ID、装备各自保留；合并输入使用带玩家归属的唯一实体ID，不能因两人都拥有单位“1”而覆盖。
- 普通准备、作战和联防使用B区，普通战各自进行；后续联防在结果明确后，仅把没漏怪且存活的玩家依原左右顺序填入两个位置，只剩一名防守者时放左侧。漏掉的敌人以初始状态从右侧红门向最左蓝门行进；仅一名防守者时从左半图出怪。右侧阵型使用平移，不能套Boss镜像拓扑。
- Boss准备与作战使用C区，没有后续联防阶段。存活玩家随机分组并分配左右侧；右侧玩家以自己左侧坐标中的阵型作左右镜像，朝左/朝右互换，朝上/朝下保持。每组共享一个Boss血量，最多两组独立战斗；25%、50%、75%节点按组广播一次。
- 镜头选择和观战不转移单位所有权；被淘汰玩家可以观看现有战场，不获得部署权限。源地图有边缘留白、功能格和非对称部署掩码，左右/中央列区间必须由地图适配显式给出，不能把半屏像素或总列数一分为二当部署坐标。

2026-09-12 收尾与镜头：engine 在各伤害阶段之间检查实际领袖的最终死亡，以 `leader-defeated` 结束战场，避免结算切换状态后继续处理旧战场的漏怪/弹道。单人立即沿既有 `nextRound` 进入结算或已解锁的隐藏关；房间仍等待所有独立共享组完成，Boss 胜利全员完成时直接过轮。渲染将 `__winRect` 的镜头取景与 `battleClipRect()` 的战区裁切分开，Boss/联防取完整地图宽度；地形投影缓存、单位和弹道可见性使用同一裁切范围，部署归属不变。

固定大型 Boss 的本地显示约定：`largeBossArtBox` 读取固定站位与受击矩形，将 `enemy_avatars` 的完整图鉴图片按原比例放入该区域，不使用圆形裁剪、橙圈或攻击摇摆；图像画在范围效果、小怪、干员和弹道下方。没有把 `enemy_portraits` 内的拆散 Spine 图集误当完整立绘，也不宣称已还原原版 Boss 模型/动画。当前覆盖目录中的 5 个固定 Boss 配置，普通敌人保持原显示。验证：`tools/_boss_art_smoke.js`。

[Verified源地形] 已核对的源地图为21列×19行；[提取目录](../../web/source_battles.json)的C区buildable掩码允许部分c8/c12，部分行也允许c9/c11，不能把“Boss视觉占中央五列”转译为这五列全部禁部署。来源转换见[build_source_battles.js](../../tools/build_source_battles.js)。当前源地图适配使用`sourceGeometry`与逐格掩码：Boss左侧本地列2–9，中央列10，右侧列11–18，镜像为`20-col`。这里的区间用于归属映射，区间内是否能部署仍由源格决定；用户描述的视觉跨度不替代源地形，也未由此推断未知Boss技能。

`paired-battle.js`提供确定性配对、联防筛选和带归属的可逆坐标转换；room-battle-session已将真实部署输入交给engine，并以共享结果更新各成员。普通联防重建真实漏怪路线，Boss使用本轮源波次；主机统一轮次选择，防止同房成员抽到不同首领。部署候选区、右侧镜像及联防平移是不同边界，不能互相套用。专项入口为`_paired_battle_smoke.js`、`_room_battle_runtime_smoke.js`和`_room_battle_session_smoke.js`；具体通过范围统一记在联机专题。

## 必须保持的契约

- 候选格由 `level.grid[row][col] === 'tile_achand'` 判断，不能用最后一行或颜色代替。候选实体不参与战斗；部署、撤回、交换和装备目标不能因拆模块变化。
- 基础属性、阶段常量、范围、天赋资格、详情养成使用同一配置。卫戍协议账号练度通过源表自持有加成影响属性；潜能继承与原型替代的完整语义待核对。
- 生成数据不能只改 JSON；同时修改生成源或显式补丁并检查消费者。act2 优先、act1 补缺是兼容方案，不能当作赛季独立目录。
- smoke 证明本项目行为；客户端一致性须由源数据或行为证据支持。

## 后续架构方向

目标依赖方向为 `DataCatalog → GameState/Rules → BattleWorld → FrameSnapshot → Renderer/UI`，输入返回命令。每次迁移一个完整行为，移完写入与消费者才撤销旧适配，避免只搬目录。

近期顺序统一见[当前计划](../plan.md)，[问题分类表](../research/data-inventory.md#priority)保存缺口与消费者定位。按客户端共同组件/动作/原生方法成批扩展干员、敌人和模式机制，同时校准共享战场阶段/复杂Boss行为；快照流量、异地验收、空间索引、磁盘续局及WebGL/Worker按独立切片推进。

性能目标：桌面 Chromium、1920×1080、DPR 1；模拟 tick p95 ≤6ms（降级线10ms），总帧 p95 ≤16.7ms（25ms），无 >50ms 长任务，活跃战斗内存 ≤512MB（768MB），一分钟无持续增长。压力负载为64干员/320敌人/1500弹道/4000粒子/每秒200次范围事件。这是目标预算；已测结果与局限只记录在 [performance-baseline.md](../development/performance-baseline.md)。

分发与异地连接验收统一见 [multiplayer.md](../development/multiplayer.md)。通用包的根路径与index.html共用原游戏主页，干员、编队和设置在原页面打开与关闭；作战终端按用户要求暂未开放；room-lab.html?mode=solo是卫戍协议唯一的四席准备页，单人固定第一席；单人/多人、赛季、难度和地图均在卡片下方选择。旧room-start.html仅替换跳转到该页，不渲染第二套界面。单人准备直接读取本地数据，index.html?solo=1进入浏览器仿真；不创建HTTP房间，不发送presence/game-sync/game-command。多人创建或加入同一服务。房间统一配置，启动后依次显示开局情报1/2与选择策略2/2，保留原矩阵布局和展开动画。策略页返回情报，情报返回房间；不得由轮询强制跳回已开始对局。纯静态开发服务保留本地单人入口，不能冒充已连接的多人房间。


### 启动器与页面生命期

默认入口为“开始游戏.cmd”，进入唯一的原主页。`room-launcher.js`管理本机会话，`launcher-window.js`在首页／模式面板／大厅／战场建立本机页面连接，`launcher-windows.js`在最后一页关闭后给15秒跳转宽限，再回收整个启动器。保活令牌只授权页面生命期，不授权管理API。`game-process.psm1`通过Windows Job约束本启动器及全部后代，强制关闭窗口也回收EasyTier；不扫描或终止其他同名进程。浏览器通过一次性地址交接由外层启动器打开，不进入游戏Job，回收时不会连带关闭其他浏览器标签页。具体退出、重试与后台运行边界见[联机专题](../development/multiplayer.md#关闭网页与进程回收)。

### 统一视觉来源

[Verified，仅限可见样式] 用户提供的[原版首页](../../assets/picture/MuMu12-20250501-161011.png)、[四席结算](../../assets/picture/MuMu-20251117-035840-254.png)、[战斗界面](../../assets/picture/MuMu-20251118-042535-098.png)及[作战结束](../../assets/picture/MuMu-20251206-223417-147.png)可直接确认：立绘配合方形信息块、深色半透明材质、细线／扫描纹理、青绿确认和橙红作战强调。截图不能证明新的联机退出或点击规则。

`web/styles/protocol-theme.css`统一首页、卫戍面板、大厅、开局情报和局内HUD的颜色、字体与面板材质。原主页保留五个功能入口和本机存档／当前房间续玩入口；主页立绘随名片头像更新。`web/ui/protocol-grid.svg`是根据上述视觉特征绘制的本地背景，不宣称是客户端提取原图。四席准备页依据[原版大厅参考](../../assets/reference/video-audit-20260910/detail-0020.jpg)恢复紧凑顶栏、竖向立绘、底部小头像/姓名和就绪渐变；模式与配置集中到底部是用户要求的布局。单人和联机复用同一套卡片渲染，手机窄屏保留四席横向滚动。房间配置、情报1/2、策略2/2与策略展开位置仍分别由原模块控制；主题不改变战场坐标、拖放判定和网络状态。

### 2026-09-12 体验修复接口

名片只在原主页的 dialog 编辑，房间和模式页链接回主页；昵称在房间内按已有占用追加 #2/#3，包下的个人配置保留用户原名。首领与禁用名单由 roomSetupInfo 在开局按 room.pairSeed 生成一次，G.bannedOperators 用于商店、策略赠员与晋级候选过滤，情报页和局内情报消费同一名单。禁用抽样仍是已标明的本地策略。

渲染新增 src/render/battle-presentation.js。服务器判定仍为 30 tick/模拟秒，模式默认二倍；RAF 绘制上限改为 60 FPS，基于 visualId 对相邻快照的敌人/弹道坐标做显示插值，镜头/回合变化和传送断开插值，不写回权威 B。伤害数字在实际扣血处记录，随快照同步；普通象牙色，已生效暴击红色。精锐与合成反馈独立于阶数显示。普通作战关闭敌人预览与左右切换，Boss 作战保留左右切换并落到屏幕底部。

本次预览使用`src/render/enemy-preview.js`的独立确定性散布，并以有效格包围盒适配镜头。不得调用逻辑RNG或回写战斗出生点。音效资源在引擎预加载，`emitBattleSfx`只在实际事件时记录`B.audioSequence/audioEvents`（最多64条）；`room-game.js`消费序号并跳过旧事件，部署准备的声音按阵容快照变更触发。`arknightsAudioV1`向后兼容扩展`effectsMuted/effectsVolume`，主页、setup和局内按钮共用原生dialog；打开声音面板不暂停联机时钟。`normalizeOpAccount`统一预设、持久化读取和详情修改的阶段/等级上限，模式固定练度继续独立。

2026-09-12 基础行动：uild_basic_attacks → basic_attacks.js → finalizeOperator/boardView → engine 区分伤害、治疗、持续回复和条件行动，普通/精锐读对应阶段trait黑板；配置参与客户端/主机目录指纹。治疗视觉事件存于权威战斗快照，恢复时无需浏览器补算。[实现与剩余缺口](../mechanics/basic-actions.md)。

### 局外技能和统一装备详情

skill_choices.json由原始技能列表生成；ACCOUNT.ops[charId].selectedSkill记录本机选择，chooseBand冻结非默认选择到G.skillChoices。finalizeOperator只生成一个所选技能；未带该字段的旧局仍取原模式默认技能。game-enter可携带skillChoices，由room-game-runtime验证索引，逐席位初始化并通过快照恢复。装备以effectId读取equipment_details.json，通过renderDetailTabs与干员共用页签；消耗品走含unitId的game/equip，旧无目标game/use-equip拒绝。room-lab在用户点击创建同盟时才调用启动器，将配置交给创建房间请求settings，单人ArkSolo.launch不创建房间。
