# -*- coding: utf-8 -*-
"""
导出敌人图标（158×158）：spritepack/icon_enemies_*.ab，命名 = enemyId（如 enemy_1032_katar）。
补 web/enemy_avatars/ 里 PRTS 缺失的敌人（enemy_avatars 已有则不覆盖）。
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
OUT_DIR = ROOT / "web" / "enemy_avatars"


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(OBB) as z:
        names = [n for n in z.namelist() if "/spritepack/icon_enemies_" in n and n.endswith(".ab")]
    print("icon_enemies bundle:", [n.split('/')[-1] for n in names])

    total = filled = 0
    for bname in names:
        with zipfile.ZipFile(OBB) as z:
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
            if not name or not name.startswith("enemy_"):
                continue
            total += 1
            outp = OUT_DIR / f"{name}.png"
            if outp.exists():
                continue
            sp.image.save(outp)
            filled += 1
    print(f"OBB 敌人图标 {total} 个，补 {filled} 个 → {OUT_DIR.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
