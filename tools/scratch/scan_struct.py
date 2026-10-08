import json, os, io
root = r"D:\OneDrive\Project\卫戍协议复刻\data\ArknightsGameData"
out = io.open(r"D:\OneDrive\Project\卫戍协议复刻\work\activity_struct.txt", "w", encoding="utf-8")
for server in ["zh_CN", "ja_JP"]:
    fp = os.path.join(root, server, "gamedata", "excel", "activity_table.json")
    data = json.load(open(fp, encoding="utf-8"))
    out.write("=== %s top-level keys ===\n" % server)
    out.write(str(list(data.keys())) + "\n")
    for k, v in data.items():
        if isinstance(v, dict):
            out.write("  [%s] dict keys: %s\n" % (k, list(v.keys())[:20]))
            for f in ["id", "type", "name", "startTime", "activityType", "stageId"]:
                if f in v:
                    out.write("      %s=%r\n" % (f, v[f]))
        elif isinstance(v, list):
            out.write("  [%s] list len=%d\n" % (k, len(v)))
        else:
            out.write("  [%s] %r\n" % (k, str(v)[:100]))
out.close()
print("done")