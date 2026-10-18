"""Wait for isolated audit and Caster One completion, then train Alex SoVITS only.

Keep original models and GPT untouched. Rebuild voice targets at 32 kHz from
the original interview rather than the earlier 16 kHz intermediate clips.
"""
import json
import shutil
import sys
import time
from pathlib import Path
import train_v2_local as training

ROOT=Path(__file__).resolve().parents[1]
AUDIT=ROOT/'local_runtime/alex_clarity_v2'
JOB=ROOT/'local_runtime/alex_recovery_v2'
JOB.mkdir(parents=True,exist_ok=True)
sys.stdout.reconfigure(encoding='utf8',errors='replace')

def status(stage,**details):
    value={'stage':stage,'time':time.strftime('%Y-%m-%d %H:%M:%S'),**details}
    path=JOB/'recovery-status.json'; tmp=path.with_suffix('.tmp')
    tmp.write_text(json.dumps(value,indent=2),encoding='utf8');tmp.replace(path)
    print(value,flush=True)

def main():
    status('waiting_for_data_audit')
    while True:
        path=AUDIT/'audit-status.json'
        if path.exists():
            state=json.loads(path.read_text(encoding='utf8'))
            if state['stage']=='failed':raise RuntimeError('Alex audit failed; training not started')
            if state['stage']=='corpus_audited':break
        time.sleep(20)
    summary=json.loads((AUDIT/'summary.json').read_text(encoding='utf8'))
    if summary['training_clips']<50 or summary['training_minutes']<4:
        raise RuntimeError('Not enough high-confidence Alex material for this trial')
    status('rebuilding_full_bandwidth_audio')
    import numpy as np
    import soundfile as sf
    import librosa
    folder=JOB/'caster_two'; folder.mkdir(exist_ok=True)
    wavs=folder/'wavs'; wavs.mkdir(exist_ok=True)
    original=Path(str(Path.home() / 'Downloads' / 'Alex Caster Two Knight - Therapy mental health and content production.mp3'))
    info=sf.info(original)
    for split in ('train','holdout'):
        lines=[]
        for line in (AUDIT/f'{split}.list').read_text(encoding='utf8').splitlines():
            if not line:continue
            old,_,language,text=line.split('|',3)
            old=Path(old)
            start=int(old.stem.split('_')[-1])/1000
            duration=sf.info(old).duration
            audio,sr=sf.read(original,start=int(start*info.samplerate),
                stop=int((start+duration)*info.samplerate),dtype='float32')
            if audio.ndim>1:audio=audio.mean(axis=1)
            audio=librosa.resample(audio,orig_sr=sr,target_sr=32000)
            if not np.isfinite(audio).all():raise RuntimeError('Nonfinite source audio')
            path=wavs/old.name
            sf.write(path,audio,32000,subtype='PCM_16')
            lines.append(f'{path}|caster_two|{language}|{text}')
        (folder/f'{split}.list').write_text('\n'.join(lines)+'\n',encoding='utf8')
    shutil.copy2(AUDIT/'summary.json',JOB/'data-summary.json')
    status('waiting_for_caster_one',note='No Alex GPU work while the existing Caster One job is active or failed.')
    while True:
        path=ROOT/'local_runtime/training_v2/status.json'
        if path.exists() and json.loads(path.read_text(encoding='utf8'))['stage']=='expanded_training_complete':break
        time.sleep(20)
    # This module runs in its own process; redirect all Alex features/logs to
    # the new experiment, leaving the active training_v2 tree alone.
    training.RUN=JOB
    training.features('caster_two')
    training.configs('caster_two')
    config=folder/'s2.json'
    value=json.loads(config.read_text(encoding='utf8'))
    value['train'].update(epochs=8,save_every_epoch=2)
    value['name']='alex_recovery_v2'
    config.write_text(json.dumps(value,indent=2),encoding='utf8')
    training.status('training_alex_sovits',speaker='caster_two',model='sovits')
    status('training_alex_sovits',epochs=8,checkpoints='Every 2 epochs; existing models remain active.')
    training.command([training.SOURCE/'GPT_SoVITS/s2_train.py','--config',config],
                     'alex-recovery-sovits.log',{'hz':'25hz'})
    training.status('trial_training_complete')
    status('trial_training_complete',note='Checkpoints require listening comparisons; no automatic activation.')

if __name__=='__main__':
    try:main()
    except Exception as exc:
        if training.RUN==JOB:
            training.status('failed',error=str(exc))
        status('failed',error=str(exc));raise
