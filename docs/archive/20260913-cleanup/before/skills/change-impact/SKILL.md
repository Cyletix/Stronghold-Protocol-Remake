---
name: change-impact
description: >-
  修改公共契约、跨模块行为、持久化结构或生成源时使用；沿实际依赖检查传播影响。
---

# Change Impact

本 skill 只回答一个问题：

**为了正确完成当前已经明确的变更，哪些相关资产不能漏查？**

它不决定产品目标，不重新规划整个项目，也不扩大 task scope。

## 输入

从用户请求或已有 task 确定以下信息；不要求普通变更额外创建任务文件：

- 当前 task 的目标；
- 当前允许范围；
- 当前验收条件；
- 已知直接修改点。

## 检查顺序

从直接修改点向外检查实际依赖关系。以下是按需选择的检查类别，不要求每次遍历全部类别：

1. **契约**
   - API；
   - schema；
   - protocol；
   - public type；
   - CLI/interface；
   - configuration contract。

2. **消费者**
   - 调用点；
   - import/reference；
   - frontend/backend consumer；
   - integration；
   - plugin/extension。

3. **状态与数据**
   - persistence；
   - migration；
   - serialization；
   - cache；
   - compatibility。

4. **派生资产**
   - generated code；
   - lockfile；
   - compiled schema；
   - fixtures；
   - snapshots；
   - generated documentation。

5. **验证**
   - unit test；
   - integration test；
   - contract test；
   - build/typecheck/lint；
   - project checker。

6. **说明**
   - requirement/spec；
   - API/user documentation；
   - migration/release notes，仅在项目本身要求时。

## 输出

简要记录实际需要同步修改或验证的依赖。复杂变更可按下面分类组织，不输出空分类：

    Direct changes:
    - ...

    Must verify:
    - ...

    Possible propagation:
    - ...

    Out of current scope:
    - ...

`Must verify` 表示不检查就无法可靠完成当前任务。

`Possible propagation` 表示存在依赖迹象，但需要结合当前项目确认。

`Out of current scope` 只用于记录已发现但当前 task 未授权修改的影响；它不能成为擅自扩大范围的理由。

## 判定原则

- 通过源码、schema、引用、构建关系或项目规则寻找真实依赖，不靠目录名称猜。
- 修改内部实现但不改变外部 contract 时，不机械要求更新所有文档和调用点。
- 修改 public contract 时必须检查其消费者。
- 修改 source-of-truth 时必须检查其 generated artifacts。
- 修改持久化结构时必须检查兼容性和 migration。
- 发现必要配套修改时，先判断原请求是否已包含它；独立扩大的目标才需要确认。自动维护任务沿用 task scope 和状态协议，普通请求不因此启动自动维护。

## 停止条件

已经确认：

- 当前直接修改点；
- 所有具有实际依赖证据的必须检查项；
- 没有继续向外扩张的独立理由。

不得为了「全面」递归扫描整个仓库。

## 本项目传播示例

- 修改 `web/mode.js` 或拆分其模块时，按实际引用检查 `engine.js`、模式数据 JSON、UI consumer、相关 smoke 与 `docs/mode-spec.md`。
- 修改 `data/ArknightsGameData/**` 或提取规则时，检查对应 `tools/**`、生成到 `web/**`/`server/**` 的数据以及 `docs/data-inventory.md`。
- 修改任务状态 schema 或入口路径时，检查 supervisor、RUNBOOK、回归测试、任务文件、收件箱、日志、索引文档及旧入口引用。
