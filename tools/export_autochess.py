# -*- coding: utf-8 -*-
"""
导出卫戍协议（autoChess）专属素材：
- act1vautochess_token_chess（180×180 棋子 token）
- autochess_level_1~6（42×42 段位图标）
- pic_*_battle（120×120 表情）
输出到 web/ui/autochess/
"""
import sys, io, zipfile
from pathlib import Path
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
sys.path.insert(0, str(Path(__file__).parent))
from decompress_ab import parse_ab
from UnityPy.environment import Environment
from UnityPy.helpers.ImportHelper import parse_file
from UnityPy.streams import EndianBinaryReader

ROOT = Path(__file__).resolve().parent.parent
OBB = ROOT / "work" / "main.obb"
OUT_DIR = ROOT / "web" / "ui" / "autochess"

BUNDLES = [
    "assets/AB/Android/activity/commonassets.ab",
    "assets/AB/Android/arts/ui/[uc]battlecommon.ab",
    "assets/AB/Android/ui/emoticon/theme/[uc]emoticon_autochess_basic.ab",
]


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    total = 0
    with zipfile.ZipFile(OBB) as z:
        for bname in BUNDLES:
            ab = z.read(bname)
            env = Environment()
            for p, b in parse_ab(ab):
                f = parse_file(EndianBinaryReader(b), env, p)
                env.register_cab(p, f)
                env.files[p] = f
            for o in env.objects:
                if o.type.name != "Sprite":
                    continue
                sp = o.read()
                name = sp.m_Name
                if not name:
                    continue
                if ("autochess" in name) or ("chess" in name) or ("_battle" in name and name.startswith("pic_")):
                    img = sp.image
                    img.save(OUT_DIR / f"{name}.png")
                    total += 1
                    print(f"  ✓ {name} ({img.size[0]}×{img.size[1]})")
    print(f"导出 {total} 个 → {OUT_DIR.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
