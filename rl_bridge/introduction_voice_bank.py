"""Offline introduction library and an explicit, resumable ElevenLabs batch.

This module never sends network requests on import or during a match. Run the
CLI with --generate to spend generation credits, after choosing a voice.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import time
import threading
import urllib.error
import urllib.request
import wave

ROOT = Path(__file__).resolve().parents[1]
BANK = Path(__file__).resolve().parent / 'commentary' / 'player_intros'
_manifest_lock = threading.RLock()


def slug(value):
    return re.sub(r'[^a-z0-9]+', '-', str(value).casefold()).strip('-')


def debut_labels():
    # A vocabulary of possible labels, not assertions about any player's past.
    labels = [f'Season {i}' for i in range(1, 10)]
    for season in ('RLCS X', '2021-22', '2022-23'):
        for split in ('Fall', 'Winter', 'Spring'):
            labels.extend(f'{season} {split} Regional {i}' for i in range(1, 4))
            labels.append(f'{season} {split} Major')
    for year in range(2024, 2027):
        for split in (1, 2):
            labels.extend(f'{year} Split {split} Regional {i}' for i in range(1, 4))
        labels.extend(f'{year} Open {i}' for i in range(1, 7))
        labels.extend(f'{year} Major {i}' for i in (1, 2))
        labels.append(f'{year} World Championship')
    return labels


def worlds_labels():
    labels = {'WORLD CHAMPION': 'World champion', 'RUNNER-UP': 'Runner-up',
              'WORLDS DEBUT': 'World Championship debut'}
    # Individual placements plus the grouped finishes used by different Worlds
    # formats. These clips carry no player mapping until a fact is verified.
    def ordinal(n):
        return str(n) + ('th' if 10 <= n % 100 <= 20 else {1:'st', 2:'nd', 3:'rd'}.get(n % 10, 'th'))
    for n in range(1, 33):
        labels[ordinal(n).upper()] = ordinal(n) + ' place'
    for start, end in ((3,4),(5,6),(5,8),(7,8),(9,12),(9,16),(13,16),(17,20),(17,22),(17,24),(21,24),(23,24),(25,32)):
        labels[f'{ordinal(start)}-{ordinal(end)}'.upper()] = f'{ordinal(start)} to {ordinal(end)}'
    return labels


def build_manifest(players, voice_id='', model_id='eleven_multilingual_v2', settings=None, top_names=None):
    from player_introductions import OPENERS, CLOSERS
    clips = {}
    def add(key, text, **extra):
        clips[key] = {'text':text, 'file':key.replace('/', '-') + '.wav', **extra}
    selected = sorted(players,key=lambda p:(-p.get('overall',0),p['id']))[:top_names] if top_names is not None else players
    for player in selected:
        if top_names is not None or player.get('overall', 0) >= 80:
            add('name/' + player['id'], player['gamertag'].rstrip('.') + '.',
                playerId=player['id'], gamertag=player['gamertag'], rating=player['overall'])
    for age in range(15, 36):
        add(f'age/{age}', f'{age} years old.')
    for label in debut_labels():
        add('debut/' + slug(label), 'RLCS debut: ' + label + '.', label=label)
    for label, speech in worlds_labels().items():
        add('worlds/' + slug(label), 'Best Worlds result: ' + speech + '.', label=label)
    for index, (intro, outro) in enumerate(zip(OPENERS, CLOSERS), 1):
        add(f'intro/{index:02d}', intro)
        add(f'outro/{index:02d}', outro)
    manifest = {'version':1, 'minimumRating':80, 'voiceId':voice_id, 'modelId':model_id,
            'voiceSettings':settings or {'stability':.5, 'similarity_boost':.75},
            'clips':clips}
    prepare_continuity(manifest)
    if top_names is not None:
        manifest.pop('minimumRating',None)
        manifest['topNameCount']=top_names
        manifest['nameRanking']='overall descending, stable player ID ascending for ties'
    return manifest


def expand_manifest(manifest, players, top_names):
    """Add inventory without invalidating or discarding completed recordings."""
    expanded = build_manifest(players,manifest['voiceId'],manifest['modelId'],manifest['voiceSettings'],top_names=top_names)
    for key, clip in manifest['clips'].items():
        replacement = expanded['clips'].get(key)
        if replacement and clip_fingerprint(manifest,clip) != clip_fingerprint(expanded,replacement):
            raise ValueError('Expansion would change an existing recording: '+key)
        expanded['clips'][key] = clip
    return expanded


def clip_fingerprint(manifest, clip):
    return hashlib.sha256(json.dumps({key:manifest[key] for key in ('voiceId','modelId','voiceSettings')},sort_keys=True).encode()
                          + b'\0' + clip['text'].encode()
                          + (json.dumps(clip['generationContext'],sort_keys=True).encode() if clip.get('generationContext') else b'')).hexdigest()


def prepare_continuity(manifest):
    """Only conditioning context: none of this extra text is spoken or assigned
    as a biographical fact to a real player. All bank clips use one delivery.
    """
    contexts = {
        'intro': ('', 'Zen. Eighteen years old. RLCS debut: Season Nine.'),
        'name': ("First into the spotlight, a player looking to put their stamp on this series.",
                 'Eighteen years old. RLCS debut: Season Nine.'),
        'age': ('Zen.', 'RLCS debut: Season Nine. Best Worlds result: World champion.'),
        'debut': ('Eighteen years old.', 'Best Worlds result: World champion.'),
        'worlds': ('RLCS debut: Season Nine.', 'Now comes another opportunity to add to that story.'),
        'outro': ('Best Worlds result: World champion.', ''),
    }
    for key, clip in manifest['clips'].items():
        previous, following = contexts[key.split('/')[0]]
        clip['generationContext'] = {**({'previous_text':previous} if previous else {}),
                                     **({'next_text':following} if following else {})}


def assemble_player_audio(pieces, sample_rate):
    """One playback buffer: consistent level, conservative speech margins, no
    fixed extra silence at every file boundary. Never overlap spoken words.
    """
    import numpy as np
    prepared = []
    for source in pieces:
        pcm = np.asarray(source,dtype=np.float32).copy()
        audible = np.flatnonzero(np.abs(pcm) > .0012)
        if not len(audible):
            raise ValueError('A player introduction clip is silent')
        first,last = int(audible[0]),int(audible[-1])
        # Preserve quiet attacks and final consonants around detected speech.
        start=max(0,first-round(sample_rate*.045))
        end=min(len(pcm),last+1+round(sample_rate*.075))
        pcm=pcm[start:end]
        active=pcm[np.abs(pcm)>.004]
        rms=float(np.sqrt(np.mean(active.astype(np.float64)**2))) if len(active) else 0
        if rms:
            gain=min(1.8,max(.55,.13/rms))
            gain=min(gain,.94/max(.001,float(np.max(np.abs(pcm)))))
            pcm*=gain
        fade=min(round(sample_rate*.004),len(pcm)//2)
        if fade:
            pcm[:fade]*=np.linspace(0,1,fade,dtype=np.float32)
            pcm[-fade:]*=np.linspace(1,0,fade,dtype=np.float32)
        # Margins already provide ~120 ms between sentences. Add only enough
        # room to reach 150 ms; don't append another 180 ms blindly.
        leading=max(0,first-start);trailing=max(0,end-last-1)
        prepared.append((pcm,leading,trailing))
    result=[]
    for i,(pcm,leading,trailing) in enumerate(prepared):
        if i:
            missing=max(0,round(sample_rate*.15)-prepared[i-1][2]-leading)
            if missing:result.append(np.zeros(missing,dtype=np.float32))
        result.append(pcm)
    return np.concatenate(result) if result else np.empty(0,dtype=np.float32)


def clip_path(root, clip):
    path = (Path(root) / clip['file']).resolve()
    if path.parent != Path(root).resolve() or path.suffix.lower() != '.wav':
        raise ValueError('Introduction clips must be WAV files inside the voice library')
    return path


def save_manifest(root, manifest):
    with _manifest_lock:
        _save_manifest(root,manifest)


def _save_manifest(root, manifest):
    temporary=Path(root)/'bank.tmp'
    temporary.write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
    # Windows readers/virus scanners can briefly hold the destination without
    # FILE_SHARE_DELETE. Retry the local rename, never the paid API request.
    for attempt in range(40):
        try:
            temporary.replace(Path(root)/'bank.json')
            return
        except PermissionError:
            if attempt==39:raise
            time.sleep(.05)


def speech_keys(player, index):
    keys = [f"intro/{player.get('introClip',index+1):02d}", 'name/' + player['playerId']]
    if type(player.get('age')) is int and 15 <= player['age'] <= 35:
        keys.append(f"age/{player['age']}")
    for field, prefix in (('rlcsDebut','debut'), ('bestWorldsResult','worlds')):
        if player.get(field):
            # Normalize typography, so a sourced "7TH–8TH" matches the same
            # value as "7th-8th" without weakening player identity checks.
            keys.append(prefix + '/' + slug(player[field]))
    return keys + [f"outro/{player.get('outroClip',index+1):02d}"]


def load_player_audio(root, player, index, load):
    manifest = json.loads((Path(root) / 'bank.json').read_text(encoding='utf-8'))
    if manifest.get('version') != 1 or not manifest.get('voiceId'):
        return None
    keys = speech_keys(player, index)
    pieces = []
    for key in keys:
        clip = manifest.get('clips', {}).get(key)
        # Newly verified historical placements can extend the original spoken
        # vocabulary. Keep the sourced value on the card and retain the chosen
        # voice for the rest of the introduction; never substitute another
        # placement or discard all of this player's existing voice clips.
        if clip is None and key.startswith(('debut/', 'worlds/')):
            continue
        # A name from a different identity/renamed player must never be reused.
        if key.startswith('name/') and (not clip or clip.get('gamertag') != player['gamertag']):
            return None
        if not clip or clip.get('fingerprint') != clip_fingerprint(manifest, clip):
            return None
        path = clip_path(root, clip)
        if not path.is_file():
            return None
        pieces.append(load(path))
    return pieces


def generate(manifest, root, api_key, emit=print, request=None, keys=None):
    if not api_key:
        raise ValueError('Set ELEVENLABS_API_KEY locally before generating this bank')
    voice = manifest.get('voiceId', '')
    if not re.fullmatch(r'[A-Za-z0-9_-]{6,128}', voice):
        raise ValueError('Choose an ElevenLabs Voice ID before generating this bank')
    root = Path(root);root.mkdir(parents=True, exist_ok=True)
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    request = request or opener.open
    selected = list(dict.fromkeys(keys)) if keys else list(manifest['clips'])
    if any(key not in manifest['clips'] for key in selected):
        raise ValueError('A requested sample is missing from the voice inventory')
    count = len(selected)
    for index, key in enumerate(selected, 1):
        clip = manifest['clips'][key]
        path = clip_path(root, clip)
        fingerprint = clip_fingerprint(manifest, clip)
        if path.is_file() and clip.get('fingerprint') == fingerprint:
            continue
        receipt=path.with_suffix('.receipt.json')
        if path.is_file() and receipt.is_file():
            saved=json.loads(receipt.read_text(encoding='utf-8'))
            if saved.get('fingerprint')==fingerprint:
                with _manifest_lock:
                    clip['fingerprint']=fingerprint
                    save_manifest(root,manifest)
                continue
        body = json.dumps({'text':clip['text'], 'model_id':manifest['modelId'],
                           'voice_settings':manifest['voiceSettings'],**clip.get('generationContext',{})}).encode()
        url = f'https://api.elevenlabs.io/v1/text-to-speech/{voice}?output_format=pcm_24000'
        req = urllib.request.Request(url, data=body, headers={'xi-api-key':api_key,
                                      'Content-Type':'application/json','Accept':'application/octet-stream'})
        emit(f'Generating {index}/{count}: {key}')
        # An ambiguous network failure stops the batch; automatic retrying could
        # pay twice for a request that the service already completed.
        try:
            with request(req, timeout=120) as response:
                pcm = response.read(24000 * 2 * 65 + 1)
        except urllib.error.HTTPError as exc:
            raise RuntimeError(f'ElevenLabs returned HTTP {exc.code}; the batch stopped. Completed clips are saved.') from None
        if not pcm or len(pcm) % 2 or len(pcm) > 24000 * 2 * 65:
            raise ValueError('ElevenLabs returned invalid or overlong PCM audio')
        temporary = path.with_suffix('.tmp')
        with wave.open(str(temporary), 'wb') as wav:
            wav.setnchannels(1);wav.setsampwidth(2);wav.setframerate(24000);wav.writeframes(pcm)
        temporary.replace(path)
        with _manifest_lock:
            clip['fingerprint'] = fingerprint
            receipt.write_text(json.dumps({'fingerprint':fingerprint}),encoding='utf-8')
            save_manifest(root,manifest)
        time.sleep(.1)


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--voice-id',default='')
    parser.add_argument('--model-id',default=None)
    parser.add_argument('--output',type=Path,default=BANK)
    parser.add_argument('--generate',action='store_true')
    parser.add_argument('--top-names',type=int,help='Extend names to the top N database players by overall rating')
    parser.add_argument('--only',nargs='+',help='Generate a few specified clip IDs for a listening check')
    args=parser.parse_args()
    if args.top_names is not None and args.top_names<1:parser.error('--top-names must be positive')
    manifest_path=args.output/'bank.json'
    if manifest_path.exists():
        manifest=json.loads(manifest_path.read_text(encoding='utf-8'))
        if args.voice_id:manifest['voiceId']=args.voice_id
        if args.model_id:manifest['modelId']=args.model_id
    else:
        manifest=build_manifest(json.loads((ROOT/'data/players.json').read_text(encoding='utf-8')),args.voice_id,args.model_id or 'eleven_multilingual_v2')
    if args.top_names is not None:
        manifest=expand_manifest(manifest,json.loads((ROOT/'data/players.json').read_text(encoding='utf-8')),args.top_names)
    args.output.mkdir(parents=True,exist_ok=True)
    manifest_path.write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
    summary={kind:sum(key.startswith(kind+'/') for key in manifest['clips']) for kind in ('name','age','debut','worlds','intro','outro')}
    print(json.dumps({'clips':summary,'total':len(manifest['clips']),
                      'characters':sum(len(clip['text']) for clip in manifest['clips'].values()),'manifest':str(manifest_path)}))
    if args.generate:generate(manifest,args.output,os.environ.get('ELEVENLABS_API_KEY',''),keys=args.only)


if __name__=='__main__':main()
