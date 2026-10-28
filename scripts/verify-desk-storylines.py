"""Read-only coverage, provenance and media checks for the 100-storyline bank."""
import concurrent.futures
import hashlib
import json
from pathlib import Path
import subprocess

ROOT=Path(__file__).resolve().parents[1]

def main():
    bank=json.loads((ROOT/'data/desk-voice-bank.json').read_text(encoding='utf-8'))
    lines=json.loads((ROOT/'data/desk-storylines.json').read_text(encoding='utf-8'))
    folder=ROOT/'public/audio/desk-analyst'
    def verify(line):
        file=folder/line['file'];receipt=file.with_suffix('.receipt.json')
        result={'id':line['id'],'scenario':line['scenarioNumber'],'valid':False}
        if not file.is_file() or not receipt.is_file():
            return {**result,'error':'Missing recording or receipt'}
        payload={'text':line['text'],'model_id':bank['model'],'voice_settings':bank['voiceSettings']}
        digest=hashlib.sha256(json.dumps({'voice':bank['voiceId'],**payload},sort_keys=True).encode()).hexdigest()
        if json.loads(receipt.read_text(encoding='utf-8')).get('digest')!=digest:
            return {**result,'error':'Recording differs from current script or voice settings'}
        probe=subprocess.run(['ffprobe','-v','error','-show_entries','format=duration','-of','default=noprint_wrappers=1:nokey=1',str(file)],capture_output=True,text=True)
        try:seconds=float(probe.stdout.strip())
        except ValueError:seconds=0
        rate=len(line['text'])/max(.01,seconds)
        return {**result,'valid':probe.returncode==0 and seconds>1,'seconds':round(seconds,3),'bytes':file.stat().st_size,'charactersPerSecond':round(rate,2),'reviewDuration':not 6<rate<28}
    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
        results=list(pool.map(verify,lines))
    scenarios={line['scenarioNumber'] for line in lines}
    errors=[row for row in results if not row['valid']]
    report={'recordings':len(lines),'scenarios':len(scenarios),'threePerScenario':all(sum(line['scenarioNumber']==n for line in lines)==3 for n in range(1,101)),
        'uniqueScripts':len({line['text'] for line in lines}),'errors':errors,'durationReview':[r for r in results if r.get('reviewDuration')],
        'minutes':round(sum(r.get('seconds',0) for r in results)/60,2),'megabytes':round(sum(r.get('bytes',0) for r in results)/1e6,2),'results':results}
    target=ROOT/'scratch/verification/prematch-desk/storyline-coverage.json';target.parent.mkdir(parents=True,exist_ok=True)
    target.write_text(json.dumps(report,indent=2),encoding='utf-8')
    print(json.dumps({k:v for k,v in report.items() if k!='results'}))
    if errors or not report['threePerScenario'] or report['uniqueScripts']!=300:
        raise SystemExit(1)

if __name__=='__main__':main()
