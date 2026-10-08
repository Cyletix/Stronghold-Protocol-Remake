# 道具商店来源约束与经济取证边界

2026-09-14。已有12件商店装备的赛季身份、等级资格、隐藏过滤与购买价已接；后续接入防暴盾的有来源敌方命中条件，以及普通炎国短刀的施法叠层主体，市场可执行映射现为14件。进阶短刀沿现有奖励入口消费独立源值，不加入普通市场。第一赛季训练已消费开局45生命、资金与商店候选。105条来源目录仍不代表105件完整可执行道具。推进与剩余跨域条件见[当前计划](../plan.md)和[机制清单](../checklists/mechanism-research.md)。

## 客户端证据

**Verified（原生字段与消费）**：JP 36.7.22快照的`ActAutoChessTrapShopChessData`包含`itemId +0x10`、`goldenItemId +0x18`、`hideInShop +0x20`、`itemLevel +0x24`、`itemType +0x30`、`trapId +0x38`。

- `AutoChessShopLevelTrapGroupItemViewModel.LoadData`，method 149980，RVA `0x393ac98`：`0x393ae6c–0x393ae88`先比较条目的`itemLevel`与当前目录分组等级，再跳过`hideInShop`；随后跳过空`itemId`，以该条目创建卡片。
- `AutoChessShopTrapCardViewModel.LoadData`，method 149896，RVA `0x3936be8`：明确将`itemId/trapId/itemLevel/itemType`写入卡片的`chessId/trapId/chessLevel/trapChessType`。这不是通过装备描述或ID后缀猜等级。
- `AutoChessBattleShopCardViewModel._LoadEquipInfo`，method 152105，RVA `0x39d1b24`：按卡片`chessId`查道具棋子配置，并读取`purchasePrice +0x2c`与实际商品价作价格显示比较。商品实际价格与基础配置价可不同，不能据此否认服务器折扣。

**Verified（CN配置）**：[shop_items.json](../../web/shop_items.json)保留本地`activity_table.json`路径及SHA-256，由[build_equip_data.js](../../tools/build_equip_data.js)连接`trapShopChessDatas[itemId] → trapChessDataDict[itemId]`，保留两季全部46/59条市场记录，包括原始`hideInShop/itemLevel/itemType/trapId/goldenItemId`及`effectId/purchasePrice/isGolden`。两季相同效果可用不同商品ID、等级与价格：

| 效果 | act1 | act2 |
|---|---|---|
| 阿戈尔重刃 `eff_acarm046` | `chess_item_1_02_e_a`，Ⅰ级，1金币 | `chess_item_3_07_e_a`，Ⅲ级，2金币 |
| 歌利亚头盔 `eff_acarm049` | `chess_item_2_01_e_a`，Ⅱ级 | `chess_item_3_06_e_a`，Ⅲ级 |
| 海沟实验体 `eff_acarm078` | Ⅵ级，4金币 | Ⅵ级，4金币；旧静态表误为3金币 |

原生反汇编及字段可用`python -B tools/inspect_shop_native.py`重建至`work/client-logic/native-economy/`。二进制SHA-256为`d95820e25938778b8865571741c7d626d70662f82bc5bb3badf058fbd1e595af`。JP方法结构与CN数值表独立标识；没有证明跨版本热修一致，`XLua`覆盖仍是边界。

## Web接入与限定

`shopEquipmentPool`通过明确的`effectId`映射连接原有12件装备、防暴盾与普通炎国短刀。普通商店只从当前赛季、未隐藏、非进阶、`EQUIP`类型且等级不高于商店的已映射条目中抽取，并保留源`chessId/effectId`和基础购买价。原有单件效果实现、条件增益和未支持道具没有因此升级为完整验收；`TRAP`、消耗品及其他装备的市场条目已保留，但不因有源记录就进入现有静态装备执行器。

**Inferred（本地抽取的有界约束）**：上述原生方法直接证明的是商店目录按等级、隐藏标记分组；正式服务器的完整抽取函数尚未取得。运行端继续使用现有“可抽低于或等于商店等级”方式，并以来源目录约束候选。等权抽装备仍是本地近似，没有借用训练分支概率；有限库存、权重、特殊商品、折扣及服务器强制结果还未恢复。

无来源或无可执行候选时，对应道具位留空，不回退旧全量名单、不补成额外干员，也不为该空位消耗抽卡随机数。策略保证仍作用于首个干员位；保证成功后不会因前方道具位为空再插入一张补偿卡。冻结保留已有卡片及已报价，只对新抽卡应用当前资格，已有干员卡不重复触发首卡保证；购买扣卡片的已报价并保留来源身份。普通测试模式仍可使用旧静态目录。休整存档和房间快照保留当前商店，不在恢复时重抽；后续刷新使用同一随机状态与当前赛季来源。

### 防暴盾：有实际来源的命中条件

**Verified（原始资源与节点）**：JP `[uc]globalbuffs.ab`（SHA-256 `6d40ca918a3fd60b977060ca27e9c0bb37830067582638e3cb2a1dddf5869622`）的GameObject `2719474371526973555`名为`act1autochess_equip_acarm060_global_buff`，启用组件`4269577110593656947`通过脚本CAB/PPtr解析为`Torappu.Battle.GlobalBuff`。该组件挂无限期、不可沉默、最大层数1的`act1autochess_acarm060_buff`，不是常驻防御加成。

模板只有事件10（`ON_TAKE_DAMAGE`）的一条动作链：`CheckBlocked(BUFF_OWNER)` → `CheckBlocked(MODIFIER_SOURCE, checkBlockedBySource=BUFF_OWNER)` → `IfNot` → `ModifierScaleUp(damage_scale)`。79733 / `0x2651fe4`的特定来源分支读取敌人的`blocker`并与来源实体比较；81454 / `0x26ea918`先拒绝已取消modifier，再从黑板取显式scale key并乘入`Modifier.value`。两季CN `effectBuffInfoDataDict.eff_acarm060`都明确绑定上述globalbuff和`damage_scale=0.6`；生成器分别保存各季绑定，没有将JP组件哈希当成CN数值来源。

[build_equip_protection.js](../../tools/build_equip_protection.js)严格校验这一组件、模板及完整4节点形状，生成[equip-protection-data.js](../../web/equip-protection-data.js)。[equip-protection.js](../../web/src/simulation/equip-protection.js)只识别`riot_shield`和`eff_acarm060`两种已绑定装备身份。当前接线覆盖普通近战、敌方追踪弹命中、现有强化攻击与Boss延迟攻击的真实modifier来源；持有者正在阻挡其他活敌时，来自非自身阻挡敌人的500点入站伤害变为300点，被自己阻挡的攻击者仍造成500点。来源匹配使用真实实体/`visualId`，不按共享`enemyId`判断，也不要求敌人拥有不存在的`id`字段。

条件在`inflictDamage`命中阶段读取，飞行期间开始或结束阻挡会影响该次命中；不会把防暴盾乘区缓存进发射时的弹体伤害。眩晕/睡眠释放阻挡，冻结本身不释放。房间恢复保留弹体owner引用和当前阻挡关系，不另建技能计数或随机流。

**限定与尚未验证**：当前未知来源、只留数值快照的爆炸、DOT、自伤和`noSourceDamage`不据空指针推断为“非被自身阻挡者”，没有宣称恢复它们的原版效果；`skipModifierEvents`不派发装备事件。Web挂载点沿现有流程位于一次性指令护盾后、治疗吸收盾前，这些组合的原版事件优先级仍需单独核对。多件相同装备当前按一次0.6倍处理，这是本地约定：`disableOverride=1/maxStackCnt=1`和计数`NONE`不足以证明不同装备的上游globalbuff创建会去重。已读54736 / `GetOverrideKeyCandidate`与54737 / `EnsureOverrideIndependentKey`只处理key候选/迁移，尚缺`env_gbuff_new_with_verify`的多装备创建/归并入口。模块验收仅限单件的上述有来源敌方命中，不包括重复装备原版叠加、完整装备环境验证器、进阶防暴盾或NPC装备继承。

### 炎国短刀：施法叠层与普通/进阶公共图

**Verified（同一组件与完整动作链）**：上述JP globalbuff包的GameObject `4692246910491776102`名为`act1vautochess_equip_acarm024_global_buff`，启用组件`7994553950927869030`通过CAB/PPtr解析为`Torappu.Battle.GlobalBuff`。宿主模板`act1vautochess_acarm024_buff`初始黑板为`buff_cnt=0/basic_add=1`，不可沉默、无限期、非durable。模板只有事件33 `ON_SKILL_START`，依次执行`Dice(prob)` → 比较`buff_cnt < atk_buff_cnt` → 为`BUFF_OWNER`创建ATK `MULTIPLIER`子buff → `buff_cnt += basic_add`。子buff从黑板读取`atk`，无限期、非durable，`maxStackCnt=10`；不是装备穿上即生效的常驻5%攻击加成。

两季CN绑定均为`env_gbuff_new_with_verify`，计数类型`COUNTING`，明确指向同一个globalbuff。普通`eff_acarm040`为`prob=1/atk=0.05/atk_buff_cnt=10`，进阶`eff_acgarm040`为`1/0.08/10`。后续四个节点先比较计数与`get_gold_cnt`，再记录战斗信息并播放特效/音效；这两种CN绑定均没有`get_gold_cnt`，读取缺键回退0，已加至1–10的计数不会进入该分支。没有从日志名字推导获得金币或新增奖励。

**Verified（原生事件与随机消费）**：63706 / `Character.OnSkillStart`在`0x21bc8c4`调用`BuffContainer.OnSkillStart`；枚举默认值直接从metadata读取为33。81609 / `Nodes.Dice.Execute`读取概率，再调用19824 / `RandomExtensions.Dice(FP)`及19823 / `Dice(float)`。后者仅在非正概率时提前返回，`0x32aa6cc`抽取`Range(0,1)`，再以`MathUtil.LE`比较；概率1也会抽取。由于模板Dice在上限比较之前，满10层的再次施法仍消费一次随机数。79778确认宿主黑板比较与缺键回退，78955确认宿主计数运算。[inspect_equip_skill_stacks.py](../../tools/inspect_equip_skill_stacks.py)重建15方法/4布局至`work/client-logic/native-equip-stacks/evidence.json`，保留二进制与metadata哈希及保护页断点。

[build_equip_skill_stacks.js](../../tools/build_equip_skill_stacks.js)校验真实脚本绑定、组件、8节点形状和两季普通/进阶绑定，生成[equip-skill-stacks-data.js](../../web/equip-skill-stacks-data.js)；源对象与模板各自保存SHA-256，CN数值表另存原文件哈希。[equip-skill-stacks.js](../../web/src/simulation/equip-skill-stacks.js)在成功施法后累加可保存的角色计数，后续攻击沿现有属性加算层消费，普通上限+50%、进阶上限+80%。已有+50%加成的基础100攻击角色叠2层普通短刀后为160，而非165。技能结束、属性刷新和被保命阻止的死亡保留计数；真正死亡清除，新战斗不从休整棋子继承部署计数。盟友各自持有独立计数，房主快照保存源身份、赛季与层数，不新建随机流。

旧装备生成器曾将这两个环境黑板的`atk`误归类为静态`mods.atk=1.05/1.08`。现在仅这两个已取证ID改为`reactive`，原有通用分类保持。普通市场通过`yan_dagger/eff_acarm040`购买，进阶奖励保留`eff_acgarm040/tier=2`。初始化属性、装备穿戴与奖励/休整规范化均排除其旧静态mods，避免首层前已加攻或新计数重复加算。普通市场不因支持进阶效果而新增进阶卡。

**限定与尚未验证**：验收范围是单件普通或进阶短刀、成功施法计数、后续攻击加成和上述部署/恢复生命周期。当前挂点位于现有成功cast流程末尾；60808 / `BasicSkill.Cast`、60811 / `OnSkillStart`与54818 / `BuffContainer.OnSkillStart`主体受保护，尚未证明当次瞬发技能伤害、其他技能启动事件的原版先后。多件装备当前按槽序选一个已知profile，这是本地约定，不代表普通优先、进阶替代或原版多件叠层规则；`COUNTING`环境注册、完整装备验证器、跨buff优先级仍未恢复。JP结构、CN绑定以及Web可保存随机算法分别标识，不以本地重放证明原版随机算法或跨版本热修一致。

## 经济与训练路径的实际取证结果

**Verified（限定原生分支）**：`AutoChessDataBridgeLocalPlayer._RefreshRoundData`（66681 / `0x22a8184`）读取`miscConfig.trainingRoundInfos[round].coin`覆盖本地当前资金；`_RefreshShopData`（66683 / `0x22a304c`）读取`trainingShopInfos[level]`，`_GetRandomShopItem`（66684 / `0x22a896c`）累加`TrainingShopInfo.count`，调用战斗随机接口，再以`MathUtil.LE`逐项选择。该字段明确属于训练配置。`MultiPlayer.ReqShopUpgrade`（66726 / `0x22ac640`）则发送服务请求，不在该方法计算正式商店结果。

本地`ReqShopUpgrade`（66646）可读部分扣除当前升级价并加一级，未直接调用刷新；但`DataCenter.UpdateData(PrepareStateData)`（66316）与`AutoChessShopDataModel.UpdateData`（67530）所在页不可可靠反汇编，完整更新链仍缺。没有据此删除全部模式的现有升本刷新规则，也没有把训练资金覆盖到正式模式。

### 已定位的实际训练对象

**Verified（源对象，JP 36.7.22）**：此前的`inventory.sqlite`没有收录OBB内90个匿名`.bin`包，具名AB检索遗漏了真正来源。对这些匿名包增量读取AssetBundle别名后，定位到`assets/AB/Android/anon/a959234ee87bb46f582390ce3d081183.bin`，其实际别名是`gamedata/battle/battle_misc_table.ab`。TextAsset名称`battle_misc_table`，64位pathId为字符串`2437431838466217812`。它是加密JSON/BSON文本表中的`miscConfig.AUTOCHESS.act1autochess`，不是需要挂在GameObject上的MonoScript组件。解码复用父项目`src/arkresearch/apk.py:decode_text`的公开游戏格式：跳过128字节签名前缀，按格式常量恢复IV，再AES-CBC解码和PKCS7去填充；工具不会读取账户凭据。

| 源层 | SHA-256 |
|---|---|
| 匿名AssetBundle | `b81e8875c76bf094a2edbf2d420dfcacadefca00f4ca9697648ef8258c1fe70b` |
| 原始TextAsset字节 | `4d05e59f25fefb187f9292ab4554128a8301a02d0e42990eb985c3fff8d1ac98` |
| 解码后的原始表字节 | `0251d2495954e0829b59988a5351b7064e3de96ea2c9e8182898d18ae9cc934b` |

[extract_training_config.py](../../tools/extract_training_config.py)按别名、pathId和三层哈希定向重提，生成[training_config.json](../../web/training_config.json)。产物保留JP来源与独立CN绑定表哈希、全部训练资金/商店权重、NPC与第三轮六槽原始数据。CN`charShopChessDatas`按完整`chessId`绑定干员，26条权重均有精确ID；这证明当前绑定可解析，不能证明JP与CN热修版本或完整养成一致。此次原始对象只有`act1autochess`，没有生成第二赛季副本。

| 训练输入 | 源值与当前消费 |
|---|---|
| `initialHp` | 45；`chooseBand`只在act1的`mode_training_1`创建新局时设置玩家生命，后续回合与休整恢复保留剩余生命 |
| 第一至四轮`coin` | `3、8、6、7`；`roundMoney`只在对应赛季与`mode_training_1`返回源值，`startRound`覆盖余额，不把源值加到上一轮剩余资金上 |
| 商店一级 | 仅`chess_char_1_12_a`，count=12 |
| 商店二级 | 仅`chess_char_2_09_a`，count=10 |
| 商店三级 / 四级 | 分别10 / 14个固定ID，每项count=10；刷新逐次抽取，不从全体低阶干员重新组池 |
| 无匹配的赛季、轮次、等级 | 保留原有运行规则；不外推成完整训练或正式经济来源 |

**Verified（抽取控制流）**：66684先累加count，19815 / `0x32aa1f8`转发`System.Random.Next(min,max)`，随后对整数ticket执行`MathUtil.LE(ticket,count)`，成功取当前项，失败才减count。183407 / `0x7b91908`的LE实现为`ticket <= count + 0.00001`；对于本表整数比较，边界就是`<=`。因此在10项各count=10的表中，整数ticket为0..99时首项占11个、尾项占9个，其余各10个。实现保留这一边界，没有把count解释成严格等概率或可耗尽库存。

Web仍用项目已有的可保存随机流提供`floor(random*total)`票值；已接的是源整数选择过程，尚未恢复原版随机算法、跨系统抽取顺序或XLua覆盖。冻结保留原卡与报价，仅补空位；用户已禁用的干员仍排除，池空时不替换成源外候选。源ID无法精确绑定时明确报错，不按相似名称或阶级替代。

### 保留原数据、尚未接入的消费者

第三轮`spPrepareStateData.data`固定为`equip_free_1_tr`、6个槽位和4人`playerQueue`，不是通用随机三选一。槽0防暴盾`eff_acarm060`、槽1炎国短刀`eff_acarm040`已有上面的限定执行器；槽2/5是维式重锤`eff_acarm041`；槽3/4的`chess_item_3_11_e_a`在CN和同版JP的act1字典中均不存在。不能将缺失ID映射到第二赛季同名编号，也不能删除重复槽来伪造完整机变。恢复条件是取得实际训练运行时对缺号的处理/热更新定义，并沿`_GeneSpPrepareStateDataFromRoundInfo`和提交链核四人轮选。现有随机机变菜单仍是已知差异，单件装备实现不计整个机变流程完成。

**Verified（初始生命实际消费者）**：`GenerateLocalSave`（66675 / `0x22a7234`）调用`_LoadRunTimeData`（66678 / `0x22a7484`）；`0x22a76cc`读取`miscConfig+0x10`，`0x22a76dc`写入`RunTimeScenePlayerData.hp+0x14`。这确认45是玩家新局生命，不是NPC生命或每轮补满生命。Web已修正该入口，第二赛季训练与正式模式不套用。

**Verified（已存在的第四轮HP）**：训练`tr04`源关卡的`enemy_9033_acdeer.maxHp`本来就是30000，现有`battleSourceForRun → startBattle`已经消费这个值。本批确认与misc `bossBattleData.bossHp=30000`一致，不重复设置第二个HP乘区，也没有据此声称Boss共享HP/结算消费链全部完成。

**NPC的明确断点**：66681刷新源NPC快照；66328 / `LoadHelpBattlePlayer`取帮助名单`[2,3]`，第二人为右区；66329 / `LoadBossBattlePlayer`按`bossBattleData.playerGroup=1`取`[1,2]`，各组第二人登记到右区（泛型方法为`CheckValidIndex`后`List.get_Item(1)`）。67311 / `ConvertChessPositionInfoToBossMap`和67312 / `ConvertChessPositionInfoToRightMap`分别有普通区行偏移、右区列平移/Boss镜像。67325从关卡`configBlackBoard`取`player_map_*`及区域字段。方法本身可读，但尚未定位预置NPC快照到上述转换的实际调用顺序；三轮普通NPC源坐标与第四轮坐标分区不同，不能把所有NPC原坐标直接注入当前G.ops。恢复条件是取得这段调用方或同版XLua流程，并分开解析NPC默认技能/养成与玩家持有增益；无需再次寻找misc资金表。

### 同版活动表对缺号的复核

[inspect_training_activity.py](../../tools/inspect_training_activity.py)定向读匿名包`assets/AB/Android/anon/68fb0f95608049bd69ae23ad3908072f.bin`，别名`gamedata/excel/activity_table556f56.ab`，TextAsset pathId字符串`3507569230508595151`。包哈希`35288e3a2650d477f0306e8fa0a4d048b60859afb522670254e2584c7e8ad75b`，原始文本字节哈希`9095a8cb54867ce4c6a18fa662bd308ead83eca28acf3a447369ca57de6ee8b8`。该表是128字节签名后的FlatBuffers，使用父项目既有`to_object`和固定[Ark-FBS-Py schema](https://github.com/isHarryh/Ark-FBS-Py/blob/f3b905b8e547311510b1c4b893e489f9fc526530/CN/activity_table.py)（SHA-256 `d7df55e67bfe1f841f5bf5aa21f1d88bdc641a8ff2ac8f0b689da556be41515b`），不走misc的AES文本格式。

**Verified（同版源）**：它只有`act1autochess`；`trapShopChessDatas`46项、`trapChessDataDict`89项均无`chess_item_3_11_e_a`。第四轮NPC2的三个棋子绑定`chess_char_5_01_a / chess_char_1_01_a / chess_char_4_01_a`与现CN的charId、默认技能、默认模组、进阶ID一致。这些是精确身份复核，未证明NPC全部养成/技能或坐标流程一致。输出`work/client-logic/native-economy/training-activity-evidence.json`保存恢复入口和限定，不再将该缺号仅归因于“CN版本缺少，重找JP即可”。

## 验证

`node tools/_shop_items_smoke.js`覆盖两季16模式×6等级候选及源价格；跨季同效果商品ID/价格/资格差异；隐藏、零价和空池；真实两步升本、购买；休整保存恢复的卡片/来源身份/RNG；真实房间签名快照恢复后的再次刷新一致性。源表断言直接读取CN原表，不用生成产物自证来源。

相关生成检查为`node tools/build_equip_data.js --check`、`node tools/build_mode.js --check`；已有购买/出售价格、升级经济与冻结空位专项分别见`_shop_source_smoke.js`、`_shop_economy_smoke.js`、`_frozen_shop_refill_smoke.js`。通过范围仅限上述运行约束，不能证明原版服务器概率或12件装备全部战斗语义。

训练提取检查为`../.venv/Scripts/python.exe -B tools/extract_training_config.py --check`（使用父项目APK依赖环境）；`node tools/_training_economy_smoke.js`覆盖真实开局/回合余额覆盖、四级精确候选与CN绑定、整数边界票、实际确认升本、冻结报价/随机消耗、空池和缺绑定、赛季/模式/未覆盖范围隔离，以及真实休整保存恢复后再次刷新一致性。它验证当前实现及持久化契约，原版一致性依据仍是上面的源对象与原生消费链。

本批`_training_runtime_smoke.js`验证45仅在新局设置、剩余生命跨轮/休整恢复、第二季/正式隔离、既有第四轮30000源HP，以及真实房间签名检查点后的继续购买。`_equip_protection_smoke.js`覆盖真实`spawnEnemyAt`的visualId、同enemyId不同实例、被自己阻挡/未阻挡/不在阻挡、眩晕与冻结、重复装备、缺来源/跳事件边界、实际近战、弹体飞行期间新增/释放阻挡、真实商店购买/穿戴/休整、坏装备对象/重复UID/库存null拒绝和房主飞行中恢复。由此修正休整校验误拒绝合法单件装备`[装备,null]`的既有缺陷；仅槽内null被接受。

房间对比保留全部战斗状态、命中反馈、粒子数量和ArkSim随机状态；既有命中粒子轨迹使用未持久化的`Math.random`，不宣称轨迹重放一致。`_shop_items_smoke.js`的96种模式/等级池与`_frozen_shop_refill_smoke.js`的384个补位场景在第13件装备接入后通过。新源检查为`node tools/build_equip_protection.js --check`、`../.venv/Scripts/python.exe -B tools/inspect_training_activity.py --check`；原生证据用`python -B tools/inspect_shop_native.py`重建34方法/12字段布局，保护页面仍保留为缺口。

短刀专项`node tools/_equip_skill_stacks_smoke.js`覆盖两季普通/进阶12次成功施法（满层仍抽随机数）、真实普攻100→105、阿米娅源S1启动与后续攻击、既有属性加算、技能结束/属性刷新/保命与死亡、跨归属独立、失败施法无消耗、未知身份/赛季拒绝，以及真实购买、进阶奖励、穿戴、旧mods休整修正。房间专项从持续技能和已叠计数的签名检查点恢复，继续施法后的完整战斗状态与ArkSim状态相同。第14件市场映射接入后，商店96种模式/等级池及冻结384个补位场景再次通过。源检查为`node tools/build_equip_skill_stacks.js --check`和`node tools/build_equip_data.js --check`；原生证据用`python -B tools/inspect_equip_skill_stacks.py`复现。
