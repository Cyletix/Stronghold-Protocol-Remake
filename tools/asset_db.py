# -*- coding: utf-8 -*-
"""资产索引数据库（SQLite）共享模块：路径、schema、连接。"""
import sqlite3
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DB = ROOT / "work" / "inventory.sqlite"

SCHEMA = """
CREATE TABLE IF NOT EXISTS bundles (
    id INTEGER PRIMARY KEY,
    path TEXT UNIQUE,
    node_name TEXT
);
CREATE TABLE IF NOT EXISTS objects (
    id INTEGER PRIMARY KEY,
    bundle_id INTEGER,
    path_id INTEGER,
    type TEXT,
    name TEXT,
    width INTEGER,
    height INTEGER
);
CREATE INDEX IF NOT EXISTS idx_objects_type ON objects(type);
CREATE INDEX IF NOT EXISTS idx_objects_name ON objects(name);
CREATE INDEX IF NOT EXISTS idx_objects_bundle ON objects(bundle_id);
CREATE INDEX IF NOT EXISTS idx_objects_size ON objects(width, height);

-- 可读分类视图：把「Unity 对象索引」收窄成「素材集合」（统一含 width/height，非图片类为 NULL）
DROP VIEW IF EXISTS image_assets;
CREATE VIEW image_assets AS
SELECT o.id, b.path AS bundle, o.path_id, o.type, o.name, o.width, o.height
FROM objects o JOIN bundles b ON b.id = o.bundle_id
WHERE o.type IN ('Texture2D', 'Sprite');

DROP VIEW IF EXISTS text_assets;
CREATE VIEW text_assets AS
SELECT o.id, b.path AS bundle, o.path_id, o.type, o.name, NULL AS width, NULL AS height
FROM objects o JOIN bundles b ON b.id = o.bundle_id
WHERE o.type = 'TextAsset';

DROP VIEW IF EXISTS audio_assets;
CREATE VIEW audio_assets AS
SELECT o.id, b.path AS bundle, o.path_id, o.type, o.name, NULL AS width, NULL AS height
FROM objects o JOIN bundles b ON b.id = o.bundle_id
WHERE o.type = 'AudioClip';

DROP VIEW IF EXISTS mesh_assets;
CREATE VIEW mesh_assets AS
SELECT o.id, b.path AS bundle, o.path_id, o.type, o.name, NULL AS width, NULL AS height
FROM objects o JOIN bundles b ON b.id = o.bundle_id
WHERE o.type = 'Mesh';

DROP VIEW IF EXISTS animation_assets;
CREATE VIEW animation_assets AS
SELECT o.id, b.path AS bundle, o.path_id, o.type, o.name, NULL AS width, NULL AS height
FROM objects o JOIN bundles b ON b.id = o.bundle_id
WHERE o.type = 'AnimationClip';

DROP VIEW IF EXISTS font_assets;
CREATE VIEW font_assets AS
SELECT o.id, b.path AS bundle, o.path_id, o.type, o.name, NULL AS width, NULL AS height
FROM objects o JOIN bundles b ON b.id = o.bundle_id
WHERE o.type = 'Font';
"""

# kind → 查询表（view 或 objects 全表）
KIND_TABLE = {
    "image": "image_assets",
    "images": "image_assets",
    "text": "text_assets",
    "audio": "audio_assets",
    "mesh": "mesh_assets",
    "animation": "animation_assets",
    "font": "font_assets",
}


def connect(db=DB):
    conn = sqlite3.connect(str(db))
    conn.executescript(SCHEMA)
    return conn
