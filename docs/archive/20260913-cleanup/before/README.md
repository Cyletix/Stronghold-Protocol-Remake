# 明日方舟 Web 复刻 · 卫戍协议

利用 APK/OBB、gamedata 和已有研究，在浏览器中复刻明日方舟，当前实施重点是卫戍协议单机与多人流程。资源与数据版权归原权利人所有，项目用于学习与非商业自用。

当前已能采购、部署、合成、装备、战斗与回合结算，但尚不是完整复刻。**目前最影响平衡的是敌群模板替换未实现：源波次里的模板敌人被直接用于战斗，开局三类特训敌人没有约束后续出怪。** 默认盟约 II 的非隐藏固定干员身份已覆盖；初版仍缺人且存在阶数差异，个体机制也未全部实现。准确名单与数量见 [敌群/干员覆盖核对](docs/generated/content-coverage.md)，优先级见 [数据问题表](docs/data-inventory.md#priority)。主页作战终端暂未开放；内部仍保留单波测试分支，尚不是完整的常规关卡复刻。已支持单机休整保存/继续；联机具备四席大厅、独立战场、两两共享 Boss 和队友观战，主机重启后的战斗续局尚未实现。

从仓库根目录运行：

```powershell
node tools/build_mode.js --check
python tools/run_server.py --host 127.0.0.1 --port 8000
```

开发前先按 [开发环境与依赖说明](docs/development-setup.md) 配置 venv 与 Python 包，再执行上述命令。

浏览器打开 http://127.0.0.1:8000/ 。用 HTTP 服务加载本地数据和资源；Windows 完整包已内置 Node、网页和资源，无需另装 JS 依赖；打包启动检查不等于已完整还原原版玩法。

Windows 异地联机：所有人双击 [开始游戏.cmd](开始游戏.cmd) 打开游戏主页，进入卫戍协议后直接显示四席房间，单人固定第一席；在底部选择单人/多人、赛季、难度和地图。房主点“创建同盟”并复制分享码，朋友输入这一个分享码即可自动连接并入席。双击 [Package-Room.cmd](Package-Room.cmd) 生成一个通用 ZIP，含 Node.js、EasyTier 和完整网页资源，谁都能当房主，无需安装依赖或输入IP。具体见 [联机使用说明](联机使用说明.txt)；`Start-Room.cmd -LocalOnly` 保留局域网备用入口。

干员库统一使用绿色界面，默认显示本地全部 454 名干员资料，可搜索、调整练度与携带技能，也可切换到当前赛季的卫戍名册（初版 95 人、盟约 II 112 人）。卡片按 I–VI 阶及“其他资料”排列，滚轮横向浏览；主页「编队」或房间「调整甄选」可另选 V / VI 阶各两名非固定六星，加入本人的商店；按实际势力匹配核心盟约，无匹配才为协防。详见[四槽甄选](docs/diy-roster.md)。其他资料角色仅可查看，少数已实现的战术家另有单人调试入口；资料开放不代表个体机制全部完成。

开发与文件管理入口：

- [文档导航](docs/README.md)：先看这一页确定当前要看的入口。
- [干员/敌人实施 checkbox 总清单](docs/implementation-checklist.md)：逐人追踪特性、天赋、全部技能、召唤物、模组与卫戍特质，逐敌追踪出怪和能力；分批修复验证，发布按当次需求执行。
- [仓库结构说明](docs/repository-layout.md)：理解目录职责与归档边界。
- [开发环境与依赖](docs/development-setup.md)：Python 包、数据源、分支和回归入口。
- [任务协议](assets/task/README.md)：任务状态机与收件箱规则。

- [联机与分享专题](docs/multiplayer.md)：使用方法、EasyTier 异地连接、当前实现和验收边界。
- [问题分类与推进顺序](docs/data-inventory.md#priority)：唯一的架构/数据缺口清单。
- [任务状态](assets/task/README.md)：执行状态由 supervisor 管理；用户收件箱在 [assets/todo.md](assets/todo.md)。

源码在 `web/mode/`、`web/src/`、`web/engine.js` 和 `web/index.html`；`web/mode.js` 是生成文件。工具在 `tools/`，原始数据在 `data/`、`work/`。`server/` 与 `client-patch/` 保留历史研究，不在 Web 产品运行链中。
