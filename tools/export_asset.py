# -*- coding: utf-8 -*-
"""
从 OBB 定向导出一个资源对象（按 bundle + path_id / name）。

用法：
  python tools/export_asset.py --bundle profession_icons_hub.ab --path-id -8626529263415022793
  python tools/export_asset.py --bundle profession_icons_hub.ab --name icon_profession_pioneer
  python tools/export_asset.py --name skill_icon_combt_1 --type Sprite

支持类型：
  Sprite / Texture2D → PNG
  TextAsset          → 原始 bytes（.txt / 原扩展名）
  AudioClip / Mesh / AnimationClip / Font → 用 UnityPy 通用导出

输出目录：work/export/（默认）
"""
import sys, io, re, zipfile, argparse
from pathlib import Path
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

sys.path.insert(0, str(Path(__file__).parent))
from decompress_ab import parse_ab
from UnityPy.environment import Environment
from UnityPy.helpers.ImportHelper import parse_file
from UnityPy.streams import EndianBinaryReader

ROOT = Path(__file__).resolve().parent.parent
OBB = ROOT / "work" / "main.obb"
OUT_DIR = ROOT / "work" / "export"


def safe_name(s):
    return re.sub(r"[^\w.\-]", "_", s or "unnamed")


def load_env(ab_bytes):
    nodes = parse_ab(ab_bytes)
    env = Environment()
    for path, blob in nodes:
        f = parse_file(EndianBinaryReader(blob), env, path)
        env.register_cab(path, f)
        env.files[path] = f
    return env


def export_object(env, obj, out_dir: Path):
    typ = obj.type.name
    try:
        data = obj.read()
    except Exception as e:
        print(f"  [失败] {typ} 读取: {e}")
        return None
    name = getattr(data, "m_Name", "") or typ
    fn = safe_name(name)

    if typ in ("Sprite", "Texture2D"):
        try:
            img = data.image
        except Exception as e:
            print(f"  [失败] {typ} {name}: 像素读取 {e}")
            return None
        out = out_dir / f"{fn}.png"
        img.save(out)
        return out
    elif typ == "TextAsset":
        script = data.m_Script
        # UnityPy 的 m_Script 是 str（surrogateescape 解码），用 surrogateescape 恢复原始字节
        raw = script.encode("utf-8", "surrogateescape") if isinstance(script, str) else bytes(script)
        ext = (".json" if raw.lstrip()[:1] in (b"{", b"[") else ".txt")
        out = out_dir / f"{fn}{ext}"
        out.write_bytes(raw)
        return out
    else:
        # 其余类型尝试 UnityPy 通用导出
        try:
            out = out_dir / f"{fn}.{typ.lower()}"
            exported = data.export()
            if isinstance(exported, dict):
                for k, v in exported.items():
                    (out_dir / safe_name(k)).write_bytes(v)
                return out_dir / safe_name(next(iter(exported)))
            else:
                out.write_bytes(exported)
                return out
        except Exception as e:
            print(f"  [跳过] {typ} {name}: 无通用导出实现 ({e})")
            return None


def main():
    ap = argparse.ArgumentParser(description="定向导出单个资源")
    ap.add_argument("--bundle", help="bundle 名或路径（模糊匹配）")
    ap.add_argument("--path-id", type=int, help="对象 path_id")
    ap.add_argument("--name", help="对象名（模糊匹配，配合 --bundle/--type）")
    ap.add_argument("--type", help="对象类型")
    ap.add_argument("--out", help="输出目录", default=str(OUT_DIR))
    args = ap.parse_args()

    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)

    with zipfile.ZipFile(OBB) as z:
        all_names = [n for n in z.namelist() if n.endswith(".ab")]
    if args.bundle:
        matched = [n for n in all_names if args.bundle in n]
    else:
        matched = all_names
    if not matched:
        print(f"未找到 bundle 匹配 {args.bundle!r}")
        return

    found = 0
    for bname in matched:
        with zipfile.ZipFile(OBB) as z:
            ab = z.read(bname)
        env = load_env(ab)
        for obj in env.objects:
            if args.path_id is not None and obj.path_id != args.path_id:
                continue
            if args.type and obj.type.name != args.type:
                continue
            if args.name:
                try:
                    nm = obj.read().m_Name or ""
                except Exception:
                    continue
                if args.name not in nm:
                    continue
            # 命中，导出
            out = export_object(env, obj, out_dir)
            if out:
                found += 1
                print(f"  ✓ {bname}  {obj.type.name}  {obj.read().m_Name}  → {out.relative_to(ROOT)}")
            if args.path_id is not None:
                # 精确 path_id，命中即止
                return

    print(f"\n导出 {found} 个 → {out_dir.relative_to(ROOT)}" if found else "\n未命中")


if __name__ == "__main__":
    main()
