---
name: automaintain
description: "用户明确要求启动、恢复或推进 supervisor 自动维护时使用；普通的继续开发不触发此循环。"
---
# 自动维护

仅在用户要求自动维护时使用。项目路由见 `AGENTS.md`，状态协议见 `assets/task/README.md`，命令与恢复见同目录 `RUNBOOK.md`。本文件补充循环决策，不重复任务 schema。

## 执行循环

1. 依次运行 `Validate → SyncInbox → Status`；Validate 失败时停止并报告契约错误。
2. 有 active 时只执行其 next；否则激活第一项 queued；两者皆无时按任务协议摄取 pending inbox。
3. 目标/范围/验收能从上下文确定时生成 queued；确实缺少必要信息时 SuspendInbox，继续其他可执行事项。
4. 当前 unit 只读所需局部上下文。先检查已有实现是否已满足目标；已满足的重验结算，不重复实施。涉及真实公共依赖时使用 change-impact。
5. 完成并验证当前 unit：通过调用 Complete，可重试失败调用 Fail，确实受阻调用 Block；调用 WriteLog 后进入下一循环。
6. active、queued、pending 都为空时自然停止。blocked/suspended 只跳过，单项受阻不停止其他工作。

`T-*.md` 是该循环的断点；diff、日志、截图可作证据，不能替代状态。不得手改状态字段、任务 checkbox 或日志，不提前 Complete 其他 unit。`assets/todo.md` 的勾选只由用户验收。

## 实施与阻塞

目标、修改点和验收方式明确后开始实施；进一步调查只解决会改变本次实施或验证的具体未知项。普通实现结果不能自证客户端事实，按 research-evidence 保留差异。

资料不足只有在“当前验收必须依赖该事实、现有契约无法提供可验证实现、继续会臆造关键事实或违约”同时成立时才构成 Block。更高保真、可选研究、范围外优化本身不是前置条件。权限、外部依赖或不可解的契约冲突需记录具体恢复条件。

现场已有其他修改时保留；只在确实无法独立实施/验证时记录阻塞关系，不为清理工作区回滚他人成果。

## 验证与 FINAL

普通 unit 验证实际受影响行为；生成数据要核来源与产物，文档要核路径与契约，UI 必须区分自动行为检查与实际画面验证。编译或命令成功不等同目标成立。

FINAL 对照任务的全部验收条件检查证据、范围、消费者和必要测试。检查 relevant diff 与生成物，排除本轮引入的残留。范围内可直接修复的遗漏继续修复并重验；范围内无法当场完成的按任务协议 Block 并建立引用原任务的 queued 后续任务，解决后 Resume。不要手工重开已完成 unit；范围外可选改进不阻塞验收。全部条件成立后才 Complete FINAL。

## 日志与经验

日志由 supervisor 写入。`meta` 仅记录可跨任务复用的环境行为、稳定失败模式和处理策略；业务事实、普通实现理由或已固化规则不重复存经验，不确定时留空。

outcome 仅用：resolved / improved / avoided / failed / worse / invalid / observed。新日志 meta 非空时按 experience 摄取。

## 停止与写入边界

自然停止前查询经验候选，只汇总 promotion_ready / review_required，不自动发布。除队列耗尽外，Validate 失败、工作区状态不确定导致继续写入有风险或用户中断时停止；报告具体原因与恢复条件。

不因该循环擅自提交、暂存、发布、修改仓库外/全局配置或扩范围清理；用户或当前任务明确授权的操作按其范围执行。Cline 专属读取边界仍遵守 AGENTS。
