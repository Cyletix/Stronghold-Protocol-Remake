# 从 ArknightR 提取 UI 图集（技能图标/战斗UI），作为图标参考素材（单个图标需另解析 fui 坐标）
import sys, io
from pathlib import Path
from UnityPy import Environment

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
ARKR = Path(r"D:\下载\Games\ArknightR")
BASE = ARKR / "ArknightR_Data" / "StreamingAssets" / "aa" / "StandaloneWindows64" / "defaultlocalgroup_assets_assets" / "bundles" / "ui"
PROJ = Path(r"D:\OneDrive\Project\ArknightsResearch\卫戍协议复刻")
OUT = PROJ / "web" / "ui"
OUT.mkdir(exist_ok=True)

for pat in ["skillicon_atlas0_*.bundle", "battleui_atlas0_*.bundle"]:
    for p in sorted(BASE.glob(pat)):
        env = Environment()
        env.load_file(str(p))
        for o in env.objects:
            if o.type.name == "Texture2D":
                tex = o.read()
                name = tex.m_Name
                tex.image.save(str(OUT / f"{name}.png"))
                print("saved", name, f"{tex.m_Width}x{tex.m_Height}")
