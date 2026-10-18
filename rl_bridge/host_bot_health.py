"""Persistent exclusions for hosted policies which failed to play."""
import json
import os
from pathlib import Path
import re
import time

HEALTH_PATH = Path(__file__).parent / 'local_runtime' / 'host-bot-health.json'
# Confirmed user reports: London idle across two games; RippleV1.1 idle in game 2.
# Exclude the family in previews too, where version identifiers are unavailable.
KNOWN_BROKEN = {'london', 'ripple'}


def family_key(engine):
    key = re.sub(r'[^a-z0-9]', '', str(engine).lower())
    for family in ('bonkdaddy', 'ripple', 'astra'):
        if key.startswith(family):
            return family
    return key


def excluded_engines(context=None):
    blocked = set(KNOWN_BROKEN)
    try:
        data = json.loads(HEALTH_PATH.read_text(encoding='utf-8'))
        if isinstance(data, dict) and isinstance(data.get('disabled', {}), dict):
            blocked.update(data.get('disabled', {}))
    except (OSError, ValueError, TypeError):
        pass
    blocked.update(family_key(e) for e in (context or {}).get('_excludedHostedBots', []))
    return blocked


def quarantine(assignments, server):
    try:
        data = json.loads(HEALTH_PATH.read_text(encoding='utf-8'))
    except (OSError, ValueError):
        data = {}
    if not isinstance(data, dict):data = {}
    if not isinstance(data.get('disabled', {}), dict):data['disabled'] = {}
    disabled = data.setdefault('disabled', {})
    for a in assignments:
        disabled[family_key(a['engine'])] = {
            'engine': a['engine'], 'player': a['name'], 'server': server,
            'reason': 'No activity during live play', 'detectedAt': time.time(),
        }
    HEALTH_PATH.parent.mkdir(parents=True, exist_ok=True)
    temporary = HEALTH_PATH.with_suffix('.tmp')
    temporary.write_text(json.dumps(data, indent=2), encoding='utf-8')
    os.replace(temporary, HEALTH_PATH)


class StalledBotsError(RuntimeError):
    def __init__(self, assignments):
        self.assignments = assignments
        names = ', '.join(a['name'] + ' (' + a['engine'] + ')' for a in assignments)
        super().__init__('Hosted bots stopped playing: ' + names + '. The incomplete game was not recorded.')
