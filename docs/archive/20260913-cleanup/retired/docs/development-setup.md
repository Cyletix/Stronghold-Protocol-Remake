# 开发环境与交付链说明（v1）

统一维护本仓库开发入口，避免不同人按不同口径执行同一流程。

## 一、快速上手

- 日常运行入口：`node tools/build_mode.js --check` + `python tools/run_server.py --host 127.0.0.1 --port 8000`，再打开 `http://127.0.0.1:8000/`。
- 也可直接双击 `run.bat` 快速启动；支持 `run.bat [host] [port]` 覆盖监听与打开地址。
- 联机入口：`Start-Room.cmd`、`Start-Online.cmd`、`Package-Room.cmd`。
- 任务流转：`assets/task/README.md`（任务状态机）和 `assets/todo.md`（用户收件箱）。

### 建议环境初始化

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -U pip
python -m pip install -r requirements.txt
```

可选导出能力（音效相关）：

```powershell
python -m pip install -r requirements-optional.txt
```

说明：`requirements.txt` 为日常开发通用依赖；`requirements-optional.txt` 仅包含按需安装的导出扩展，不要求每次都安装。

## 二、Python 包与脚本职责边界

- `tools/run_server.py`：本地静态服务 + 随机快照持久化。
- `tools/asset_*.py`、`tools/export_*.py`：资产解析/导出链路，核心依赖 `UnityPy/lz4/Pillow`，如启用音效导出再安装 `fsb5`。
- `tools/build_*.js`、`tools/extract_*.js`：数据生成链，不新增 Python 全局依赖。
- `tools/main.py`：历史遗留入口（请勿用于日常联机/游戏运行），不再作为生产链路。

## 三、外部数据源与“子模块”治理

当前仓库默认不启用 Git 子模块。数据查找分级如下：

1. 优先使用仓库内 `data/ArknightsGameData/zh_CN/gamedata/`；
2. 若目录缺失，再回退到仓库同级目录 `../ArknightsGameData/zh_CN/gamedata/`（便于在同一盘共享多个项目）。

当你确认外部源过期时，先更新上级仓库而非在本仓库内替代：

```powershell
if (Test-Path ..\ArknightsGameData) { 
    git -C ..\ArknightsGameData pull
} else {
    git clone https://github.com/Kengxxiao/ArknightsGameData ..\ArknightsGameData
}
```

更新后再运行相关导出/构建命令，避免混用两个版本的静态目录。

## 四、分支与协作约定（执行层）

- 分支建议以 `codex/<主题>-<日期|序号>` 命名，保持小步提交、可回退。
- 任务优先以 `assets/task/T-YYYYMMDD-xxx.md` 作为工程执行边界，不以临时实验文件替代任务入口。
- 任何对 `web/mode.js`、`web/engine.js` 的修改都应先改源模块，再执行 `tools/build_mode.js --check`。

## 五、Node 与打包链路边界

- 本项目不要求执行 `npm install`。分发与联机包使用仓库内置 `.runtime/node-win-*`，避免系统级 node 版本漂移。
- 运行时依赖最小化：构建与打包脚本依赖 `node` 和 `PowerShell` 即可（不额外拉 npm 模块）。

## 六、常见回归入口

- 核心校验：`node tools/check_game.js`
- 模式生成顺序（常用）：`node tools/build_mode_rules.js` → `python tools/extract_level_data.py` → `node tools/build_mode.js`
- 资源导出：先 `python tools/build_inventory.py`（必要时）再 `python tools/search_assets.py ...` 与 `python tools/export_asset.py ...`

## 七、弃用与归档建议

- 若发现历史归档脚本与当前职责冲突，先移动到 `tools/` 外部或 `docs/archive/*`，并在调用链说明中标注状态，避免误作为当前入口。
- 迁移动作建议在 task 中形成一条明确记录，再执行验证。
