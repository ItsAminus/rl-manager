"""Explicit, resumable ElevenLabs bake. No credentials are saved in the bank."""
import argparse
import concurrent.futures
import datetime
import hashlib
import json
import os
from pathlib import Path
import threading
import time
import urllib.error
import urllib.request

ROOT = Path(__file__).resolve().parents[1]

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--generate', action='store_true')
    parser.add_argument('--workers', type=int, default=2, choices=(1, 2, 3))
    parser.add_argument('--storylines-only', action='store_true')
    parser.add_argument('--only', nargs='+', help='Generate or check only these exact clip IDs.')
    args = parser.parse_args()
    bank = json.loads((ROOT / 'data/desk-voice-bank.json').read_text(encoding='utf-8'))
    lines = bank['lines'] + json.loads((ROOT / 'data/desk-scenarios.json').read_text(encoding='utf-8'))
    storylines = json.loads((ROOT / 'data/desk-storylines.json').read_text(encoding='utf-8'))
    lines = storylines if args.storylines_only else lines + storylines + json.loads((ROOT / 'data/desk-finals.json').read_text(encoding='utf-8'))
    if args.only:
        requested=set(args.only)
        missing=requested-{line['id'] for line in lines}
        if missing:
            raise ValueError('Unknown clip IDs: '+', '.join(sorted(missing)))
        lines=[line for line in lines if line['id'] in requested]
    output = ROOT / 'public/audio/desk-analyst'
    output.mkdir(parents=True, exist_ok=True)
    key = os.environ.get('ELEVENLABS_API_KEY', '')
    stopped = threading.Event()

    def bake(line):
        target = output / line['file']
        receipt = target.with_suffix('.receipt.json')
        request_body = {'text': line['text'], 'model_id': bank['model'], 'voice_settings': bank['voiceSettings']}
        digest = hashlib.sha256(json.dumps({'voice': bank['voiceId'], **request_body}, sort_keys=True).encode()).hexdigest()
        if target.is_file() and receipt.is_file():
            prior = json.loads(receipt.read_text(encoding='utf-8'))
            if prior.get('digest') == digest and target.stat().st_size > 1000:
                return line['id'], 'cached'
        if not args.generate:
            return line['id'], 'pending'
        if stopped.is_set():
            return line['id'], 'stopped'
        if not key:
            raise RuntimeError('Set ELEVENLABS_API_KEY in the local process before generating.')
        request = urllib.request.Request(
            'https://api.elevenlabs.io/v1/text-to-speech/' + bank['voiceId'] + '?output_format=mp3_44100_128',
            data=json.dumps(request_body).encode(), method='POST',
            headers={'xi-api-key': key, 'Content-Type': 'application/json', 'Accept': 'audio/mpeg'})
        for attempt in range(2):
            try:
                with urllib.request.urlopen(request, timeout=90) as response:
                    data = response.read()
                    if 'audio' not in response.headers.get('Content-Type', '') or not 1000 < len(data) < 8_000_000:
                        raise RuntimeError('Invalid audio response; batch stopped.')
                target.write_bytes(data)
                receipt.write_text(json.dumps({'digest': digest, 'voiceId': bank['voiceId'], 'model': bank['model'],
                    'characters': len(line['text']), 'generatedAt': datetime.datetime.now(datetime.timezone.utc).isoformat()}, indent=2), encoding='utf-8')
                return line['id'], 'generated'
            except urllib.error.HTTPError as error:
                if error.code == 429 and attempt == 0 and not stopped.is_set():
                    time.sleep(min(20, max(2, int(error.headers.get('Retry-After', '5')))))
                    continue
                stopped.set()
                raise RuntimeError('ElevenLabs HTTP ' + str(error.code) + '; batch stopped. Finished clips are retained.') from None
            except Exception:
                stopped.set()
                raise RuntimeError('Audio generation interrupted; finished clips are retained.') from None

    print(json.dumps({'recordings': len(lines), 'situations': len(set(line['category'] for line in lines)),
        'characters': sum(len(line['text']) for line in lines), 'generate': args.generate}), flush=True)
    counts = {}
    with concurrent.futures.ThreadPoolExecutor(max_workers=args.workers) as pool:
        futures = [pool.submit(bake, line) for line in lines]
        for index, future in enumerate(concurrent.futures.as_completed(futures), 1):
            name, state = future.result()
            counts[state] = counts.get(state, 0) + 1
            print(json.dumps({'done': index, 'total': len(lines), 'clip': name, 'state': state}), flush=True)
    print(json.dumps({'complete': True, 'counts': counts}), flush=True)

if __name__ == '__main__':
    main()
