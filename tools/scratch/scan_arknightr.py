# 扫描 ArknightR 第三方版本的 AssetBundle 素材，了解结构（音频/图片/干员/UI）
import sys, io
from pathlib import Path
from UnityPy import Environment

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
ROOT = Path(r"D:\下载\Games\ArknightR")
BASE = ROOT / "ArknightR_Data" / "StreamingAssets" / "aa" / "StandaloneWindows64" / "defaultlocalgroup_assets_assets" / "bundles"


def scan_sub(name, limit=50):
    d = BASE / name
    if not d.exists():
        return
    print(f"\n===== {name} =====")
    bundles = list(d.rglob("*.bundle"))
    print(f"bundle count: {len(bundles)}")
    shown = 0
    for b in bundles[:limit]:
        try:
            env = Environment()
            env.load_file(str(b))
            objs = [o for o in env.objects if o.type.name != "AssetBundle"]
            if not objs:
                continue
            names = []
            for o in objs[:6]:
                try:
                    names.append(f"{o.type.name}:{o.read().m_Name}")
                except Exception:
                    names.append(o.type.name)
            print(f"  {b.name[:30]:32s} -> {', '.join(names)}")
            shown += 1
            if shown >= 20:
                print("  ... (truncated)")
                break
        except Exception as e:
            print(f"  {b.name[:30]:32s} FAIL {e}")


for sub in ["audio", "image", "ui", "units"]:
    scan_sub(sub)
