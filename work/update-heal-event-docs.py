from pathlib import Path

def transform(path, fn):
    p=Path(path);p.write_text(fn(p.read_text(encoding='utf-8')), encoding='utf-8')

def mechanism(s):
    s=s.replace('Web银灰末端平加仍是独立传播点，见','该批Web银灰末端平加缺口已由下方批次修复，见')
    s=s.replace('actrpa事件7及actrpb/c TARGET/achunt_mark仍未接，见','当时actrpa事件7及actrpb/c TARGET链未接；achunt_mark后来确认是永久根标记，其死亡清理见下条，转伤TARGET仍未解，见')
    s=s.replace('2026-09-14最新接续批次Web123组','2026-09-14上一批Web123组')
    blocks={
      '- [ ] **R03': '  - 记录：2026-09-14本批修正Web银灰S3末端平加的最终DEF传播，统一真实承伤、Boss选敌、流形链接与面板；十级源配置、侵蚀、零因子/结束及双归属恢复通过。`skcom_heal_self`真实SelfSelector和ApplyHeal比例节点已定位，Entity事件/HEAL_FREE取消与强制参数已核，但Heal.NewHealNode/DoSetData桥受保护，不能据此严格编译整图。父DPS卡缇/缠丸/铸铁S1新增3独立自疗模型，54份源等级、13新专项；原107/1001伤害映射、精一85/807和17/893图接受不变。严格拒绝现607/228/24/16及1项protected_heal_ability_bridge，候选690组/9校验。Web三项自疗原已有，不重复计数。来源见[自疗证据](../../../docs/client-self-heal.md)，下一部署图和具体方法由计划维护。\n',
      '- [ ] **R05': '  - 记录：2026-09-14本批由四份根PassiveBuffAbility纠正achunt_mark为永久/不可沉默静态标记；achunt最终死亡的全局标记筛选→InstantKill→Suicide→SetHpInternal已接，按正常死亡/复活清理且不变成伤害/击杀贡献。真实关卡分级覆写、重复子体、复活/坠落/漏怪、即时胜利、弹体及双归属鉴权恢复通过，仅增加首领一个清理子项。三子体TARGET/事件上下文仍断在Buff.OnStart/RunActions/OnAppliedModifier的保护方法，多首领组合拒绝；不反复解同页。具体方法与边界见[清理证据](../research/enemy-achunt-cleanup-native.md)。\n',
      '- [ ] **R09': '  - 记录：2026-09-14本批按共用GlobalBuff八节点接普通/进阶炎国短刀单件：每次成功技能启动后加5%/8%一层，上限10层，满层仍执行Dice消耗随机数。修正源导出将其误当常驻1.05/1.08的分类，购买/奖励/穿戴/休整均归一化为零层事件装备；市场14映射。真实后续攻击、持续技能/保命/最终死亡、旧mods、双归属恢复和96池/384补位通过；多件重复注册、当次瞬发优先级、训练第三轮缺号与四人轮选仍未验，不能据此计整个训练。15原生方法/4布局及边界见[道具专题](../mechanics/shop-items.md)。\n',
    }
    for prefix,block in blocks.items():
        i=s.index(prefix);s=s[:i]+block+s[i:]
    return s
transform('docs/checklists/mechanism-research.md',mechanism)

def plan(s):
    s=s.replace('当前含689组诊断','当前含690组诊断')
    s=s.replace('严格接受17/893预制体，拒绝608/228/24/16四类，19项具体模式拒绝保留。','严格接受17/893预制体，拒绝607/228/24/16及1项protected_heal_ability_bridge，19项具体模式拒绝保留。另有3项独立自疗模型/精一自疗模型，不计入伤害映射；Heal能力桥仍受保护。')
    old='直接查询现有候选组和父库拒绝608/228/24/16分类及具体mode_rejections；优先skcom_heal_self的SelfSelector/Heal最大生命比例链，接Web/DPS可适用消费者。输入/消费者改变才重建候选，普通取证不再重做R01、已验模式证明、属性图、浮游和六模板。'
    new='直接查询现有690候选组、五类拒绝及具体mode_rejections；优先skcom_born_up的AppearSkill+ActiveBuffAbility部署增益，核OnBorn/OnLocate/DoCast再复用已接的持续属性算子。Self-heal保护桥记录恢复条件后转下一可执行图，不反复重解。输入/消费者改变才重建候选；不再重做R01、已验模式证明、属性图、浮游和六模板。'
    assert old in s;s=s.replace(old,new)
    start=s.index('- 当前：',s.index('## 接续断点'));end=s.index('- 后续更新此块',start)
    s=s[:start]+'''- 当前：Web银灰S3最终DEF已覆盖流形/元素平加、真实承伤、Boss选敌、链接和面板；缠丸最终0仍有效。`skcom_heal_self`选择器、比例节点与Entity事件已取证，父DPS新增3项单列自疗模型，Heal.NewHealNode/DoSetData保护桥使严格图仍拒绝。R04接achunt最终死亡的永久根标记清理；R08接普通/进阶炎国短刀单件并修正旧常驻加成分类。详情见[最终防御](../../docs/client-final-defense.md)、[自疗证据](../../docs/client-self-heal.md)、[死亡清理](research/enemy-achunt-cleanup-native.md)和[道具专题](mechanics/shop-items.md)。
- 下一项：R02直接查询`skcom_born_up`：根`-5967044293240493380`，真实AppearSkill脚本`2822254928132392630`与ActiveBuffAbility，empty模板ATK+DEF、`_castOnLocate=1`；实际三项源ID为`skcom_born_up[1..3]`，7/10/10级。定向读AppearSkill.OnBorn `0x20fe054`、OnLocate `0x20fe288`、OnInit `0x20fdad0`及DoCast `0x20fdd28`，确认部署/落位触发和WaitForAttackEvent后接已有timed属性算子。沿现有候选/原生索引即可，不需重扫全包。自疗Heal能力桥、可颂BasicTalent.AssignData `0x211d64c`与_GenerateBlackboardByTalentScale `0x211e748`均有具体保护断点，只有不同有效方法/新字节/运行观察才重试。
- 可并行：R04/R05继续其余已索引敌人/Boss独立模式或公共动作；actrpa事件7与actrpb/c事件10到TARGET上下文尚未解，Buff.OnStart `0x4d9db50`、_RunActions `0x4d9d6dc`、OnAppliedModifier `0x4d9edac`保护，GetActionTarget跳表无效。`achunt_mark`已证实是四根永久被动，其最终死亡清理已做，不再派“寻找动态achunt_mark”；`achunt_mark_by_boss`是另一未完成链。器物阻挡`0x21d0000`页同样记录无新字节不重扫，见[阻挡证据](research/enemy-block-native.md)。
- 模式/经济：训练NPC名单与67311/67312坐标方法已有，缺预置快照到转换的实际调用方；第三轮缺号`chess_item_3_11_e_a`在同版JP/CN均不存在，下一步查实际缺号处理/热修与四人轮选提交链。炎国短刀单件已接，第三轮完整流程未验；防暴盾多件归并及短刀多件COUNTING/当次瞬发优先级仍需上游环境与施法事件证据。四轮资金/初始45HP/第四轮Boss30000HP和同版活动表已完成相应限定取证，不重复派工。正式模式资金/概率/库存及第二季继续独立核查，不能沿用第一季训练。
''' +s[end:]
    return s
transform('docs/plan.md',plan)
print('updated current plan and mechanism boundaries; final verification totals pending')
