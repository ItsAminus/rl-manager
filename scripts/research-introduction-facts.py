"""Resume public, identity-checked biography research for the recorded top 1,000.

Read-only MediaWiki calls; cache evidence locally. Missing pages or results do
not prove that someone has never competed. Never invent birth dates.
"""
import argparse
import gzip
import hashlib
import json
import re
import sys
import time
import unicodedata
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / 'scratch/introduction-research'
HEADERS = {'User-Agent': 'RLManager/1.1 (personal offline biography verification)', 'Accept-Encoding': 'gzip'}
ALIASES = {'juicy': 'Juicy (French Player)', 'diaz': 'Diaz (Brazilian Player)',
           'misty': 'Misty (Australian Player)', 'TRK511': 'Trk511', 'AppJack': 'ApparentlyJack',
           'Justin': 'Jstn', 'Khalid': 'OKhaliD', 'Acronik': 'AcroniK.', 'Kro': 'Kronovi',
           'ScrubKilla': 'Scrub Killa', 'Greazy': 'GReazymeister'}
CURATED_IDENTITIES = {'player_66': 'Fairy Peak!', 'player_70': 'Deevo',
                      'player_64': 'gimmick', 'player_54': 'eekso'}


def read(path, default=None):
    return json.loads(path.read_text(encoding='utf-8')) if path.exists() else default


def write(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix('.tmp')
    tmp.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    tmp.replace(path)


def normalized(value):
    return re.sub('[^a-z0-9]', '', unicodedata.normalize('NFKD', value or '').encode('ascii', 'ignore').decode().lower())


def field(wiki, name):
    match = re.search(r'^\s*\|' + re.escape(name) + r'\s*=\s*([^\n|]*)', wiki, re.M | re.I)
    return match.group(1).strip() if match else ''


def api(**params):
    # The public API requires compressed requests and at least 2s between
    # queries, 30s between parses. Persist timing across resumed invocations.
    stamp = CACHE / 'last-request.json'
    last = read(stamp, {})
    kind = params['action']
    delay = max(2.1 - (time.time() - last.get('any', 0)),
                30.1 - (time.time() - last.get('parse', 0)) if kind == 'parse' else 0)
    if delay > 0:
        time.sleep(delay)
    last['any'] = time.time()
    if kind == 'parse':
        last['parse'] = last['any']
    write(stamp, last)
    url = 'https://liquipedia.net/rocketleague/api.php?' + urllib.parse.urlencode(dict(params, format='json'))
    with urllib.request.urlopen(urllib.request.Request(url, headers=HEADERS), timeout=90) as response:
        body = response.read()
        if response.headers.get('Content-Encoding') == 'gzip':
            body = gzip.decompress(body)
    result = json.loads(body)
    if result.get('error'):
        raise RuntimeError(str(result['error']))
    return result


def target_players():
    return sorted(read(ROOT / 'data/players.json'), key=lambda p: (-p['overall'], p['id']))[:1000]


def title_for(player):
    return ALIASES.get(player['gamertag'], player['gamertag'])


def fetch_profiles(players):
    pages = read(CACHE / 'profiles.json', {})
    requested = list(dict.fromkeys(title_for(p) for p in players if title_for(p).casefold() not in pages))
    for offset in range(0, len(requested), 40):
        chunk = requested[offset:offset + 40]
        data = api(action='query', titles='|'.join(chunk), redirects=1, prop='revisions', rvprop='content', rvslots='main')['query']
        aliases = {r['from'].casefold(): r['to'] for r in data.get('normalized', []) + data.get('redirects', [])}
        found = {p['title'].casefold(): p for p in data.get('pages', {}).values()}
        for title in chunk:
            resolved = title
            for _ in range(8):
                resolved = aliases.get(resolved.casefold(), resolved)
            page = found.get(resolved.casefold(), {})
            wiki = page.get('revisions', [{}])[0].get('slots', {}).get('main', {}).get('*', '')
            pages[title.casefold()] = {'title': resolved, 'wiki': wiki, 'checked': '2026-10-22', 'missing': 'missing' in page}
        write(CACHE / 'profiles.json', pages)
        print('Profile lookup:', len(pages), 'distinct names', flush=True)
    return pages


def identity(player, page, profiles):
    wiki = page.get('wiki', '')
    if not re.search(r'\{\{Infobox player\b', wiki, re.I):
        return None
    if CURATED_IDENTITIES.get(player['id']) == field(wiki, 'id'):
        return 'Reviewed established pro identity'
    # A matching alias alone cannot identify common qualifier handles.
    if player['id'].startswith('sg_player_'):
        source = profiles.get(player['id'], {}).get('profileUrl', '')
        slug = source.rstrip('/').split('/')[-1] if '/user/' in source else ''
        linked = field(wiki, 'startgg') or field(wiki, 'smashgg')
        return 'Exact linked start.gg user' if len(slug) >= 8 and slug.casefold() in linked.casefold() else None
    if player['id'].startswith('pro_') and player['id'][4:12] in field(wiki, 'blasttv'):
        return 'Exact linked organizer player ID'
    if normalized(player.get('realName')) and normalized(player['realName']) in [normalized(field(wiki, k)) for k in ('name', 'romanized_name')]:
        return 'Matching confirmed real name'
    if player.get('birthDate') == field(wiki, 'birth_date') and player.get('birthDate') and normalized(player['gamertag']) == normalized(field(wiki, 'id')):
        return 'Matching sourced birth date and tag'
    return None


def fetch_results(candidates, batch_size):
    manifest = read(CACHE / 'results-index.json', {})
    # Large transclusions can exhaust Lua/LPDB limits and leave literal
    # #invoke:Lua instead of a table. Those are failed reads, never empty careers.
    files = {}
    for title, info in list(manifest.items()):
        html = files.setdefault(info['file'], (CACHE / info['file']).read_text(encoding='utf-8'))
        section = html.split('id="' + info['section'] + '"', 1)[-1].split('id="rlm-bio-', 1)[0]
        if '#invoke:Lua' in section or 'Lua error' in section:
            del manifest[title]
    write(CACHE / 'results-index.json', manifest)
    missing = [p for p in candidates if p['title'] not in manifest]
    for offset in range(0, len(missing), batch_size):
        chunk = missing[offset:offset + batch_size]
        text = '\n'.join('<div id="rlm-bio-%s">{{:%s/Results}}</div>' % (i, p['title']) for i, p in enumerate(chunk))
        data = api(action='parse', title='User:RLManager/Local biography audit', text=text, prop='text')
        html = data['parse']['text']['*']
        if '#invoke:Lua' in html or 'Lua error' in html or 'parser-limit-exceeded' in html:
            raise RuntimeError('Parser limit reached; reduce results batch size')
        filename = hashlib.sha256(text.encode()).hexdigest()[:20] + '.html'
        (CACHE / filename).write_text(html, encoding='utf-8')
        for i, p in enumerate(chunk):
            manifest[p['title']] = {'file': filename, 'section': 'rlm-bio-' + str(i), 'source': 'https://liquipedia.net/rocketleague/' + urllib.parse.quote(p['title'].replace(' ', '_')) + '/Results'}
        write(CACHE / 'results-index.json', manifest)
        print('Results researched:', len(manifest), '/', len(candidates), flush=True)
    return manifest


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--profiles-only', action='store_true')
    parser.add_argument('--cached', action='store_true')
    parser.add_argument('--batch-size', type=int, default=4)
    parser.add_argument('--include-unmatched', action='store_true')
    args = parser.parse_args()
    players = target_players()
    pages = read(CACHE / 'profiles.json', {}) if args.cached else fetch_profiles(players)
    profiles = read(ROOT / 'data/broadcast-profiles.json')['players']
    rows = []
    for rank, p in enumerate(players, 1):
        page = pages.get(title_for(p).casefold(), {})
        proof = identity(p, page, profiles)
        rows.append({'rank': rank, 'playerId': p['id'], 'gamertag': p['gamertag'], 'title': page.get('title'),
                     'identity': proof, 'hasPublicProfile': bool(page.get('wiki')), 'birthDate': field(page.get('wiki', ''), 'birth_date') if proof else None})
    write(CACHE / 'coverage.json', rows)
    candidates = list({r['title']: r for r in rows if r['identity'] or (args.include_unmatched and
        re.search(r'\{\{Infobox player\b', pages.get(title_for(players[r['rank']-1]).casefold(), {}).get('wiki', ''), re.I))}.values())
    print('Scope:', len(rows), 'Identity-confirmed public profiles:', len(candidates), 'Known birth dates:', sum(bool(r['birthDate']) for r in rows), flush=True)
    if not args.profiles_only and not args.cached:
        fetch_results(candidates, args.batch_size)


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    main()
