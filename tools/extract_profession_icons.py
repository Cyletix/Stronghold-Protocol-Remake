# -*- coding: utf-8 -*-
"""
从 ArknightR 提取干员职业图标（res_fui + res_atlas）。

FairyGUI fui 二进制包（大端序，version 6）：
  Header(FGUI + version(i32) + compressed(bool) + pkgId(utf) + pkgName(utf) + reserved(20))
  IndexTable(segCount(u8) + useShort(bool) + offsets[])
  Block0=Dependencies, Block1=PackageItems, Block2=Sprites, Block3=PixelHitTest, Block4=StringTable, Block5=patches
  字符串引用 readS() = u16 索引进 stringTable（65534=null, 65533=空）

注意：UnityPy 用 surrogateescape 解码 TextAsset.m_Script，必须用 surrogateescape 恢复原始字节，
      surrogatepass 会把 0x80-0xFF 高位字节错误编码成 3 字节 UTF-8，破坏二进制。
"""
import struct, sys, io, json
from pathlib import Path
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
from UnityPy import Environment
from PIL import Image

ARKR_UI = Path(r"D:\下载\Games\ArknightR\ArknightR_Data\StreamingAssets\aa\StandaloneWindows64\defaultlocalgroup_assets_assets\bundles\ui")
WEB = Path(r"D:\OneDrive\Project\ArknightsResearch\卫戍协议复刻\web")
OUT = WEB / "profession_icons"
OUT.mkdir(exist_ok=True)

PROF_ABBR = {"pione":"PIONEER","pion":"PIONEER","guard":"GUARD","guad":"GUARD",
             "snipe":"SNIPER","nipe":"SNIPER","cast":"CASTER","medic":"MEDIC","medc":"MEDIC",
             "dfend":"DEFENDER","fend":"DEFENDER","suppo":"SUPPORT","supo":"SUPPORT","spec":"SPECIAL"}


class Reader:
    def __init__(self, data):
        self.data = data; self.pos = 0; self.string_table = []
    def seek(self, p): self.pos = p
    def u8(self): v = self.data[self.pos]; self.pos += 1; return v
    def bool(self): return self.u8() != 0
    def u16(self): v = struct.unpack_from(">H", self.data, self.pos)[0]; self.pos += 2; return v
    def i32(self): v = struct.unpack_from(">i", self.data, self.pos)[0]; self.pos += 4; return v
    def u32(self): v = struct.unpack_from(">I", self.data, self.pos)[0]; self.pos += 4; return v
    def utf(self):
        n = self.u16()
        if n == 0xFFFF: return None
        raw = self.data[self.pos:self.pos+n]; self.pos += n
        return raw.decode("utf-8", "replace")
    def readS(self):
        i = self.u16()
        if i == 65534: return None
        if i == 65533: return ""
        return self.string_table[i] if i < len(self.string_table) else f"<#{i}>"


def read_fui_text(pat):
    for p in sorted(ARKR_UI.glob(pat)):
        env = Environment(); env.load_file(str(p))
        for o in env.objects:
            if o.type.name == "TextAsset":
                r = o.read()
                if isinstance(r.m_Script, bytes):
                    return r.m_Script
                return r.m_Script.encode("utf-8", "surrogateescape")
    return None


def parse_fui(data):
    r = Reader(data)
    r.pos = 4
    version = r.i32(); compressed = r.bool(); pkg_id = r.utf(); pkg_name = r.utf()
    r.pos += 20
    index_pos = r.pos
    r.seek(index_pos)
    seg = r.u8(); use_short = r.bool()
    offsets = [r.u16() if use_short else r.u32() for _ in range(seg)]
    def bp(i):
        return None if offsets[i] == 0 else index_pos + offsets[i]
    # StringTable (block 4)
    r.seek(bp(4)); cnt = r.i32()
    r.string_table = [r.utf() for _ in range(cnt)]
    # PackageItems (block 1)
    items = []
    r.seek(bp(1)); n = r.u16()
    for _ in range(n):
        dl = r.i32(); s = r.pos
        t = r.u8(); iid = r.readS(); nm = r.readS()
        path = r.readS(); file = r.readS()
        r.bool()
        w = r.i32(); h = r.i32()
        items.append({"type": t, "id": iid, "name": nm, "file": file, "w": w, "h": h})
        r.seek(s + dl)
    # Sprites (block 2)
    sprites = []
    r.seek(bp(2)); n = r.u16()
    for _ in range(n):
        s1 = r.readS(); s2 = r.readS(); s3 = r.readS()
        x = r.i32(); y = r.i32(); w = r.i32(); h = r.i32()
        rotated = r.bool()
        trimmed = r.bool()
        if trimmed:
            r.i32(); r.i32(); r.i32(); r.i32()  # offsetX/offsetY/originalW/originalH
        sprites.append({"s1": s1, "s2": s2, "s3": s3, "x": x, "y": y, "w": w, "h": h, "rotated": rotated})
    return {"name": pkg_name, "items": items, "sprites": sprites, "string_table": r.string_table}


fui = read_fui_text("res_fui_*.bundle")
pkg = parse_fui(fui)
print("包:", pkg["name"], "items:", len(pkg["items"]), "sprites:", len(pkg["sprites"]))

id2name = {it["id"]: it["name"] for it in pkg["items"]}
id2file = {it["id"]: it["file"] for it in pkg["items"]}
atlas_file = {it["id"]: it["file"] for it in pkg["items"] if it["file"] and str(it["file"]).lower().endswith(".png")}

# 找 8 个 icon_c 职业图标（Image item，name → id → prof）
targets = {}
for it in pkg["items"]:
    nm = it["name"] or ""
    if nm.startswith("icon_c") and nm[6:] in PROF_ABBR:
        targets[nm] = {"id": it["id"], "prof": PROF_ABBR[nm[6:]]}
print("职业图标数:", len(targets))

# sprite 结构：s1=name, s2=itemId, s3=atlas名；用 s2 匹配 item id
result = []
for nm, info in targets.items():
    sp = next((s for s in pkg["sprites"] if s["s2"] == info["id"]), None)
    if sp:
        result.append({"name": nm, "prof": info["prof"], "atlas": sp["s3"],
                       "x": sp["x"], "y": sp["y"], "w": sp["w"], "h": sp["h"], "rotated": sp["rotated"]})
        print(f"  {nm} -> atlas={sp['s3']} rect=({sp['x']},{sp['y']},{sp['w']},{sp['h']}) rot={sp['rotated']} ({info['prof']})")
    else:
        print(f"  {nm} -> 无 sprite (id={info['id']})")

# atlas 名 → 图集 PNG 文件名
atlas_name2file = {}
for it in pkg["items"]:
    if it["file"] and str(it["file"]).lower().endswith(".png"):
        atlas_name2file[it["name"] or ""] = it["file"]
        atlas_name2file[it["id"] or ""] = it["file"]

# 提取 atlas 图集 + 切图
def load_atlas(atlas_key):
    f = atlas_name2file.get(atlas_key)
    if not f:
        return None, None
    stem = f.rsplit(".", 1)[0]  # 如 "atlas1_3"
    for p in ARKR_UI.glob(f"res_{stem}_*.bundle"):
        env = Environment(); env.load_file(str(p))
        for o in env.objects:
            if o.type.name == "Texture2D":
                tex = o.read()
                return tex.image, f
    return None, f

mapping = {}
for r in result:
    atlas_key = r["atlas"]
    im, fname = load_atlas(atlas_key)
    if im is None:
        print(f"  [缺图集] {r['name']} atlas={atlas_key} file={fname}")
        continue
    x, y, w, h = r["x"], r["y"], r["w"], r["h"]
    crop = im.crop((x, y, x + w, y + h))
    if r["rotated"]:
        crop = crop.transpose(Image.ROTATE_270)
    # 统一缩放到 128x128
    crop = crop.resize((128, 128), Image.LANCZOS)
    prof = r["prof"]
    out_path = OUT / f"icon_{prof}.png"
    crop.save(out_path)
    mapping[prof] = {"name": r["name"], "atlas": fname, "rect": [x, y, w, h]}
    print(f"  [保存] {prof} <- {r['name']} ({fname} {x},{y},{w},{h})")

(OUT / "map.json").write_text(json.dumps(mapping, ensure_ascii=False, indent=1), encoding="utf-8")
print("完成，输出目录:", OUT)
