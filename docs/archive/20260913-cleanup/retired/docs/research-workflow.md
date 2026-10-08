# 研究记录方法

先查 [data-inventory.md](data-inventory.md#priority) 的缺口分类，再决定读源表、查索引或获取客户端证据。不要对已有数据问题重新全包扫描。

每个结论包含：版本/快照与源位置 → 原始观察 → 解释 → 证据等级 → 未验证条件。按项目 [research-evidence](../.agents/skills/research-evidence/SKILL.md) 执行；玩法规则修改使用 [mode-spec-review](../.agents/skills/mode-spec-review/SKILL.md)。

- 源字段存在不证明其触发时机和组合顺序。
- 代码、测试、截图证明Web实现状态，不反证客户端事实。
- 社区页面、用户描述可辅助定位；与源表不同则保留差异，不静默选一方称Verified。
- 名称检索未命中只能描述搜索范围，不宣称资源不存在。
- act1autochess/act2autochess与上/下半应查活动版本字段，不能仅按名字猜。

产物分工：[findings.md](findings.md)记录证据，[mode-spec.md](mode-spec.md)记录玩法契约，[architecture.md](architecture.md)记录代码边界，[data-inventory.md](data-inventory.md)记录缺口和消费链。过程、失败与验收写任务日志，不重复追加到四份文档。
