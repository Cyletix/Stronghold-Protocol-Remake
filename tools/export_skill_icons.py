# -*- coding: utf-8 -*-
"""
导出技能图标：spritepack/skill_icons_0/1/2/3.ab 的 128×128 Sprite。
命名 = 原始 name（如 skill_icon_skchr_amiya_1、skill_icon_skcom_powerstrike[2]），
直接对应 gamedata skill_table 的 skillId/iconId。

输出：web/ui/skillicons/
"""
import sys, io, os, re, shutil, zipfile
from pathlib import Path
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
sys.path.insert(0, str(Path(__file__).parent))
from decompress_ab import parse_ab
from UnityPy.environment import Environment
from UnityPy.helpers.ImportHelper import parse_file
from UnityPy.streams import EndianBinaryReader

ROOT = Path(__file__).resolve().parent.parent
OBB = ROOT / "work" / "main.obb"
OUT_DIR = ROOT / "web" / "ui" / "skillicons"


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(OBB) as z:
        names = [n for n in z.namelist() if "/spritepack/skill_icons_" in n and n.endswith(".ab")]
    print("skill_icons bundle:", [n.split('/')[-1] for n in names])

    total = 0
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
            if not name or not name.startswith("skill_icon_"):
                continue
            img = sp.image
            outp = OUT_DIR / f"{name}.png"
            img.save(outp)
            total += 1

    # 通用图标去 [n] 别名：skill_icon_skcom_x[n].png → skill_icon_skcom_x.png
    # （skill_data.json 的 prefabId 不带 [n]，需别名才能命中）
    alias = 0
    for f in os.listdir(OUT_DIR):
        if f.endswith(".png") and "[" in f:
            dst = OUT_DIR / re.sub(r"\[\d+\]", "", f)
            if not dst.exists():
                shutil.copyfile(OUT_DIR / f, dst)
                alias += 1

    print(f"导出 {total} 个技能图标（+{alias} 个去 [n] 别名）→ {OUT_DIR.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
