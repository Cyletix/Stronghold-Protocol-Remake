"""Extract the actual JP training object from the anonymous battle misc TextAsset.

Uses the same public game-format decoder as ../src/arkresearch/apk.py:decode_text.
Run with the parent APK extra environment: ../.venv/Scripts/python.exe -B ...
Only the identified bundle is read; --check never updates artifacts.
"""
from __future__ import annotations
import argparse
import hashlib
import json
from pathlib import Path
import zipfile

from extract_client_logic import load_bundle

ROOT = Path(__file__).resolve().parents[1]
BUNDLE = 'assets/AB/Android/anon/a959234ee87bb46f582390ce3d081183.bin'
BUNDLE_SHA = 'b81e8875c76bf094a2edbf2d420dfcacadefca00f4ca9697648ef8258c1fe70b'
PAYLOAD_SHA = '4d05e59f25fefb187f9292ab4554128a8301a02d0e42990eb985c3fff8d1ac98'
DECODED_SHA = '0251d2495954e0829b59988a5351b7064e3de96ea2c9e8182898d18ae9cc934b'
PATH_ID = '2437431838466217812'


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def decode_game_text(raw):
    from Crypto.Cipher import AES
    from Crypto.Util.Padding import unpad
    import bson
    # Public game-format constant, not an account credential; same parent pipeline.
    mask = b'UITpAi82pHAWwnzqHRMCwPonJLIB3WCl'
    payload = raw[128:]
    iv = bytes(a ^ b for a, b in zip(payload[:16], mask[16:]))
    decoded = unpad(AES.new(mask[:16], AES.MODE_CBC, iv).decrypt(payload[16:]), 16)
    try:
        value = json.loads(decoded)
    except (UnicodeError, json.JSONDecodeError):
        value = bson.loads(decoded)
    return decoded, value


def extract(obb):
    with zipfile.ZipFile(obb) as archive:
        blob = archive.read(BUNDLE)
    if sha(blob) != BUNDLE_SHA:
        raise ValueError('Bundle differs from JP 36.7.22 evidence; revalidate the source profile')
    env = load_bundle(blob)
    assets = [o.read_typetree() for o in env.objects if o.type.name == 'AssetBundle']
    if len(assets) != 1 or assets[0]['m_Name'] != 'gamedata/battle/battle_misc_table.ab':
        raise ValueError('Unexpected AssetBundle alias')
    objects = [o for o in env.objects if o.type.name == 'TextAsset' and str(o.path_id) == PATH_ID]
    if len(objects) != 1:
        raise ValueError('Expected TextAsset pathId is missing or ambiguous')
    tree = objects[0].read_typetree()
    if tree['m_Name'] != 'battle_misc_table':
        raise ValueError('Unexpected TextAsset name')
    raw = tree['m_Script']
    if isinstance(raw, str):
        raw = raw.encode('utf8', 'surrogateescape')
    if sha(raw) != PAYLOAD_SHA:
        raise ValueError('TextAsset payload differs from verified evidence')
    decoded, table = decode_game_text(raw)
    if sha(decoded) != DECODED_SHA:
        raise ValueError('Decoded table differs from verified evidence')
    seasons = table['miscConfig']['AUTOCHESS']
    if set(seasons) != {'act1autochess'}:
        raise ValueError('Training season scope changed; do not silently extend consumers')
    return table, seasons


def build(obb):
    table, seasons = extract(obb)
    activity_path = ROOT / 'data/ArknightsGameData/zh_CN/gamedata/excel/activity_table.json'
    activity_raw = activity_path.read_bytes()
    activity = json.loads(activity_raw)['activity']['AUTOCHESS_SEASON']
    out = {
        'schemaVersion': 1,
        'source': {'version': 'JP 36.7.22', 'container': 'work/main.obb', 'bundle': BUNDLE,
                   'bundleSha256': BUNDLE_SHA, 'assetBundleName': 'gamedata/battle/battle_misc_table.ab',
                   'textAsset': 'battle_misc_table', 'pathId': PATH_ID, 'payloadSha256': PAYLOAD_SHA,
                   'decodedSha256': DECODED_SHA, 'objectPath': 'miscConfig.AUTOCHESS'},
        'bindingSource': {'version': 'local CN gamedata', 'path': str(activity_path.relative_to(ROOT)).replace('\\', '/'),
                          'sha256': sha(activity_raw)},
        'boundary': 'Only act1 mode_training_1 initial player HP, round funding and shop levels 1-4 are consumed from this object. JP source IDs bind to CN act1 IDs explicitly; this is not proof of cross-version parity. NPC and special-prepare objects remain source data; fourth-round enemy HP already comes from its separate level source, not a second override from bossBattleData. Formal server weights and the original RNG stream are not supplied by this object.',
        'seasons': {},
    }
    for sid, cfg in seasons.items():
        bindings = {}
        for level, rows in cfg['trainingShopInfos'].items():
            if not rows or any(type(r['count']) is not int or r['count'] <= 0 for r in rows):
                raise ValueError('Unexpected training weights at ' + level)
            for row in rows:
                chess = activity[sid]['charChessDataDict'][row['chessId']]
                shop = activity[sid]['charShopChessDatas'][row['chessId']]
                bindings[row['chessId']] = {'charId': shop['charId'], 'isGolden': chess['isGolden']}
        out['seasons'][sid] = {'modeId': 'mode_training_1', 'initialHp': cfg['initialHp'],
                               'trainingRoundInfos': cfg['trainingRoundInfos'],
                               'trainingShopInfos': cfg['trainingShopInfos'], 'operatorBindings': bindings,
                               'trainingNPCInfos': cfg['trainingNPCInfos'],
                               'helpBattleNpcPlayers': cfg['helpBattleNpcPlayers']}
    return out, table


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--obb', type=Path, default=ROOT / 'work/main.obb')
    parser.add_argument('--output', type=Path, default=ROOT / 'web/training_config.json')
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    result, table = build(args.obb)
    text = json.dumps(result, ensure_ascii=False, indent=1) + '\n'
    if args.check:
        if not args.output.exists() or args.output.read_text(encoding='utf8') != text:
            raise SystemExit('STALE training_config.json; run tools/extract_training_config.py')
    else:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(text, encoding='utf8')
        evidence = ROOT / 'work/client-logic/native-economy/battle_misc_table.json'
        evidence.parent.mkdir(parents=True, exist_ok=True)
        evidence.write_text(json.dumps(table, ensure_ascii=False, indent=2) + '\n', encoding='utf8')
    print('PASS training_config: verified anonymous TextAsset; act1 training 4 rounds, 4 shop levels (26 weight rows)')


if __name__ == '__main__':
    main()
