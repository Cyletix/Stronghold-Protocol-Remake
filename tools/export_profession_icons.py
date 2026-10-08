# -*- coding: utf-8 -*-
"""
导出 profession_icons_hub.ab 的 8 个职业图标为 PNG。

链路：OBB → .ab(UnityFS) → LZ4 字节序变种解压(tools/decompress_ab.py) → SerializedFile
     → UnityPy 枚举 Sprite/Texture2D → PNG。

职业语义映射（Arknights 内部英文名 → 中文 → 文件名）：
  pioneer(先锋)=vanguard, warrior(近卫)=guard, tank(重装)=defender,
  sniper(狙击)=sniper, caster(术师)=caster, medic(医疗)=medic,
  support(辅助)=supporter, special(特种)=specialist
"""
import sys, io, os, zipfile
from pathlib import Path
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

sys.path.insert(0, str(Path(__file__).parent))
from decompress_ab import parse_ab
import UnityPy
from UnityPy.environment import Environment
from UnityPy.helpers.ImportHelper import parse_file
from UnityPy.streams import EndianBinaryReader

ROOT = Path(__file__).resolve().parent.parent
OBB = ROOT / "work" / "main.obb"
AB_PATH = "assets/AB/Android/arts/misc/profession_icons_hub.ab"
OUT_DIR = ROOT / "web" / "assets" / "profession_icons"

# Arknights 内部职业英文名 → 语义文件名
PROFESSION_MAP = {
    "pioneer": "vanguard",
    "warrior": "guard",
    "tank": "defender",
    "sniper": "sniper",
    "caster": "caster",
    "medic": "medic",
    "support": "supporter",
    "special": "specialist",
}


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    with zipfile.ZipFile(OBB) as z:
        ab = z.read(AB_PATH)
    nodes = parse_ab(ab)
    print(f"{AB_PATH.split('/')[-1]}: {len(nodes)} node")

    # 构造 Environment，把 SerializedFile + resS 都注册进去（resS 供 Texture2D 读取像素）
    env = Environment()
    for path, blob in nodes:
        reader = EndianBinaryReader(blob)
        f = parse_file(reader, env, path)
        env.register_cab(path, f)
        env.files[path] = f
        print(f"  node: {path} ({len(blob)} 字节)")

    sprites = [o for o in env.objects if o.type.name == "Sprite"]
    textures = {o.path_id: o for o in env.objects if o.type.name == "Texture2D"}
    print(f"Sprite: {len(sprites)}，Texture2D: {len(textures)}")

    exported = []
    for obj in sprites:
        sprite = obj.read()
        name = sprite.m_Name  # 例如 icon_profession_pioneer
        # 从名字里抽职业英文名（icon_profession_<prof>）
        prof = name.replace("icon_profession_", "").strip()
        out_name = PROFESSION_MAP.get(prof, prof)

        # 拿到 texture 引用与 PIL image
        tex_obj = None
        tex_name = None
        try:
            tex_ptr = sprite.m_RD.texture
            tex_obj = textures.get(getattr(tex_ptr, "path_id", None), None)
            if tex_obj is not None:
                tex_name = tex_obj.read().m_Name
        except Exception:
            pass

        try:
            img = sprite.image  # PIL Image（UnityPy 已处理压缩纹理/裁剪）
        except Exception as e:
            print(f"  [跳过] {name}: image 读取失败 {e}")
            continue

        w, h = img.size
        out_path = OUT_DIR / f"{out_name}.png"
        img.save(out_path)
        exported.append(out_path)
        print(f"  ✓ {name} (path_id={obj.path_id}) → {out_name}.png  ({w}×{h})  texture={tex_name}  {out_path.relative_to(ROOT)}")

    print(f"\n共导出 {len(exported)} 个 PNG → {OUT_DIR.relative_to(ROOT)}")
    if len(exported) != 8:
        print(f"⚠️ 预期 8 个，实际 {len(exported)} 个")


if __name__ == "__main__":
    main()
