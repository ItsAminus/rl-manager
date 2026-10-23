"""Import cached, identity-confirmed results, retaining evidence and audit gaps."""
import collections
import datetime
import importlib.util
import json
import re
from html.parser import HTMLParser
from pathlib import Path
import sys
import urllib.parse

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('research', ROOT / 'scripts/research-introduction-facts.py')
research = importlib.util.module_from_spec(spec)
spec.loader.exec_module(research)
CACHE = research.CACHE


class ResultsParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.stack = []
        self.section = None
        self.rows = collections.defaultdict(list)
        self.row = None
        self.cell = None

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag not in ('img', 'br', 'hr', 'meta', 'link', 'input', 'wbr', 'source'):
            self.stack.append((tag, self.section))
        if tag == 'div' and attrs.get('id', '').startswith('rlm-bio-'):
            self.section = attrs['id']
        if tag == 'tr':
            self.row = []
        if tag == 'td' and self.row is not None:
            self.cell = {'text': '', 'sort': attrs.get('data-sort-value'), 'links': []}
        if tag == 'a' and self.cell is not None:
            self.cell['links'].append({'href': attrs.get('href', ''), 'title': attrs.get('title', '')})

    def handle_data(self, data):
        if self.cell is not None:
            self.cell['text'] += data

    def handle_endtag(self, tag):
        if tag == 'td' and self.cell is not None:
            self.cell['text'] = ' '.join(self.cell['text'].split())
            self.row.append(self.cell)
            self.cell = None
        if tag == 'tr' and self.row is not None:
            if self.section and len(self.row) >= 7 and re.fullmatch(r'\d{4}-\d{2}-\d{2}', self.row[0]['text']):
                r = self.row
                links = [link for link in r[4]['links'] if link['href'].startswith('/rocketleague/')]
                if links:
                    self.rows[self.section].append({'date': r[0]['text'], 'placement': r[1]['text'],
                        'rank': r[1]['sort'], 'tier': r[2]['text'], 'event': r[4]['text'],
                        'path': links[0]['href'], 'team': r[5]['sort'] or r[5]['text']})
            self.row = None
        # Restore the section at its containing div; tolerate HTML void tags.
        for i in range(len(self.stack) - 1, -1, -1):
            if self.stack[i][0] == tag:
                self.section = self.stack[i][1]
                del self.stack[i:]
                break


def read_results(index):
    parsed = {}
    result = {}
    for title, info in index.items():
        if info['file'] not in parsed:
            parser = ResultsParser()
            parser.feed((CACHE / info['file']).read_text(encoding='utf-8'))
            parsed[info['file']] = parser.rows
        result[title] = parsed[info['file']].get(info['section'], [])
    return result


def rlcs_main(row):
    path = urllib.parse.unquote(row['path'])
    if '/Rocket_League_Championship_Series/' not in path:
        return False
    if row['tier'] not in ('S-Tier', 'A-Tier'):
        return False
    if re.search(r'RLRS|Rival.Series|The_Grid|The Grid|Promotion|Tiebreaker', path + ' ' + row['event'], re.I):
        return False
    if re.search(r'(?:1v1|2v2|Last.Chance|Qualifier(?!_\d))', path + ' ' + row['event'], re.I):
        # 2024's named Open Qualifier N has a main event, identified by A-Tier.
        if not ('/2024/' in path and re.search(r'Open_Qualifier_\d+$', path)):
            return False
    return True


def debut_label(row):
    path = urllib.parse.unquote(row['path']).split('/Rocket_League_Championship_Series/', 1)[-1]
    parts = path.split('/')
    season = re.match(r'Season_(\d+)$', parts[0])
    if season:
        return 'Season ' + season[1]
    era = 'RLCS X' if parts[0] == 'Season_X' else parts[0]
    split = next((p for p in parts if p in ('Fall', 'Winter', 'Spring')), None)
    if split:
        regional = re.search(r'Regional(?: Event)? (\d+)', row['event'])
        if regional:
            return f'{era} {split} Regional {regional[1]}'
        if parts[-1].isdigit():
            return f'{era} {split} Regional {parts[-1]}'
        if parts[-1] == 'Major' or 'Major' in row['event']:
            return f'{era} {split} Major'
    if parts[0] in ('2024', '2025', '2026'):
        match = re.search(r'(?:Open_Qualifier_|Open_)(\d+)', path)
        if match:
            return f'{era} Open {match[1]}'
        major = re.search(r'Major_(\d+)', path)
        if major:
            return f'{era} Major {major[1]}'
        if 'World Championship' in row['event']:
            return f'{era} World Championship'
    return None


def worlds_row(row):
    return (rlcs_main(row) and 'World Championship' in row['event']
            and not re.search(r'Wildcard|Qualif|1v1|2v2', row['event'] + ' ' + row['path'], re.I))


def placement_label(row):
    place = re.sub(r'\s+', '', row['placement']).replace('–', '-').upper()
    return 'WORLD CHAMPION' if place == '1ST' else 'RUNNER-UP' if place == '2ND' else place


def sourced(row, text, url):
    return {'text': text, 'source': url, 'achievedOn': row['date'],
            'eventName': row['event'], 'eventSource': 'https://liquipedia.net' + row['path']}


def main():
    registry = research.read(ROOT / 'data/player-introductions.json')
    coverage = research.read(CACHE / 'coverage.json')
    index = research.read(CACHE / 'results-index.json', {})
    bank = research.read(ROOT / 'rl_bridge/commentary/player_intros/bank.json', {}).get('clips', {})
    results = read_results(index)
    audit = []
    for item in coverage:
        pid, title = item['playerId'], item['title']
        row = dict(item)
        record = registry['players'].get(pid, {'gamertag': item['gamertag']})
        if item['identity']:
            url = 'https://liquipedia.net/rocketleague/' + urllib.parse.quote(title.replace(' ', '_'))
            birth = item.get('birthDate')
            try:
                datetime.date.fromisoformat(birth or '')
                record['dateOfBirth'] = {'text': birth, 'source': url}
            except ValueError:
                pass
            history = [r for r in results.get(title, []) if r['date'] <= registry['reviewedAt']]
            main_events = sorted([r for r in history if rlcs_main(r)], key=lambda r: r['date'])
            worlds = sorted([r for r in history if worlds_row(r)], key=lambda r: (int(re.match(r'\d+', r['rank'] or '999')[0]), r['date']))
            evidence = index.get(title, {}).get('source', url + '/Results')
            # Recompute imported fields when parser/filter rules change. Facts
            # manually checked against contemporary sources have no eventSource.
            for key in ('rlcsDebut', 'bestWorldsResult'):
                if record.get(key, {}).get('eventSource'):
                    del record[key]
            if main_events and (label := debut_label(main_events[0])):
                # Keep the manually reviewed exact debut date/source where present.
                record.setdefault('rlcsDebut', sourced(main_events[0], label, evidence))
            if worlds:
                record.setdefault('bestWorldsResult', sourced(worlds[0], placement_label(worlds[0]), evidence))
                record['worldsHistory'] = [sourced(r, placement_label(r), evidence) for r in worlds]
            row.update(resultsReviewed=title in results, resultCount=len(history),
                       earliestMainEvent=main_events[0] if main_events else None,
                       unmappedDebut=main_events[0] if main_events and not debut_label(main_events[0]) else None)
        # Coverage metadata is not a factual assertion of no debut/appearance.
        record['research'] = {'reviewedAt': registry['reviewedAt'], 'identity': item['identity'],
                              'resultsReviewed': row.get('resultsReviewed', False)}
        registry['players'][pid] = record
        row['verifiedFields'] = [key for key in ('dateOfBirth', 'rlcsDebut', 'bestWorldsResult') if record.get(key)]
        row['missingSpeechClips'] = []
        for key, prefix in (('rlcsDebut', 'debut'), ('bestWorldsResult', 'worlds')):
            if record.get(key):
                slug = re.sub(r'[^a-z0-9]+', '-', record[key]['text'].lower()).strip('-')
                clip_key = prefix + '/' + slug
                if clip_key not in bank:
                    row['missingSpeechClips'].append(clip_key)
        audit.append(row)
    registry['coverage'] = {'scope': 'Top 1000 by database overall descending, stable ID ascending ties',
        'players': len(coverage), 'complete': sum(len(r['verifiedFields']) == 3 for r in audit),
        'birthDates': sum('dateOfBirth' in r['verifiedFields'] for r in audit),
        'debuts': sum('rlcsDebut' in r['verifiedFields'] for r in audit),
        'worldsResults': sum('bestWorldsResult' in r['verifiedFields'] for r in audit)}
    research.write(ROOT / 'data/player-introductions.json', registry)
    research.write(ROOT / 'data/player-introduction-coverage.json', {'summary': registry['coverage'], 'players': audit})
    print(json.dumps(registry['coverage'], indent=2))
    print('Unmapped first events:', [(r['gamertag'], r['unmappedDebut']['event']) for r in audit if r.get('unmappedDebut')])


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    main()
