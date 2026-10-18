"""Apply public, identity-confirmed in-game titles and audit every database player.

Never infer an account reward from OVR, team membership, a matching nickname,
or tournament registration. The snapshot is refreshed separately; this import
is deterministic and local, with no requests during gameplay.
"""
import importlib
import json
import re
from pathlib import Path
from urllib.parse import quote

ROOT = Path(__file__).resolve().parents[1]
identity = importlib.import_module('sync-scoreboard-steam-avatars')
read = lambda path: json.loads((ROOT / path).read_text(encoding='utf-8'))


def title_priority(title):
    lower = title.lower()
    year = max([int(y) for y in re.findall(r'20\d{2}', title)] or [2023 if 'spring' in lower else 2022])
    season = int((re.search(r'\bS(\d+)\b', title, re.I) or [None, '0'])[1])
    if 'world champion' in lower and 'world championship' not in lower:
        strength = 100 if '1v1' not in lower and '2v2' not in lower else 95
    elif 'major champion' in lower: strength = 90
    elif 'regional champion' in lower: strength = 80
    elif 'world championship elite' in lower: strength = 75
    elif 'major finalist' in lower: strength = 72
    elif 'world championship contender' in lower: strength = 70
    elif 'major elite' in lower: strength = 68
    elif 'major contender' in lower: strength = 65
    elif 'regional finalist' in lower: strength = 62
    elif 'elite' in lower: strength = 60
    elif 'contender' in lower: strength = 55
    elif 'challenger' in lower: strength = 50
    elif 'supersonic legend' in lower: strength = 30
    elif 'grand champion' in lower: strength = 20
    else: strength = 10
    return strength, year, season, title


def main():
    players = read('data/players.json')
    registry = read('data/broadcast-profiles.json')
    pages = read('scratch/headshot-sources/liquipedia-pages.json')
    snapshots = read('data/player-title-sources.json')
    profiles = {p['source']: p for p in snapshots['profiles']}
    verified, coverage = {}, {}
    for player in players:
        pid, tag = player['id'], player['gamertag']
        page = pages.get(identity.ALIASES.get(tag, tag).casefold(), {})
        wiki = page.get('wiki', '')
        proof = identity.confirmed_identity(player, wiki, registry['players'].get(pid, {}))
        steam_id = identity.field(wiki, 'steam64ID')
        if not re.fullmatch(r'\d{17}', steam_id):
            steam = identity.steam_profile(wiki) or ''
            steam_id = steam.rsplit('/', 1)[-1] if '/profiles/' in steam else ''
        source = 'https://rlstats.net/profile/Steam/' + steam_id if steam_id else ''
        profile = profiles.get(source) if proof else None
        titles = list(dict.fromkeys(profile.get('titles', []))) if profile else []
        entry = {'gamertag': tag, 'status': 'unverified', 'reason': 'No identity-confirmed public title record'}
        if proof:
            entry.update(identity=proof, identitySource='https://liquipedia.net/rocketleague/' + quote(page['title']))
            entry['reason'] = 'Public profile unavailable or no verified title in snapshot'
        if titles:
            selected = max(titles, key=title_priority)
            verified[pid] = dict(title=selected, titles=titles, source=source,
                                 identity=proof, identitySource=entry['identitySource'],
                                 checkedAt=snapshots['checkedAt'], kind='public-account-title')
            entry.update(status='verified', title=selected, source=source)
            entry.pop('reason', None)
        coverage[pid] = entry
        record = registry['players'].get(pid)
        if record:
            for key in ('title', 'titleSource', 'titleKind'): record.pop(key, None)
            if pid in verified:
                record.update(title=verified[pid]['title'], titleSource=source,
                              titleKind='public-account-title')
    write = lambda name, data: (ROOT / name).write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    write('data/player-titles.json', verified)
    write('data/player-title-coverage.json', dict(checkedAt=snapshots['checkedAt'],
          totalPlayers=len(players), verifiedTitles=len(verified), unverified=len(players)-len(verified), players=coverage))
    write('data/broadcast-profiles.json', registry)
    print(f'{len(players)} database identities audited; {len(verified)} verified in-game titles; {len(players)-len(verified)} left unverified')


if __name__ == '__main__': main()
