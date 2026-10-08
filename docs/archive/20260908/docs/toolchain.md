# 工具链清单

按用途分类；标注「必装 / 可选 / 仅参考」。链接以官方仓库为准。

## 0. 环境与基础

- **Python 3.11+**：提取脚本、UnityPy 生态。必装。
- **.NET SDK 8**：跑 C# 工具（AssetStudio 等）。可选。
- **Node.js / Go**：服务器开发（二选一，建议 Go 或 Node/TS）。必装其一。
- **git**：版本管理。必装。
- **7-Zip**：解包 APK。必装。

## 1. APK 解包与素材提取

- **apktool**：反编译 APK 资源 / Manifest。https://github.com/iBotPeaches/Apktool
- **jadx**：反编译 DEX（理解启动逻辑，非核心）。https://github.com/skylot/jadx
- **UnityPy**（Python 库）：脚本化提取 AssetBundle，支持 XOR 解密、批量导出。https://github.com/K0lb3/UnityPy —— 脚本化首选
- **AssetStudio**（C#，GUI）：解析 Unity AssetBundle / 资产，支持解密。https://github.com/Perfare/AssetStudio
- **UABE (UABEA)**：手动查看 / 编辑 AB。https://github.com/nesrak1/UABEA
- **AssetsTools.NET**：.NET 库（UABE 底层），可脚本化。https://github.com/nesrak1/AssetsTools.NET

### 1.1 项目内 OBB 解包/检索工具（本仓库 `tools/`，已打通）

- `decompress_ab.py`：OBB `.ab` 解压器。UnityFS v8 header + LZ4HC 解 BlocksInfo + data block **codec=4/5 = LZ4 字节序变种**（token 高低 4 位交换 + offset 大小端交换，非 LZHAM）→ SerializedFile。全管线入口。
- `asset_db.py`：SQLite 资产索引 schema（`bundles`/`objects` 表 + 6 个分类视图）。
- `build_inventory.py`：扫描 2617 个 `.ab` → `work/inventory.sqlite`（152 万对象）。
- `search_assets.py`：资产搜索 CLI（关键词 / `--kind image|text|audio|mesh|animation|font` / `--min-width/height` / `--bundle`）。
- `export_asset.py`：定向导出单个资源（`--bundle` + `--path-id`/`--name`/`--type` → PNG/TextAsset）。
- `export_profession_icons.py` / `export_profession_variants.py`：职业图标（26/74/256×256 各 variant）。
- `export_skill_icons.py`：技能图标（1483 个 128×128 独立图标）。
- `export_autochess.py`：卫戍协议专属素材（棋子 token/段位/表情）。
- `export_enemy_icons.py`：敌人图标（158×158，补 PRTS 缺失）。
- `export_sfx.py`：通用音效（AudioClip → FSB5 Vorbis → Ogg/MP3），需本地 libvorbis/libogg/libvorbisenc DLL（`tools/libs/`，从 Audacity 复制）+ `pip install fsb5` + ffmpeg。

## 2. 游戏数据（gamedata）

- **Kengxxiao/ArknightsGameData**：CN 服 gamedata JSON（关卡、干员、掉落、敌人、活动等），每日更新。https://github.com/Kengxxiao/ArknightsGameData —— 服务器数据来源首选（`yuanyan3060/ArknightsGameData` 已弃用，2021 旧数据不含卫戍协议）
- **Kengxxiao/ArknightsGameResource**：素材（头像、立绘、图标、敌人、地图等）。https://github.com/Kengxxiao/ArknightsGameResource

## 3. IL2CPP 与逆向

- **Il2CppDumper**：导出 il2cpp 符号 / 结构（`global-metadata.dat` + `GameAssembly.dll`/`libil2cpp.so`）。https://github.com/Perfare/Il2CppDumper
- **Cpp2IL**：将 IL2CPP 二进制还原为可读 IL / 伪 C#。https://github.com/SamboyCoding/Cpp2IL —— 比 Il2CppDumper 更完整
- **Ghidra**（免费）/ **IDA Pro**（收费）：native 层静态分析。https://ghidra-sre.org
- **dnSpy / ILSpy**：仅旧版 Mono 客户端可用（现版已 IL2CPP）。https://github.com/dnSpy/dnSpy
- **frida**：动态 hook，验证登录 / 地址逻辑、绕过校验。https://frida.re
- **Objection**：基于 frida 的移动逆向辅助。https://github.com/sensepost/objection

## 4. 网络抓包与协议分析

- **mitmproxy**（推荐）/ Fiddler / Charles：抓 HTTP，改包验证。https://mitmproxy.org
- **Wireshark**：抓 socket 流量，看长连接协议。https://www.wireshark.org
- **protoc / protobuf-net**：解析 protobuf 消息（若协议为 protobuf）。https://github.com/protocolbuffers/protobuf
- **CyberChef / xxd**：二进制 / 十六进制辅助。

## 5. 服务器开发

- 语言建议：**Go**（并发好、单二进制部署、长连接成熟）或 **Node/TS**（可参考 Arkdays 早期实现）。
- **SQLite**：账号 / 进度 / 背包存储，起步即可。https://www.sqlite.org
- **protobuf / msgpack / json**：按客户端协议选型。
- **Docker**：最终打包分发。可选。

## 6. 联机 / 内网穿透

- **Tailscale**（推荐）/ **ZeroTier**：点对点虚拟组网，零配置，熟人间首选。https://tailscale.com / https://www.zerotier.com
- **frp**：需一台有公网 IP 的 VPS 做中转（无点对点能力时用）。https://github.com/fatedier/frp
- **直接部署到 VPS**：最稳，但需维护服务器。
