# 在 ArknightR 第三方版本中查找所有 AudioClip（音频），定位部署音效/BGM
import sys, io
from pathlib import Path
from UnityPy import Environment

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
ROOT = Path(r"D:\下载\Games\ArknightR")
BASE = ROOT / "ArknightR_Data" / "StreamingAssets" / "aa" / "StandaloneWindows64" / "defaultlocalgroup_assets_assets" / "bundles"

found = []
for sub in ["audio", "other", "bullet", "effect", "ui"]:
    d = BASE / sub
    if not d.exists():
        continue
    for b in d.rglob("*.bundle"):
        try:
            env = Environment()
            env.load_file(str(b))
            for o in env.objects:
                if o.type.name == "AudioClip":
                    try:
                        clip = o.read()
                        found.append((b.parent.name, b.name, clip.m_Name, clip.m_Size))
                    except Exception as e:
                        found.append((b.parent.name, b.name, "?", f"err:{e}"))
        except Exception:
            pass

print(f"AudioClip count: {len(found)}")
for parent, name, clipname, size in found:
    print(f"  [{parent}] {clipname}  ({size} bytes)  <- {name[:40]}")
