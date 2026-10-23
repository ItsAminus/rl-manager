"""Populate useful, sourced card evidence for every recorded top-1,000 name.

Registration/seed/LAN statistics are explicitly separate from debut and Worlds
biography facts. This reads the already verified database, with no API requests.
"""
import collections
import datetime
import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path):
    return json.loads(path.read_text(encoding='utf-8'))


def write(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def main():
    players = sorted(read(ROOT / 'data/players.json'), key=lambda p: (-p['overall'], p['id']))[:1000]
    registry = read(ROOT / 'data/player-introductions.json')
    bank = read(ROOT / 'rl_bridge/commentary/player_intros/bank.json')
    names = {key[5:]: value['gamertag'] for key, value in bank['clips'].items() if key.startswith('name/')}
    assert {p['id']: p['gamertag'] for p in players} == names, 'Card scope must match all 1,000 recorded names'
    audit = []
    for rank, player in enumerate(players, 1):
        history = []
        for source in player.get('ratingSources', []):
            if not source.get('source', '').startswith('https://') or not source.get('event'):
                continue
            try:
                datetime.date.fromisoformat(source['date'])
            except (ValueError, KeyError):
                continue
            evidence = {key: source[key] for key in ('event', 'date', 'source', 'region', 'placement', 'seed', 'games', 'rating') if source.get(key) is not None}
            for key in ('placement', 'seed', 'games'):
                if type(evidence.get(key)) is not int or evidence[key] <= 0:
                    evidence.pop(key, None)
            if not isinstance(evidence.get('rating'), (int, float)) or not math.isfinite(evidence['rating']):
                evidence.pop('rating', None)
            if not any(key in evidence for key in ('placement', 'seed', 'games')):
                continue  # Awards alone are not a tournament participation record.
            history.append(evidence)
        assert history, f"No useful sourced event evidence for {player['id']}"
        history.sort(key=lambda e: e['date'], reverse=True)
        record = registry['players'].setdefault(player['id'], {'gamertag': player['gamertag']})
        assert record['gamertag'] == player['gamertag']
        record['eventHistory'] = history
        audit.append({'rank': rank, 'playerId': player['id'], 'gamertag': player['gamertag'],
                      'eventEvidence': len(history), 'latestEvent': history[0],
                      'biographyFields': [key for key in ('dateOfBirth', 'rlcsDebut', 'bestWorldsResult') if record.get(key)]})
    summary = {'scope': registry['coverage']['scope'], 'players': len(players),
               'withSourcedEventEvidence': len(audit),
               'withFullBiography': sum(len(p['biographyFields']) == 3 for p in audit)}
    registry['cardCoverage'] = summary
    write(ROOT / 'data/player-introductions.json', registry)
    write(ROOT / 'data/player-introduction-card-coverage.json', {'summary': summary, 'players': audit})
    print(json.dumps(summary, indent=2))


if __name__ == '__main__':
    main()
