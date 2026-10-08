# 开发与交付

[返回文档导航](../README.md) · [当前推进计划](../plan.md)

## 运行入口

| 用途 | 从项目根目录执行 | 说明 |
|---|---|---|
| 游玩/邀请朋友 | 双击 [开始游戏.cmd](../../开始游戏.cmd) | 唯一用户启动入口；选择单人时本机模拟 |
| 局域网备用 | `.\开始游戏.cmd -LocalOnly` | 同一启动器的参数，无需第二个快捷入口 |
| 本地运行时检查 | `.\开始游戏.cmd -CheckOnly -PortableOnly` | 检查便携依赖，不启动浏览器或房间 |
| 仅开发网页 | `python tools/run_server.py --host 127.0.0.1 --port 8000` | 手动打开 http://127.0.0.1:8000/ ，用于前端/本机调试 |
| 制作完整分享包 | `.\tools\Package-Room.cmd` | 开发工具；输出到 `dist/`，不是游玩入口 |

旧 `Start-Room.cmd`、`Start-Online.cmd` 与 `run.bat` 已退出根目录，历史内容见[归档](../archive/20260913-cleanup/README.md)。完整包本来就只分发“开始游戏”，本次整理不需要重新安装依赖。

从 2026-09-17 起，每完成一个可验收的大项并通过相关检查，立即制作包含运行时和完整游戏资源的分享包，不需再单独询问。自动执行可直接调用入口所用的 `powershell.exe -NoProfile -ExecutionPolicy Bypass -File tools/package-room.ps1`，避免 `.cmd` 的交互暂停；默认保留完整 Node 与联机运行时，不传 `-NoRuntime` 或 `-LocalOnly`。交付前确认包内版本、受影响脚本/数据和便携启动检查，报告新 ZIP 路径；保留旧包，不因此上传或发布。

## 环境和源文件

网页与 Node 房间服务无需 `npm install`。完整包自带运行时；源码目录由启动器寻找/准备 `.runtime/` 中的 Node。直接运行 `node tools/...` 则需当前终端可找到 Node。

Python 提取/调试环境按需准备：

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
# 仅需导出音频时：
python -m pip install -r requirements-optional.txt
```

`web/mode/*.js` 是模式源码，修改后运行 `node tools/build_mode.js`，`--check` 只读检查生成文件 `web/mode.js`。`web/engine.js` 与 `web/src/` 是直接维护的引擎源码，不由该拼接脚本生成。

卫戍技能的批量编译入口为 `python tools/build_garrison_skill_batches.py`，共享范围、旧绑定保护与拒绝原因见[批量机制](../mechanics/garrison-skill-batches.md)。完整包采用快速 ZIP 压缩，仍包含全部资源和便携运行时；这是缩短频繁交付耗时，不是裁剪资源。

数据默认位于 `data/ArknightsGameData/zh_CN/gamedata/`。仅部分提取器支持同级共享目录回退，应查看本次使用的脚本。更新源表前记录当前版本/哈希，明确本轮使用哪一份快照，避免两份目录混用。使用已授权的本地快照时不必更新上游仓库。

客户端原始逻辑研究复用`work/client-logic/`的预制体、顺序动作、metadata与可读原生函数；这与中文数值表是独立来源快照。具体[批量管线](../research/client-logic-pipeline.md)和[未决领域入口](../research/native-domain-entrypoints.md)已建立，不需从每个技能描述或录像重新开始。换包先记录版本并对比变化，不默认当前研究包就是最新线上版本，也不把旧解包失败当作不能继续的理由。

## 目录分工

| 目录 | 内容与维护边界 |
|---|---|
| `web/` | 前端源码、生成数据与已导出素材；不要把全部文件都当生成物 |
| `tools/` | 提取、构建、检查、房间服务和打包工具；旧 `tools/main.py` 不用于日常运行 |
| `data/`、`work/` | 源数据、资源索引与研究中间产物；原始包和手工材料不能按缓存一概删除 |
| `assets/` | 用户参考图/录像切片、任务与日志；保留原始证据 |
| `docs/` | 当前分层文档，历史材料归入 `docs/archive/` |
| `.runtime/`、`dist/` | 本机依赖/检查产物与发行包；运行时是开发工具的实际依赖 |
| `.agents/` | 项目方法与可选的 supervisor 自动维护工具 |
| `server/` | 历史客户端研究与实验，不在当前 Web 游戏运行主链 |

## 检查、提取与联机

现成成果用 `python tools/import_community_batch.py` 一次更新共享附加库、DPS 核心批量覆盖和卫戍消费数据；单独命令和缺口报告见[批量接入说明](../research/community-batch-integration.md)。优先复用此入口，不从源目录逐个手工转录。

- [工具命令与生成依赖](toolchain.md)：只重建受影响产物，审查 diff 后运行对应检查。
- [联机专题](multiplayer.md)：连接方案、生命周期、同步与交付边界。
- [性能记录](performance-baseline.md)：测量方法、样本和仍需实测的场景。

`node tools/check_game.js --list` 列出检查组；普通修复先跑相关组，完成本次必需检查。`node tools/check_docs.js` 检查当前文档链接和导航可达性。生成清单由 `node tools/audit_implementation_checklist.js` 维护；稳定 ID、摘要、人工记录和勾选必须保留。

一般开发和Codex定时续做都按当前请求、[推进计划](../plan.md)及其[机制清单](../checklists/mechanism-research.md)执行，定时任务本身不另启动supervisor。只有用户明确要求启动、恢复或推进supervisor自动维护时，才进入[任务协议](../../assets/task/README.md)和[RUNBOOK](../../.agents/skills/automaintain/RUNBOOK.md)。

### 批次打包复用工具

实现与必要检查结束后运行 `python tools/verify_garrison_package.py freeze --version YYYYMMDD.N`，冻结上次验收的关键路径及四提供者回执；新模块用 `--extra 相对路径...` 加入。随后运行完整打包入口，再用 `python tools/verify_garrison_package.py verify --version YYYYMMDD.N --package dist/实际目录` 核对冻结源/目录/ZIP哈希及实际便携默认启动。它不删除旧包或发布，不用后续工作区变化伪造已打包内容。核对通过后以同版本冻结report运行 `freeze_garrison_batch.py --report work/garrison-skill-batch-report-source-YYYYMMDD.N.json --activate`。
