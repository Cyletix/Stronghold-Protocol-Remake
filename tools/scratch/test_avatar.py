import hashlib, urllib.request, urllib.parse, os
name = "头像_阿米娅.png"
h = hashlib.md5(name.encode("utf-8")).hexdigest()
url = "https://media.prts.wiki/%s/%s/%s" % (h[0], h[0:2], urllib.parse.quote(name))
print("url:", url)
os.makedirs(r"D:\OneDrive\Project\卫戍协议复刻\web\avatars", exist_ok=True)
out = r"D:\OneDrive\Project\卫戍协议复刻\web\avatars\test.png"
try:
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    data = urllib.request.urlopen(req, timeout=20).read()
    open(out, "wb").write(data)
    print("下载成功:", len(data), "字节")
except Exception as e:
    print("下载失败:", e)