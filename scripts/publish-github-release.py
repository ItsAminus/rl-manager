"""Publish an explicit private repository/release using the user's Git credential manager.

Credentials remain in memory and are never written to a command, file or log.
Large complete-kit volumes belong in release assets, not Git history.
"""
import argparse
from concurrent.futures import ThreadPoolExecutor
import hashlib
import http.client
import json
import os
from pathlib import Path
import subprocess
import time
import urllib.error
import urllib.parse
import urllib.request


def credentials():
    result = subprocess.run(['git', 'credential', 'fill'], input='protocol=https\nhost=github.com\n\n',
                            text=True, capture_output=True, timeout=30,
                            env={**os.environ, 'GIT_TERMINAL_PROMPT': '0'})
    values = dict(line.split('=', 1) for line in result.stdout.splitlines() if '=' in line)
    if result.returncode or not values.get('password'):
        raise RuntimeError('Sign in to GitHub with Git Credential Manager first.')
    return values['password']


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('repository', help='owner/repository')
    parser.add_argument('--create-private', action='store_true')
    parser.add_argument('--version')
    parser.add_argument('--assets', type=Path)
    parser.add_argument('--notes', type=Path)
    parser.add_argument('--resume', action='store_true', help='Resume this release, preserving verified assets')
    parser.add_argument('--workers', type=int, default=3)
    parser.add_argument('--keep-draft', action='store_true', help='Upload a subset without publishing the release')
    args = parser.parse_args()
    if args.repository.count('/') != 1:
        raise ValueError('Use owner/repository')
    token = credentials()
    headers = {'Authorization': 'Bearer ' + token, 'Accept': 'application/vnd.github+json',
               'User-Agent': 'RLM-Release', 'X-GitHub-Api-Version': '2022-11-28'}
    def api(method, route, value=None):
        data = json.dumps(value).encode() if value is not None else None
        request = urllib.request.Request('https://api.github.com/' + route, data=data, method=method,
                                         headers={**headers, 'Content-Type': 'application/json'})
        with urllib.request.urlopen(request, timeout=90) as response:
            return json.load(response) if response.status != 204 else None
    route = 'repos/' + args.repository
    if args.create_private:
        account = api('GET', 'user')['login']
        if args.repository.split('/')[0].lower() != account.lower():
            raise ValueError('The requested owner must match the signed-in user.')
        try:
            api('GET', route)
        except urllib.error.HTTPError as error:
            if error.code != 404:
                raise
        else:
            raise RuntimeError('That repository already exists; refusing to overwrite or adopt it.')
        repo = api('POST', 'user/repos', {'name': args.repository.split('/')[1], 'private': True,
                   'description': 'RL Manager: Windows Rocket League career game and complete player releases',
                   'auto_init': False})
        print(json.dumps({'repository': repo['html_url'], 'private': repo['private']}), flush=True)
    if not args.assets:
        return
    if not args.version or not args.notes:
        raise ValueError('Supply --version and --notes with release assets.')
    notes = args.notes.read_text(encoding='utf-8')
    tag = 'v' + args.version
    if args.resume:
        release = next((r for r in api('GET', route + '/releases?per_page=100') if r['tag_name'] == tag), None)
        if not release:
            raise RuntimeError('No matching release to resume.')
    else:
        release = api('POST', route + '/releases', {'tag_name': tag, 'name': 'RL Manager ' + args.version,
                                                  'body': notes, 'draft': True})
    upload = urllib.parse.urlsplit(release['upload_url'].split('{')[0])
    existing = {a['name']: a for a in api('GET', route + '/releases/' + str(release['id']) + '/assets?per_page=100')}
    def upload_file(file):
        upload_name = file.name.replace(' ', '.')
        size = file.stat().st_size
        if size >= 2 * 1024**3:
            raise ValueError('Release file exceeds GitHub asset limit: ' + file.name)
        with file.open('rb') as stream:
            digest = hashlib.file_digest(stream, 'sha256').hexdigest()
        prior = existing.get(upload_name)
        if prior and prior['state'] == 'uploaded':
            if prior['size'] != size or (prior.get('digest') and prior['digest'] != 'sha256:' + digest):
                raise RuntimeError('Existing release asset differs; refusing to replace it: ' + file.name)
            print('Already verified ' + file.name, flush=True)
            return {'name': upload_name, 'bytes': size, 'sha256': digest, 'url': prior['browser_download_url']}
        if prior:
            if not release['draft']:
                raise RuntimeError('Refusing to remove a partial asset from a published release.')
            # Explicit --resume is used only after stopping this uploader's
            # earlier attempt. Completed assets above are never replaced.
            api('DELETE', route + '/releases/assets/' + str(prior['id']))
        print('Uploading ' + file.name + ' (' + str(size) + ' bytes)', flush=True)
        connection = http.client.HTTPSConnection(upload.netloc, timeout=180)
        connection.putrequest('POST', upload.path + '?name=' + urllib.parse.quote(upload_name))
        for key, value in {**headers, 'Content-Type': 'application/octet-stream', 'Content-Length': str(size)}.items():
            connection.putheader(key, value)
        connection.endheaders()
        sent = 0
        last_report = time.monotonic()
        with file.open('rb') as stream:
            for chunk in iter(lambda: stream.read(1024 * 1024), b''):
                connection.send(chunk)
                sent += len(chunk)
                if time.monotonic() - last_report > 25:
                    print(file.name + ': ' + str(round(100 * sent / size, 1)) + '%', flush=True)
                    last_report = time.monotonic()
        response = connection.getresponse()
        body = json.load(response)
        connection.close()
        if response.status != 201:
            raise RuntimeError('GitHub rejected asset: ' + str(body.get('message', response.status)))
        if body['size'] != size or (body.get('digest') and body['digest'] != 'sha256:' + digest):
            raise RuntimeError('Uploaded asset integrity check failed: ' + file.name)
        print('Verified ' + file.name, flush=True)
        return {'name': body['name'], 'bytes': size, 'sha256': digest, 'url': body['browser_download_url']}
    files = [p for p in sorted(args.assets.iterdir()) if p.is_file()]
    with ThreadPoolExecutor(max_workers=max(1, min(4, args.workers))) as pool:
        receipts = list(pool.map(upload_file, files))
    published = release if args.keep_draft else api('PATCH', route + '/releases/' + str(release['id']), {'draft': False})
    # Draft downloads use temporary "untagged" URLs. Read the final URLs after
    # publishing rather than returning links that change with release state.
    final_assets = {a['name']: a for a in api('GET', route + '/releases/' + str(release['id']) + '/assets?per_page=100')}
    for receipt in receipts:
        receipt['url'] = final_assets[receipt['name']]['browser_download_url']
    receipt = {'release': published['html_url'], 'assets': receipts}
    receipt_file = 'github-release-partial-receipt.json' if args.keep_draft else 'github-release-receipt.json'
    Path('scratch', receipt_file).write_text(json.dumps(receipt, indent=2), encoding='utf-8')
    print(json.dumps(receipt), flush=True)


if __name__ == '__main__':
    main()
