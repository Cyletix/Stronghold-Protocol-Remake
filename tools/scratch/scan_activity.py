import json, os, io
root = r"D:\OneDrive\Project\卫戍协议复刻\data\ArknightsGameData"
out = io.open(r"D:\OneDrive\Project\卫戍协议复刻\work\activity_scan.txt", "w", encoding="utf-8")
keys = ["autochess", "卫戍", "守衛", "chess", "weishu", "garrison", "sandbox", "rogue", "auto", "climb"]
for server in ["zh_CN", "ja_JP"]:
    fp = os.path.join(root, server, "gamedata", "excel", "activity_table.json")
    data = json.load(open(fp, encoding="utf-8"))
    items = list(data.items()) if isinstance(data, dict) else [(str(i), v) for i, v in enumerate(data)]
    out.write("=== %s total=%d ===\n" % (server, len(items)))
    for k, v in items:
        if not isinstance(v, dict):
            continue
        name = v.get("name") or ""
        typ = v.get("type") or ""
        blob = (str(k) + " " + str(name) + " " + str(typ)).lower()
        if any(t in blob for t in keys):
            out.write("%s | type=%s | name=%s\n" % (k, typ, name))
out.close()
print("done")