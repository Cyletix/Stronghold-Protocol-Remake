# -*- coding: utf-8 -*-
"""
导出职业图标各 variant 做对比：profession_large_hub（256×256 高清）+ profession_no_shadow_hub（74×76）。
输出到 work/export/profession_large/ 与 work/export/profession_no_shadow/。
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

# 职业语义名 → 文件名
PROFESSION_MAP = {
    "pioneer": "vanguard", "warrior": "guard", "tank": "defender", "sniper": "sniper",
    "caster": "caster", "medic": "medic", "support": "supporter", "special": "specialist",
}


def export_hub(z, ab_path, out_dir, name_filter=None, exclude=None):
    ab = z.read(ab_path)
    env = Environment()
    for p, b in parse_ab(ab):
        f = parse_file(EndianBinaryReader(b), env, p)
        env.register_cab(p, f)
        env.files[p] = f
    out_dir.mkdir(parents=True, exist_ok=True)
    n = 0
    for o in env.objects:
        if o.type.name != "Sprite":
            continue
        sp = o.read()
        name = sp.m_Name
        if name_filter and name_filter not in name:
            continue
        if exclude and exclude in name:
            continue
        # 去掉 _large / _large_white 后缀，还原职业英文名
        prof = name.replace("icon_profession_", "").replace("_large_white", "").replace("_large", "")
        out_name = PROFESSION_MAP.get(prof, prof)
        img = sp.image
        outp = out_dir / f"{out_name}.png"
        img.save(outp)
        n += 1
        print(f"  ✓ {name} → {outp.relative_to(ROOT)} ({img.size[0]}×{img.size[1]})")
    return n


def main():
    with zipfile.ZipFile(OBB) as z:
        print("=== profession_large_hub（256×256 高清，_large 非 white）===")
        n1 = export_hub(z, "assets/AB/Android/arts/profession_large_hub.ab",
                        ROOT / "work" / "export" / "profession_large",
                        name_filter="_large", exclude="_large_white")
        print(f"  导出 {n1} 个\n")

        print("=== profession_no_shadow_hub（74×76 无阴影）===")
        n2 = export_hub(z, "assets/AB/Android/arts/profession_no_shadow_hub.ab",
                        ROOT / "work" / "export" / "profession_no_shadow")
        print(f"  导出 {n2} 个")


if __name__ == "__main__":
    main()
