# -*- coding: utf-8 -*-
"""
从 main.obb 批量提取通用 SFX（AudioClip → FSB5 Vorbis → Ogg → MP3）。

依赖：
  - 本地 libvorbis / libogg / libvorbisenc DLL（从 Audacity 安装目录复制，放项目根或 tools/libs/）
  - fsb5（pip install fsb5）
  - ffmpeg（用于 Ogg → MP3，路径见 FFMPEG 常量，无则只输出 ogg）

用法：
  python tools/export_sfx.py                      # 提取内置列表
  python tools/export_sfx.py b_enemy_dead_n ...   # 提取指定名称
"""
import sys, io, os, zipfile, subprocess, sqlite3
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
sys.path.insert(0, os.path.join(os.path.dirname(__file__)))

# 让依赖 DLL（libvorbis/libogg/libvorbisenc）能被 ctypes 找到
# 说明：find_library 走 PATH，LoadLibrary 走 PATH + add_dll_directory，两者都设上。
_LIBDIRS = [os.path.join(os.path.dirname(os.path.abspath(__file__)), "libs")]
for _d in _LIBDIRS:
    if os.path.isdir(_d):
        os.add_dll_directory(_d)
        os.environ["PATH"] = _d + os.pathsep + os.environ.get("PATH", "")

import fsb5
from decompress_ab import parse_ab
from UnityPy.environment import Environment
from UnityPy.helpers.ImportHelper import parse_file
from UnityPy.streams import EndianBinaryReader

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OBB = os.path.join(ROOT, "work", "main.obb")
DB = os.path.join(ROOT, "work", "inventory.sqlite")
OUT = os.path.join(ROOT, "web", "sfx")
FFMPEG = r"C:\Program Files\ffmpeg-7.0-full_build\bin\ffmpeg.exe"

# 内置提取列表（通用战斗音效，均在 main.obb）
DEFAULT_SFX = [
    "b_enemy_dead_n",   # 敌人死亡（普通）
    "b_enemy_dead_h",   # 敌人死亡（重型）
    "b_ui_win",         # 回合胜利
    "b_ui_lose",        # 回合失败
    "b_ui_whoosh",      # 弹道嗖声
    "b_char_atkboost",  # 攻击加成
    "b_char_defboost",  # 防御加成
    "b_char_healboost", # 治疗加成
]


def find_audio(name):
    conn = sqlite3.connect(DB)
    rows = conn.execute(
        "SELECT bundle, path_id FROM audio_assets WHERE name = ?", (name,)
    ).fetchall()
    conn.close()
    return rows


def load_env(ab_bytes):
    env = Environment()
    for path, blob in parse_ab(ab_bytes):
        if path.endswith(".resource"):
            continue
        f = parse_file(EndianBinaryReader(blob), env, path)
        env.register_cab(path, f)
        env.files[path] = f
    return env


def extract_one(zip, bundle_path, path_id, out_ogg):
    """从 bundle 里按 path_id 取出 AudioClip，重建 Ogg。"""
    ab = zip.read(bundle_path)
    env = load_env(ab)
    nodes = parse_ab(ab)
    resource_blobs = {p: b for p, b in nodes if p.endswith(".resource")}

    clip = None
    for o in env.objects:
        if o.type.name == "AudioClip" and o.path_id == path_id:
            clip = o.read()
            break
    if clip is None:
        return False, "AudioClip 未找到"

    res = getattr(clip, "m_Resource", None)
    if res is None or getattr(res, "m_Size", 0) == 0:
        return False, "非流式音频（m_Resource 为空）"

    src = res.m_Source
    key = src.rsplit("/", 1)[-1]
    blob = resource_blobs.get(key)
    if blob is None:
        return False, f"找不到 .resource 节点 {key}"

    fsb_data = blob[res.m_Offset : res.m_Offset + res.m_Size]
    fsb = fsb5.load(fsb_data)
    if fsb.header.mode != fsb5.SoundFormat.VORBIS:
        return False, f"非 Vorbis 格式（mode={fsb.header.mode}），暂不支持"

    sample = fsb.samples[0]
    rebuilt = fsb.rebuild_sample(sample)
    open(out_ogg, "wb").write(bytes(rebuilt))
    return True, f"{sample.frequency}Hz/{sample.channels}ch/{sample.samples}samples"


def to_mp3(ogg, mp3):
    if not os.path.exists(FFMPEG):
        return False
    subprocess.run(
        [FFMPEG, "-y", "-loglevel", "error", "-i", ogg, "-codec:a", "libmp3lame", "-b:a", "128k", mp3],
        check=False,
    )
    return os.path.exists(mp3)


def main():
    names = sys.argv[1:] or DEFAULT_SFX
    os.makedirs(OUT, exist_ok=True)
    ok = 0
    with zipfile.ZipFile(OBB) as zip:
        for name in names:
            rows = find_audio(name)
            if not rows:
                print(f"[缺失] {name}: inventory 无此音频")
                continue
            bundle, pid = rows[0]
            ogg = os.path.join(OUT, f"{name}.ogg")
            mp3 = os.path.join(OUT, f"{name}.mp3")
            success, info = extract_one(zip, bundle, pid, ogg)
            if not success:
                print(f"[失败] {name}: {info}")
                continue
            mp3_ok = to_mp3(ogg, mp3)
            suffix = f" + {os.path.basename(mp3)}" if mp3_ok else ""
            print(f"[OK] {name}: {info} -> {os.path.basename(ogg)}{suffix}")
            ok += 1
    print(f"\n提取 {ok}/{len(names)} 个 -> {os.path.relpath(OUT, ROOT)}")


if __name__ == "__main__":
    main()
