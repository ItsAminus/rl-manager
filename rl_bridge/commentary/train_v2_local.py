"""Resumable, local-only two-speaker V2 preparation and sequential training."""
import json
import os
from pathlib import Path
import subprocess
import sys
import time
import traceback

ROOT = Path(__file__).resolve().parents[2]
RUNTIME = ROOT / 'rl_bridge/local_runtime'
SOURCE = RUNTIME / 'GPT-SoVITS'
RUN = RUNTIME / 'training_v2'
PRE = SOURCE / 'GPT_SoVITS/pretrained_models'
DOWNLOADS = Path.home() / 'Downloads'
MATCH = DOWNLOADS / '[FULL MATCH] Falcons vs SSG RLCS 2026 - World Championship - Gezzly Rocket League (192k).mp3'
REFS = {'caster_two': DOWNLOADS / 'Alex Knight sample.mp3', 'caster_one': DOWNLOADS / 'Caster One sample.mp3'}


def status(stage, **details):
    RUN.mkdir(parents=True, exist_ok=True)
    value = dict(stage=stage, time=time.strftime('%Y-%m-%d %H:%M:%S'), pid=os.getpid(), **details)
    tmp = RUN / 'status.tmp'
    tmp.write_text(json.dumps(value, indent=2), encoding='utf8')
    tmp.replace(RUN / 'status.json')
    print(json.dumps(value), flush=True)


def env():
    e = os.environ.copy()
    e.update(version='v2', is_half='True', PYTHONUTF8='1', PYTHONUNBUFFERED='1',
             TORCH_FORCE_NO_WEIGHTS_ONLY_LOAD='1', USE_LIBUV='0', CUDA_VISIBLE_DEVICES='0',
             OMP_NUM_THREADS='4', NLTK_DATA=str(SOURCE / 'runtime/nltk_data'),
             TORCH_HOME=str(RUNTIME / 'torch_cache'))
    e['PATH'] = str(SOURCE / 'runtime') + os.pathsep + e['PATH']
    e['PYTHONPATH'] = os.pathsep.join([str(SOURCE), str(SOURCE / 'GPT_SoVITS')])
    return e


def command(args, logfile, extra=None):
    e = env()
    e.update(extra or {})
    with (RUN / logfile).open('a', encoding='utf8') as log:
        process = subprocess.Popen([sys.executable, '-u', *map(str, args)], cwd=SOURCE,
                                   env=e, stdout=log, stderr=subprocess.STDOUT)
        (RUN / 'child.json').write_text(json.dumps({'pid': process.pid, 'log': logfile}), encoding='utf8')
        code = process.wait()
    if code:
        raise RuntimeError(f'Command exited {code}; inspect {logfile}')


def separate():
    import numpy as np
    import soundfile as sf
    import torch
    from demucs.pretrained import get_model
    from demucs.apply import apply_model
    torch.set_num_threads(4)
    output = RUN / 'match_vocals.wav'
    if output.exists():
        return
    stereo = RUN / 'match_stereo.wav'
    if not stereo.exists():
        subprocess.run([str(SOURCE / 'runtime/ffmpeg.exe'), '-v', 'error', '-y', '-i', str(MATCH),
                        '-ar', '44100', '-ac', '2', str(stereo)], check=True)
    model = get_model('htdemucs').to('cuda').eval()
    temporary = RUN / 'match_vocals.partial.wav'
    with sf.SoundFile(stereo) as inp, sf.SoundFile(temporary, 'w', samplerate=44100,
                                                 channels=1, subtype='PCM_16') as out:
        count = 0
        while True:
            data = inp.read(44100 * 60, dtype='float32', always_2d=True)
            if not len(data):
                break
            wave = torch.from_numpy(data.T).to('cuda')
            with torch.inference_mode():
                separated = apply_model(model, wave[None], shifts=0, split=True, overlap=.25,
                                        device='cuda', progress=False)[0]
            vocal = separated[model.sources.index('vocals')].mean(0).cpu().numpy()
            out.write(np.clip(vocal, -.99, .99))
            count += len(data)
            status('preparing_audio', seconds_done=count / 44100, total_seconds=len(inp) / 44100)
    temporary.replace(output)


def dataset():
    import numpy as np
    import soundfile as sf
    import librosa
    import torch
    import whisper
    from speechbrain.inference.speaker import EncoderClassifier
    torch.set_num_threads(4)
    if (RUN / 'dataset_summary.json').exists():
        return
    status('transcribing')
    audio, sr = sf.read(RUN / 'match_vocals.wav', dtype='float32')
    audio16 = librosa.resample(audio, orig_sr=sr, target_sr=16000)
    transcript = RUN / 'transcript.json'
    if not transcript.exists():
        model = whisper.load_model('small.en', device='cuda', download_root=str(RUNTIME / 'whisper'))
        result = model.transcribe(audio16, language='en', word_timestamps=True, verbose=False,
                                  condition_on_previous_text=False, temperature=0)
        transcript.write_text(json.dumps(result), encoding='utf8')
        del model
        torch.cuda.empty_cache()
    result = json.loads(transcript.read_text(encoding='utf8'))
    status('assigning_speakers')
    classifier = EncoderClassifier.from_hparams(source=str(RUNTIME / 'ecapa'),
        savedir=str(RUNTIME / 'ecapa'), run_opts={'device': 'cuda'})

    def embed(samples):
        with torch.inference_mode():
            v = classifier.encode_batch(torch.from_numpy(samples.copy()).unsqueeze(0).to('cuda')).flatten()
            return torch.nn.functional.normalize(v, dim=0)

    prototypes = []
    for name, path in REFS.items():
        ref, rate = sf.read(path, dtype='float32')
        if ref.ndim > 1:
            ref = ref.mean(1)
        ref = librosa.resample(ref, orig_sr=rate, target_sr=16000)
        vectors = [embed(ref[i:i+96000]) for i in range(0, len(ref)-48000, 96000)]
        prototypes.append(torch.nn.functional.normalize(torch.stack(vectors).mean(0), dim=0))
    prototypes = torch.stack(prototypes)
    records, rejected = [], 0
    for segment in result['segments']:
        if segment.get('avg_logprob', -10) < -.9 or segment.get('no_speech_prob', 1) > .72 or segment.get('compression_ratio', 0) > 2.4:
            rejected += 1
            continue
        words = segment.get('words', [])
        groups, current = [], []
        for word in words:
            if current and word['end'] - current[0]['start'] > 9:
                groups.append(current)
                current = []
            current.append(word)
        if current:
            groups.append(current)
        for group in groups:
            start, end = max(0, group[0]['start']-.06), group[-1]['end']+.08
            text = ''.join(w['word'] for w in group).strip().replace('|', ',')
            if not 2.5 <= end-start <= 10 or len(text.split()) < 4:
                continue
            clip = audio16[int(start*16000):int(end*16000)]
            # Require agreement across overlapping windows to reject speaker changes.
            windows = [clip, clip[:int(len(clip)*.65)], clip[int(len(clip)*.35):]]
            scores = torch.stack([prototypes @ embed(w) for w in windows]).cpu().numpy()
            winners = scores.argmax(1)
            confidence = float(scores[:, winners[0]].min())
            margin = float(np.abs(scores[:, 0]-scores[:, 1]).min())
            if len(set(winners.tolist())) != 1 or confidence < .38 or margin < .035:
                rejected += 1
                continue
            speaker = list(REFS)[int(winners[0])]
            path = RUN / speaker / 'wavs' / f'{speaker}_{int(start*1000):08d}.wav'
            path.parent.mkdir(parents=True, exist_ok=True)
            # Keep source timing, dynamics and pitch; no loudness boost or time stretch.
            sf.write(path, audio[int(start*sr):int(end*sr)], sr, subtype='PCM_16')
            records.append(dict(speaker=speaker, path=str(path), text=text, start=start, end=end,
                                similarity=confidence, margin=margin, source=str(MATCH)))
        if len(records) and len(records) % 50 == 0:
            status('assigning_speakers', accepted=len(records), rejected=rejected)
    summary = {}
    for speaker in REFS:
        rows = [r for r in records if r['speaker'] == speaker]
        # Reserve entire 30-second source blocks, not neighboring slices of one utterance.
        holdout = [r for r in rows if int(r['start']//30) % 20 == 0]
        train = [r for r in rows if r not in holdout]
        seconds = sum(r['end']-r['start'] for r in train)
        if len(train) < 24 or seconds < 75:
            raise RuntimeError(f'Insufficient confident material for {speaker}: {len(train)} clips, {seconds:.0f}s')
        directory = RUN / speaker
        for label, items in [('train', train), ('holdout', holdout)]:
            (directory / f'{label}.list').write_text('\n'.join(
                f"{r['path']}|{speaker}|EN|{r['text']}" for r in items)+'\n', encoding='utf8')
        summary[speaker] = dict(training_clips=len(train), training_minutes=round(seconds/60, 2),
                                heldout_clips=len(holdout))
    (RUN / 'segments.json').write_text(json.dumps(records, indent=2), encoding='utf8')
    (RUN / 'dataset_summary.json').write_text(json.dumps(summary, indent=2), encoding='utf8')
    status('dataset_ready', datasets=summary, rejected=rejected)


def features(speaker):
    d = RUN / speaker
    # Upstream skips entire manifests when they exist. Invalidate them when
    # the training list changes, while retaining reusable per-clip features.
    import hashlib
    fingerprint = hashlib.sha256((d/'train.list').read_bytes()).hexdigest()
    marker = d/'features.sha256'
    if not marker.exists() or marker.read_text() != fingerprint:
        for name in ['2-name2text-0.txt', '6-name2semantic-0.tsv']:
            path = d/name
            if path.exists():
                path.replace(d/(name+'.previous'))
    opts = dict(inp_text=str(d/'train.list'), inp_wav_dir='', exp_name=f'{speaker}_v2',
        i_part='0', all_parts='1', opt_dir=str(d),
        bert_pretrained_dir=str(PRE/'chinese-roberta-wwm-ext-large'),
        cnhubert_base_dir=str(PRE/'chinese-hubert-base'),
        pretrained_s2G=str(PRE/'gsv-v2final-pretrained/s2G2333k.pth'),
        s2config_path=str(SOURCE/'GPT_SoVITS/configs/s2.json'))
    for stage in ['1-get-text.py', '2-get-hubert-wav32k.py', '3-get-semantic.py']:
        status('extracting_features', speaker=speaker, step=stage)
        command([SOURCE/'GPT_SoVITS/prepare_datasets'/stage], f'{speaker}-features.log', opts)
    (d/'2-name2text.txt').write_text((d/'2-name2text-0.txt').read_text(encoding='utf8'), encoding='utf8')
    semantic = (d/'6-name2semantic-0.tsv').read_text(encoding='utf8')
    (d/'6-name2semantic.tsv').write_text('item_name\tsemantic_audio\n'+semantic, encoding='utf8')
    text_names = {r.split('\t')[0] for r in (d/'2-name2text.txt').read_text(encoding='utf8').splitlines()}
    semantic_names = {r.split('\t')[0] for r in semantic.splitlines()}
    if len(text_names & semantic_names) < 30:
        raise RuntimeError(f'Feature preparation failed for {speaker}; inspect features log')
    expected = {Path(row.split('|')[0]).name for row in (d/'train.list').read_text(encoding='utf8').splitlines() if row}
    missing = expected - (text_names & semantic_names)
    if missing:
        raise RuntimeError(f'{speaker}: {len(missing)} training clips lack features; training stopped')
    marker.write_text(fingerprint)


def configs(speaker):
    import yaml
    d = RUN / speaker
    weights = d/'weights'
    weights.mkdir(exist_ok=True)
    s2 = json.loads((SOURCE/'GPT_SoVITS/configs/s2.json').read_text())
    s2['train'].update(batch_size=2, epochs=12, fp16_run=True, grad_ckpt=True,
        pretrained_s2G=str(PRE/'gsv-v2final-pretrained/s2G2333k.pth'),
        pretrained_s2D=str(PRE/'gsv-v2final-pretrained/s2D2333k.pth'),
        if_save_latest=True, if_save_every_weights=True, save_every_epoch=2,
        gpu_numbers='0', log_interval=10)
    s2['model']['version'] = 'v2'
    s2['data']['exp_dir'] = str(d)
    s2.update(s2_ckpt_dir=str(d), save_weight_dir=str(weights), name=f'{speaker}_v2', version='v2')
    (d/'s2.json').write_text(json.dumps(s2, indent=2))
    s1 = yaml.safe_load((SOURCE/'GPT_SoVITS/configs/s1longer.yaml').read_text())
    s1['train'].update(batch_size=1, epochs=15, precision='16-mixed', save_every_n_epoch=3,
        if_save_every_weights=True, if_save_latest=True, if_dpo=False,
        half_weights_save_dir=str(weights), exp_name=f'{speaker}_v2')
    s1['data']['num_workers'] = 0
    # The official V2 GPT checkpoint has a 732-entry phoneme vocabulary.
    s1['model']['phoneme_vocab_size'] = 732
    s1.update(pretrained_s1=str(PRE/'gsv-v2final-pretrained/s1bert25hz-5kh-longer-epoch=12-step=369668.ckpt'),
        train_semantic_path=str(d/'6-name2semantic.tsv'), train_phoneme_path=str(d/'2-name2text.txt'),
        output_dir=str(d/'logs_s1'))
    (d/'s1.yaml').write_text(yaml.safe_dump(s1))


def pipeline():
    status('preparation_starting')
    command([Path(__file__), 'separate'], 'separation.log')
    command([Path(__file__), 'dataset'], 'dataset.log')
    for speaker in REFS:
        features(speaker)
        configs(speaker)
    for speaker in REFS:
        for stage, script, option, config in [('sovits', 's2_train.py', '--config', 's2.json'),
                                              ('gpt', 's1_train.py', '--config_file', 's1.yaml')]:
            marker = RUN/speaker/f'{stage}.done'
            if marker.exists():
                continue
            status('training_starting', speaker=speaker, model=stage, log=f'{speaker}-{stage}.log')
            command([SOURCE/'GPT_SoVITS'/script, option, RUN/speaker/config], f'{speaker}-{stage}.log', {'hz': '25hz'})
            marker.write_text(time.ctime())
    status('complete', output=str(RUN))


if __name__ == '__main__':
    try:
        mode = sys.argv[1] if len(sys.argv) > 1 else 'pipeline'
        {'pipeline': pipeline, 'separate': separate, 'dataset': dataset}[mode]()
    except Exception as exc:
        status('failed', error=str(exc))
        traceback.print_exc()
        sys.exit(1)
