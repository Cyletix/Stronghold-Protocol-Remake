# 客户端公共机制候选索引

由 `python -B tools/build_client_mechanism_candidates.py` 复用现有证据生成；顺序仍由[当前计划](../plan.md)维护。
完整结果在 `work/client-logic/mechanism-candidates.json`，按 groupId / prefabId 查询实际字段差异、真实脚本类、模板闭包、消费者与原生方法（含基类）。本表只展示高复用入口，不是另一份完成清单。

源快照：JP 36.7.22 (local XAPK label; bundle hashes authoritative)；共享证据 `jp-36.7.22-client-logic`。当前 893 个预制体组成 690 个诊断分组；4017 个组件实例中 4017 个由同 CAB 的 MonoScript 精确关联类名。

源表 917 个技能，32 个缺资源、3 个无 prefabId；Web 有 164 个独立技能 ID 登记了可能部分的处理器。旧严格属性编译保留 17 个预制体；旧首失败 `{"different_buff_control_or_event_graph":24,"different_components":607,"different_controller_or_ability_fields":228,"protected_heal_ability_bridge":1,"unknown_or_duplicate_attribute_modifier":16}` 仅供历史差异诊断，不再代表公共程序编译覆盖。

公共程序编译接受 27 个完整图，其余精确阻塞 `{"unknown_blackboard_fallback":1,"unproven_mode_graph":39,"unsupported_component":608,"unsupported_field":208,"unsupported_modifier":9,"unsupported_program":1}`。各prefab的 `clientProgram` / `clientProgramRejection` 保留完整IR或具体节点/字段；可执行图还需消费者全部黑板与源身份绑定，见[两端接入范围](../research/client-program-integration.md)。

**字段形状、动作集合与差异路径用于分组，不证明语义等价；同一组各成员的实际值、状态、目标、时序仍要核查。原生地址是调查入口，未据此宣称函数体已恢复。**

## 批量入口

按缺 Web 处理器的源技能数、预制体数排序，接受过的 DPS 图也保留以供 Web 核查；不改变计划的领域优先级。

| 分组 | 预制体 / 源技能 | 无 Web 登记 | DPS 首结果 | 组件 / 代表 ID |
|---|---:|---:|---|---|
| `bed7ecb93ea4e634` | 14 / 10 | 10 | `different_buff_control_or_event_graph` | ActiveBuffAbility + CastSkill · `skchr_broca_1, skchr_cammou_1, skchr_clour_1` |
| `7cbaf8d8cfb439a6` | 11 / 11 | 9 | `unknown_or_duplicate_attribute_modifier` | ActiveBuffAbility + CastSkill · `skchr_catap_1, skchr_grani_2, skchr_mm_2` |
| `8618f5a00bccc703` | 8 / 8 | 7 | `different_controller_or_ability_fields` | ActiveBuffAbility + CastSkill · `skchr_absin_2, skchr_cuttle_2, skchr_erato_2` |
| `9eadda380a8d453d` | 8 / 8 | 7 | `different_controller_or_ability_fields` | ActiveBuffAbility + CastSkill · `skchr_aglina_1, skchr_clour_2, skchr_greyy_2` |
| `35917860de47e081` | 7 / 7 | 6 | `different_controller_or_ability_fields` | ActiveBuffAbility + CastSkill · `skchr_archet_3, skchr_asnipe_1, skchr_bluep_2` |
| `338134e02e2c7e81` | 6 / 6 | 6 | `different_components` | ActiveBuffAbility + CastTokenSkill · `skchr_doroth_1, skchr_doroth_2, skchr_doroth_3` |
| `6a7a964c0f01312a` | 8 / 8 | 5 | `different_controller_or_ability_fields` | ActiveBuffAbility + CastSkill · `skchr_acguad_2, skchr_acsupo_1, skchr_acsupo_2` |
| `4802a74d76154685` | 7 / 7 | 5 | `different_controller_or_ability_fields` | ActiveBuffAbility + CastSkill · `skchr_aosta_2, skchr_astesi_2, skchr_franka_2` |
| `83a093fbe4371f93` | 6 / 6 | 5 | `different_controller_or_ability_fields` | ActiveBuffAbility + CastSkill · `skchr_accast_1, skchr_acmedc_1, skchr_acnipe_2` |
| `8b9312b86c5f7405` | 5 / 5 | 5 | `different_controller_or_ability_fields` | ActiveBuffAbility + CastSkill · `skchr_doberm_2, skchr_shwaz_2, skchr_shwaz_3` |
| `a88ab5fb82037480` | 4 / 4 | 4 | `different_controller_or_ability_fields` | ActiveBuffAbility + CastSkill · `skchr_akafyu_1, skchr_helage_3, skchr_sophia_1` |
| `dd61631016c3a5f6` | 6 / 6 | 3 | `different_controller_or_ability_fields` | ActiveBuffAbility + CastSkill · `skchr_angel_3, skchr_glacus_1, skchr_pasngr_2` |
| `01df490805f13cff` | 5 / 5 | 3 | `different_components` | ActiveBuffAbility + CastSkillWithLimitTimes · `skchr_chen2_1, skchr_chen2_3, skchr_inside_1` |
| `4b663aaf403ba17e` | 4 / 4 | 3 | `different_components` | AdvancedSelectorWithinHpRatio + AutoLoadBoxRange + Heal + ReplacementSkill + SelectorTrigger + UberEffectEmitter · `skchr_baslin_1, skchr_demkni_1, skchr_nearl_1` |
| `00f86c6067fc47e0` | 3 / 3 | 3 | `different_components` | AttachOrDetachSkill + BuffAfterSkill + GlobalAuraAbility + TokenOrHostTargetValidator · `skchr_mgllan_1, skchr_mgllan_2, skchr_mgllan_3` |
| `3ed7d6d7e866812e` | 3 / 3 | 3 | `different_components` | AutoLoadBoxRange + BlockedOrAdvancedSelector + MultiMeleeAttack + ReplacementSkillFixed + UberEffectEmitter · `skchr_etlchi_1, skchr_highmo_1, skchr_varkis_1` |
| `41cac5ea43c64b86` | 3 / 3 | 3 | `different_components` | ActiveBuffAbility + CastSkillWithLimitTimes · `skchr_fuze_1, skchr_lemuen_1, skchr_lemuen_2` |
| `78d6f4181bad686b` | 3 / 3 | 3 | `different_components` | AttachOrDetachSkill + AuraAbility + AutoLoadBoxRange + TargetValidator · `skchr_ceylon_2, skchr_nian_3, skchr_sora_1` |
| `7ec25821a40c4997` | 3 / 3 | 3 | `different_controller_or_ability_fields` | ActiveBuffAbility + CastSkill · `skchr_acmedc_2, skchr_whitw2_2, skchr_whitw2_3` |
| `8b916061cad1e931` | 3 / 3 | 3 | `different_components` | ActiveBuffAbility + CastSkill + ThreePartChannelingAnimation · `skchr_heyak_2, skchr_snakek_2, skchr_tknogi_2` |
| `c3cf1fb438900999` | 3 / 3 | 3 | `different_components` | AdvancedSelector + AutoLoadBoxRange + RangedAttack + ReplacementSkillFixed + UberEffectEmitter · `skchr_grabds_1, skchr_haini_1, skchr_halo_1` |
| `cc6e5ab3ec5308e8` | 3 / 3 | 3 | `different_components` | ActiveBuffAbility + CastSkillWithSuspendable · `skchr_ebnhlz_3, skchr_phenxi_3, skchr_serum_2` |
| `10828e584898e5e5` | 5 / 5 | 2 | `different_components` | RangedAttack + ReplacementSkill + UberEffectEmitter · `skchr_amgoat_2, skchr_frostl_1, skchr_meteo_1` |
| `e7de6fec3c143105` | 5 / 5 | 2 | `different_components` | MeleeAttack + ReplacementSkill + UberEffectEmitter · `skchr_chen_1, skchr_doberm_1, skchr_jaksel_1` |
| `eaa88ca254a807b5` | 4 / 4 | 2 | `different_components` | ActiveBuffAbility + CastSkill + ThreePartChannelingAnimation + UberEffectEmitter · `skchr_amgoat_3, skchr_glassb_2, skchr_glider_2` |

## 查询与验收边界

- `--prefab skchr_glassb_1`：输出该配置、与标准强化的逐字段差异及关联组；模式图另保留`dpsModeGraph`证明链或`dpsModeRejection`具体拒绝，常量属性保留`dpsAttackConstants`，读取完整 JSON 的 `nativeTypes` 可继续定位方法。
- `--group GROUP_ID`：输出组内全部实际 prefabId 和 skillId；不能用代表配置代替检查其余成员。
- `--check`：重建并比较候选 JSON / 本页；运行消费者变化后先重建，不能把旧计数当当前结果。
- 缺脚本表时仅运行 `python -B tools/extract_client_script_types.py`，读取一个已定位匿名包。常规分组不会再解包。
- 输入 SHA 包含原始图、脚本表、源绑定、原生索引、DPS 编译器和 Web 当前加载代码。共享库与本地原图不匹配时拒绝生成。

后续按[机制取证清单](../checklists/mechanism-research.md)接入消费者并验证，再回写原个体条目。JP／CN版本、未闭合动态引用、天赋／模组及动作时序继续单列。
