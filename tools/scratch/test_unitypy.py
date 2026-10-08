import UnityPy
from collections import Counter
path = r"D:\OneDrive\Project\卫戍协议复刻\work\test_ab\emoticon_autochess_basic.ab"
env = UnityPy.load(path)
print("total objects:", len(env.objects))
print("types:", dict(Counter(o.type.name for o in env.objects)))
for o in env.objects:
    if o.type.name == "Texture2D":
        t = o.read()
        try:
            im = t.image
            print("  Tex2D:", t.name, "%dx%d" % (t.width, t.height), "imgsize=%s" % (im.size,))
        except Exception as ex:
            print("  Tex2D:", t.name, "%dx%d" % (t.width, t.height), "err", ex)
    elif o.type.name == "TextAsset":
        ta = o.read()
        print("  TextAsset:", ta.name)