import json, os, glob
root = r"D:\OneDrive\Project\卫戍协议复刻\data\ArknightsGameData"
terms = ["autochess", "auto_chess", "卫戍", "守衛", "garrison", "guard", "chess", "weishu"]
for server in ["ja_JP", "zh_CN"]:
    base = os.path.join(root, server, "gamedata", "excel")
    for fp in sorted(glob.glob(os.path.join(base, "**", "*.json"), recursive=True)):
        try:
            txt = open(fp, encoding="utf-8").read()
        except Exception:
            continue
        low = txt.lower()
        hits = [t for t in terms if t.lower() in low]
        if hits:
            print("[" + server + "] " + os.path.relpath(fp, root) + " -> " + str(hits))