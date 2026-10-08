# 卫戍协议复刻 · 已停止开发（中间成果公开）

> 这是我 2026 年 8 月底开始做的《明日方舟》「卫戍协议：盟约」网页复刻，**没有完成**。后来看到 [sganggs/Stronghold-Protocol](https://github.com/sganggs/Stronghold-Protocol) 已经做出了完整可玩、可联机的版本，这个项目就此停止。代码、生成好的数据、客户端研究笔记和解包思路原样公开，愿者自取；如果能帮到其他复刻项目，那就再好不过。

## 仓库里没有的东西

- **游戏美术、音频、截图与参考录像**：版权归鹰角网络 / Yostar，未上传。直接运行时立绘、图标和声音会缺失；`tools/` 里有从本机客户端提取或从公开资源仓库下载的脚本（`extract_*.py`、`export_*.py`、`download_*.py`）。
- **APK/OBB、解包产物和反编译输出**：`work/` 只保留了 1MB 以下的研究报告与脚本，不含客户端文件；`data/ArknightsGameData` 快照请从 [Kengxxiao/ArknightsGameData](https://github.com/Kengxxiao/ArknightsGameData) 获取。
- **开发历史**：这里只有一次快照提交。文档中指向 `work/`、`data/` 或 `dist/` 的部分链接因此会失效。

## 可能有用的部分

| 内容 | 入口 |
| --- | --- |
| 解包与提取（AB 解压、客户端逻辑/脚本类型提取、各类数据表与图标导出） | `tools/decompress_ab.py`、`tools/extract_client_logic.py`、`tools/extract_client_script_types.py`、`tools/extract_*.py`、早期探索脚本 `tools/scratch/`；命令与生成依赖见 [toolchain](docs/development/toolchain.md) |
| 客户端逻辑研究（技能预制体、Buff 动作序列、敌人模式调度、原生方法入口） | [docs/research/](docs/research/README.md)，尤其是 [client-logic-pipeline](docs/research/client-logic-pipeline.md)、[findings](docs/research/findings.md)、[enemy-mode-dispatch](docs/research/enemy-mode-dispatch.md)、[native-domain-entrypoints](docs/research/native-domain-entrypoints.md) |
| 机制专题与逐人 / 逐敌验收清单（两季 207 个招募槽、146 种身份逐槽核验） | [docs/mechanics/](docs/mechanics/README.md)、[docs/checklists/](docs/checklists/README.md)、[玩法规格](docs/spec/mode-spec.md) |
| 已生成的模式数据（轮次、敌潮、技能、天赋、商店等） | `web/*.json`、`web/*_data.js` |
| 一键联机启动器（PowerShell + 便携 Node + EasyTier，分享码加入） | `开始游戏.cmd`、`tools/start-room.ps1`、`tools/lib/room-*` |

## 声明

非官方同人作品，与上海鹰角网络科技有限公司、Yostar 及其关联方无关。《明日方舟》相关名称、数据、文本与素材的版权归原权利人所有。仅供学习交流，**禁止任何形式的盈利**。权利人如认为有侵权内容，请提 Issue，我会删除。

---

以下是项目停止前的原始 README。

# 明日方舟 Web 复刻 · 卫戍协议

基于本地 APK/OBB、gamedata 与客户端研究的浏览器复刻。当前重点是卫戍协议单人和多人流程，尚未完整还原原版。资源版权归原权利人，项目用于学习与非商业自用。

## 开始游玩

Windows 双击 **[开始游戏.cmd](开始游戏.cmd)**。进入主页 → 卫戍协议 → 在四席房间中选择单人/多人、赛季、难度和地图 → 开始本局 → 查看情报 → 选择策略。

单人第一席走本机模拟；多人房主创建同盟、分享一个分享码，朋友输入后加入。完整分享包内置 Node、EasyTier 和网页资源；源码目录缺运行时会由启动器准备。详细操作见[联机使用说明](联机使用说明.txt)。

## 看进度与继续开发

- **[完整模式进度与剩余缺口](docs/plan.md#距离完整卫戍协议还差什么)**：先看这张总表，再看同页当前队列；逐人、逐敌细节从表内进入。
- **[文档导航](docs/README.md)**：按规则、架构、机制、验收、研究与开发分层查找。
- **[开发与打包](docs/development/README.md)**：源码运行、依赖、检查和发布命令。

两季固定招募的207个槽位、146种身份已经逐槽核验；这不代表每名干员的技能、天赋和召唤物都已完成。六模板敌潮替换、逐轮计划、预览与保存恢复已接入。当前主线是**优先补卫戍干员技能的执行缺口**：按[已有客户端逻辑](docs/research/client-logic-pipeline.md)成组复用，脚本展开身份和源等级，敌人/Boss与整局规则并行推进。DPS、资料关联和游戏内实现分别统计，不附带无关重算。完成范围以[逐项验收清单](docs/checklists/README.md)为准。
