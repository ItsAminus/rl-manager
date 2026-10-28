"""Bake every database club name once with timestamp-aligned batch synthesis."""
import argparse
import base64
import datetime
import hashlib
import json
import os
from pathlib import Path
import subprocess
import time
import urllib.error
import urllib.request
import unicodedata
import wave

ROOT = Path(__file__).resolve().parents[1]

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--generate', action='store_true')
    parser.add_argument('--limit', type=int, default=0)
    parser.add_argument('--batch-size', type=int, default=20)
    parser.add_argument('--nations-only', action='store_true')
    args = parser.parse_args()
    bank = json.loads((ROOT / 'data/desk-voice-bank.json').read_text(encoding='utf-8'))
    clubs = json.loads((ROOT / 'data/teams.json').read_text(encoding='utf-8')) + json.loads((ROOT / 'data/additional-professional-clubs.json').read_text(encoding='utf-8'))
    clubs += json.loads((ROOT / 'data/ssa-community-rosters.json').read_text(encoding='utf-8'))['teams']
    nations_file=ROOT / 'data/desk-national-names.json'
    if nations_file.is_file():
        clubs += json.loads(nations_file.read_text(encoding='utf-8'))
    names = {}
    index = {}
    for club in clubs:
        name = ' '.join(club['name'].split())
        spoken = name if any(char.isalnum() for char in name) else {'.':'Dot','..':'Two dots','...':'Three dots','?':'Question mark','!':'Exclamation mark'}.get(name,' '.join(unicodedata.name(char,char).lower() for char in name))
        digest = hashlib.sha256((bank['voiceId'] + ':' + bank['model'] + ':' + name + (':spoken='+spoken if spoken!=name else '')).encode()).hexdigest()[:24]
        file = 'name-' + digest + '.mp3'
        index[club['id']] = {'name': name, 'spokenName':spoken, 'file': file}
        names.setdefault(file, spoken)
    (ROOT / 'data/desk-team-names.json').write_text(json.dumps(index, ensure_ascii=False, indent=2), encoding='utf-8')
    output = ROOT / 'public/audio/desk-team-names'
    output.mkdir(parents=True, exist_ok=True)
    cache = ROOT / 'scratch/verification/prematch-desk/name-batches'
    cache.mkdir(parents=True, exist_ok=True)
    pending = [(file, name) for file, name in names.items() if not (output / file).is_file() or (output / file).stat().st_size < 1000]
    if args.nations_only:
        national_files={entry['file'] for id,entry in index.items() if id.startswith('nation:')}
        pending=[entry for entry in pending if entry[0] in national_files]
    if args.limit:
        pending = pending[:args.limit]
    print(json.dumps({'clubs': len(index), 'distinctNames': len(names), 'pending': len(pending), 'characters': sum(len(n)+3 for _, n in pending)}), flush=True)
    if not args.generate:
        return
    key = os.environ.get('ELEVENLABS_API_KEY', '')
    if not key:
        raise RuntimeError('Set ELEVENLABS_API_KEY in the local process.')
    completed = 0
    for offset in range(0, len(pending), args.batch_size):
        batch = pending[offset:offset+args.batch_size]
        text = ''.join(name + '.\n\n' for _, name in batch)
        payload = {'text': text, 'model_id': bank['model'], 'voice_settings': bank['voiceSettings']}
        digest = hashlib.sha256(json.dumps(payload, sort_keys=True).encode()).hexdigest()
        response_file = cache / (digest + '.json')
        if response_file.is_file():
            response = json.loads(response_file.read_text(encoding='utf-8'))
        else:
            request = urllib.request.Request('https://api.elevenlabs.io/v1/text-to-speech/' + bank['voiceId'] + '/with-timestamps?output_format=mp3_44100_128', data=json.dumps(payload).encode(), method='POST', headers={'xi-api-key': key, 'Content-Type': 'application/json'})
            for attempt in range(2):
                try:
                    with urllib.request.urlopen(request, timeout=120) as result:
                        response = json.load(result)
                    response_file.write_text(json.dumps(response), encoding='utf-8')
                    break
                except urllib.error.HTTPError as error:
                    if error.code == 429 and attempt == 0:
                        time.sleep(8)
                        continue
                    raise RuntimeError('ElevenLabs HTTP ' + str(error.code) + '; finished names retained.') from None
        alignment = response.get('alignment')
        if not alignment or ''.join(alignment['characters']) != text:
            raise RuntimeError('Name alignment differs from input. Cached response retained for review; no names exported from this batch.')
        source = cache / (digest + '.mp3')
        source.write_bytes(base64.b64decode(response['audio_base64']))
        pcm_file = cache / (digest + '.wav')
        subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y','-i',str(source),'-ar','44100','-ac','1','-c:a','pcm_s16le',str(pcm_file)], check=True)
        with wave.open(str(pcm_file),'rb') as wav:
            rate = wav.getframerate()
            pcm = wav.readframes(wav.getnframes())
        starts = alignment['character_start_times_seconds']
        ends = alignment['character_end_times_seconds']
        cursor = 0
        for batch_index, (file, name) in enumerate(batch):
            start = max(0, starts[cursor] - .06)
            last = cursor + len(name) - 1
            end = ends[last] + .18
            next_cursor = cursor + len(name) + 3
            if next_cursor < len(starts):
                end = min(end, starts[next_cursor] - .025)
            if not .08 < end-start < 20:
                # A name omitted by batch speech gets one isolated rendering,
                # rather than silently exporting an empty or incorrect clip.
                single = urllib.request.Request('https://api.elevenlabs.io/v1/text-to-speech/' + bank['voiceId'] + '?output_format=mp3_44100_128', data=json.dumps({'text':name+'.','model_id':bank['model'],'voice_settings':bank['voiceSettings']}).encode(),method='POST',headers={'xi-api-key':key,'Content-Type':'application/json'})
                with urllib.request.urlopen(single,timeout=90) as rendered:
                    audio=rendered.read()
                if len(audio)<1000:
                    raise RuntimeError('Isolated name rendering failed. Finished names retained.')
                (output/file).write_bytes(audio)
                completed+=1;cursor=next_cursor
                continue
            temporary = cache / ('clip-' + file + '.wav')
            with wave.open(str(temporary),'wb') as wav:
                wav.setnchannels(1);wav.setsampwidth(2);wav.setframerate(rate)
                wav.writeframes(pcm[int(start*rate)*2:int(end*rate)*2])
            subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y','-i',str(temporary),'-c:a','libmp3lame','-b:a','128k',str(output/file)],check=True)
            (output / file).with_suffix('.receipt.json').write_text(json.dumps({'voiceId':bank['voiceId'],'model':bank['model'],'name':name,'start':start,'end':end,'batch':digest,'generatedAt':datetime.datetime.now(datetime.timezone.utc).isoformat()}),encoding='utf-8')
            completed += 1
            cursor = next_cursor
        print(json.dumps({'done': completed, 'total': len(pending), 'lastBatch': len(batch)}), flush=True)
    print(json.dumps({'complete': True, 'clubs': len(index), 'distinctNames': len(names)}), flush=True)

if __name__ == '__main__':
    main()
