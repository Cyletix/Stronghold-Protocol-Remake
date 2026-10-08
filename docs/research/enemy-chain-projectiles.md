# 敌方链式弹体公共合同

本轮按[卫戍基础优先表](../generated/garrison-foundations.md)选择影响实际遭遇池的子类。源字段只按固定缺口中的 projectileKey 定点批取，结果保存在 `work/garrison-projectile-priority-resource-cache.json`；完整动作保存在 `work/garrison-projectile-priority-action-cache.json`。后续消费[固定候选](../../work/enemy-chain-projectile-candidates.json)与[一次评估](../../work/garrison-projectile-priority.json)，不重复扫描敌人或弹体资源。

## 源数据事实

[Verified，配置] CN 动作来自 Tim23333/Arknights_timer 快照 `d2f6d76a7172cedc7583fc0a4eb998699abf25f5`；JP 弹体来自既有 36.7.22 客户端逻辑库。文件、载荷和脚本来源哈希随候选保存。`projectile_enemy_dkmage` 使用 SimpleProjectile、AdvancedMovement、ChainLightningHitBehaviour、ChainedSelector 和 CircleRange，速度 15、生命期 10 秒、只在到达追踪目标时检查命中、不命中沿途对象、间隔为 0、不重复命中同一目标。

三份同构 RangedAttack 使用同一 projectileKey，均为法术伤害、无 `_activeBuffs`；`_waitForProjectileInvalid=1`，`_fireAttackFinishWhenProjectileInvalid=0`，`_waitForAnimEndWhenProjectileInvalid=0`，`_minPostDelayWhenProjectileInvalid=0`。不是因为缺少弹速而失败，而是先前弹速合同拒绝所有等待弹体的动作。

CN 黑板的共同参数为 `epdamage.attack@max_target=4`、`epdamage.attack@projectile_range=1.6`、`epdamage.attack@chain.atk_scale=.85`、`epdamage.attack@ep_damage_ratio=.3`。源动作元素枚举为 4；JP metadata 的 DARK=4 与现有 `ep_break_dark_char/enemy → apoptosis` 映射一致，枚举证据另存于 `work/garrison-projectile-chain-element-enum.json`。

## 明示推断与执行约定

[Inferred，跨版本绑定和执行] 共同 projectileKey 将 CN 动作连接到 JP 弹体声明；攻击参数使用精确 `epdamage.attack@` 作用域，不能从无关黑板尾缀取值。JP 圆形 collider 半径约 1.7 与 CN 显式黑板 1.6 分别保留，运行时消费后者。完整原生参数作用域、ChainedSelector 排序和动作失效回调并未恢复；不得把下面的实现测试当作原版证明。

运行时首弹追踪原目标，到达同一帧逐跳选择范围内最近且未命中的我方单位；等距采用稳定战场顺序。每跳使用自身防御/法抗、闪避与承伤规则，法术包和元素损伤按 `.85^跳数` 衰减。发射时保留攻击力、输出倍率和链参数，命中时读取各目标承伤状态。原目标失效后在最后位置消散，不改为邻近范围伤害；源死亡不删除已发弹体。图形复用现有链线，未复刻原资源特效。

这类动作在发射后等待弹体真正结束，冷却继续计时；命中、无有效后续目标、目标失效和寿命到期均触发一次完成。此子类最短后摇为 0，完成后释放动作。保存的是普通数据和施法序号，旧弹体只能完成自己的施法；模式切换取消旧施法后，旧弹不能释放新动作。帧内运动不超出剩余寿命。

## 批量边界

一次编译同构的 `enemy_1225_dkmage`、`enemy_1225_dkmage_2`、`enemy_15016_dqdkma`，其中前两个属于卫戍遭遇池。另外两个冻结候选 `enemy_2050_smsha`、`enemy_2051_smsha2` 附带寒冷 Buff 和额外技能参数，保持未执行；不能只移植链伤害后删除其整体缺口。死亡天赋和其他机制与普通动作分别记账。

生成路径为 `enemy_chain_projectiles → build_external_combat_data → external_combat_data.js → external-combat.js / engine.js`。编译器只消费完整匹配合同，运行时再次检查受支持参数；无效作用域覆写不会降级成普通单体弹。回归入口为 `tools/test_enemy_chain_projectiles.py`、`tools/_enemy_chain_smoke.js` 和链运行边界测试，覆盖真实生成资料、失效回调与主机 VM 飞行中恢复。
