"""Reserve the GPU for the current voice-training jobs during inference."""
import json
from pathlib import Path

def ensure_inference_allowed():
    runtime=Path(__file__).resolve().parents[1]/'local_runtime'
    states=[]
    caster_one=runtime/'training_v2/status.json'
    if caster_one.exists():states.append(caster_one)
    alex=[p for p in (runtime/'alex_recovery_v2/recovery-status.json',
                      runtime/'alex_recovery_v2/status.json') if p.exists()]
    if alex:states.append(max(alex,key=lambda p:p.stat().st_mtime))
    audit=runtime/'alex_clarity_v2/audit-status.json'
    if audit.exists():
        state=json.loads(audit.read_text(encoding='utf8'))
        if state.get('device')=='cuda' and state.get('stage') in ('loading_models','checking_voice','checking_transcripts'):
            raise RuntimeError('Alex transcript checks currently reserve the GPU. Speech inference will wait.')
    for path in states:
        stage=json.loads(path.read_text(encoding='utf8')).get('stage','')
        if stage in ('training_expanded','training_alex_sovits','extracting_features'):
            raise RuntimeError('Voice training currently reserves the GPU. Speech inference will wait until it finishes.')
