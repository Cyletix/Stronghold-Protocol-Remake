"""Export only references used by the Web catalog, from the shared community store."""
from __future__ import annotations

import argparse
import html
import json
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT.parent / 'src'))
from arkresearch.community import CommunityStore


def wiki_text(value):
    """Display conversion only. Unknown Wiki templates remain readable source text."""
    text = str(value or '')
    text = re.sub(r'<!--.*?-->', '', text, flags=re.S)
    text = re.sub(r'<br\s*/?>', '\n', text, flags=re.I)
    text = re.sub(r'\[\[([^\[\]]+)\]\]', lambda m: m[1].split('|')[-1], text)
    pattern = re.compile(r'\{\{([^{}]+)\}\}')
    def replace(match):
        parts = match[1].split('|')
        name = parts[0].strip().lower()
        if name in ('color', '颜色', '*', '术语', '黑幕', 'nowrap', '注音') and len(parts) > 1:
            return parts[-1]
        return match[0]
    for _ in range(16):
        converted = pattern.sub(replace, text)
        if converted == text:
            break
        text = converted
    text = re.sub(r'</?(?:span|div|p|b|i|small|sup|sub|font|a|strong|em)\b[^>]*>', '', text, flags=re.I)
    text = text.replace("'''", '').replace("''", '')
    return html.unescape(text).strip()


def source(row):
    origin = row['payload'].get('source', {})
    url = origin.get('revisionUrl') or row.get('url') or origin.get('url', '')
    return {'recordId': row['record_id'], 'url': url, 'commit': row['commit'],
            'linkMethod': row.get('link_method'), 'revisionId': origin.get('revisionId')}


def enemy_ids(value):
    found = set()
    if isinstance(value, dict):
        for key, child in value.items():
            if key.startswith('enemy_'):
                found.add(key)
            found.update(enemy_ids(child))
    elif isinstance(value, list):
        for child in value:
            found.update(enemy_ids(child))
    elif isinstance(value, str) and value.startswith('enemy_'):
        found.add(value)
    return found


def build(source_id=None):
    store = CommunityStore(source_id=source_id)
    read = lambda name: json.loads((ROOT / 'web' / name).read_text(encoding='utf-8'))
    choices = read('skill_choices.json')
    wanted_skills = {skill['skillId'] for row in choices.values() for skill in row}
    wanted_enemies = enemy_ids(read('source_battles.json')) | enemy_ids(read('enemy_encounters.json'))
    wanted_enemies |= enemy_ids(read('battle_levels.json')['levels'])
    result = {'schemaVersion': 1, 'kind': 'community-reference', 'skills': {}, 'enemies': {}}
    for skill_id, rows in store.linked('skill').items():
        if skill_id not in wanted_skills:
            continue
        notes, seen = [], set()
        for row in rows:
            fields = row['payload'].get('sourceTemplate', {}).get('fields', {})
            parts = [wiki_text(fields.get(key)) for key in ('备注', '修正')]
            text = '\n'.join(part for part in parts if part)
            if text and text not in seen:
                notes.append({'text': text, 'source': source(row)})
                seen.add(text)
        if notes:
            result['skills'][skill_id] = notes
    for enemy_id, rows in store.linked('enemy').items():
        if enemy_id not in wanted_enemies:
            continue
        references = []
        for row in rows:
            groups = {}
            for level in row['payload'].get('levels', []):
                fields = level.get('effective', {})
                talent = wiki_text(level.get('talentWikitext') or fields.get('天赋'))
                parts = ([talent] if talent else []) + [key + '：' + wiki_text(value)
                    for key, value in fields.items() if re.match(r'^技能\d+', key) and wiki_text(value)]
                text = '\n'.join(parts)
                if text:
                    groups.setdefault(text, []).append(level['level'])
            if groups:
                references.append({'name': row['name'], 'source': source(row),
                    'levels': [{'levels': levels, 'text': text} for text, levels in groups.items()]})
        if references:
            result['enemies'][enemy_id] = references
    result['counts'] = {'catalogSkills': len(wanted_skills), 'skillsWithNotes': len(result['skills']),
        'modeEnemies': len(wanted_enemies), 'enemiesWithMechanics': len(result['enemies'])}
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source')
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    data = build(args.source)
    output = json.dumps(data, ensure_ascii=False, sort_keys=True, separators=(',', ':')) + '\n'
    target = ROOT / 'web/community_references.json'
    if args.check:
        if not target.exists() or target.read_text(encoding='utf-8') != output:
            raise SystemExit('community_references.json needs regeneration')
    else:
        target.write_text(output, encoding='utf-8')
    print(json.dumps({**data['counts'], 'bytes': len(output.encode('utf-8'))}, ensure_ascii=False))


if __name__ == '__main__':
    main()
