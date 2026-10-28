"""Verify and stage a release without reading any player's save or credentials."""
import argparse,base64,hashlib,json,os,shutil,subprocess
from datetime import datetime,timezone
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
def digest(file,algorithm='sha256'):
    with Path(file).open('rb') as stream:return hashlib.file_digest(stream,algorithm).digest()
def link(source,target):
    if target.exists():
        if digest(source)!=digest(target):raise RuntimeError('Staged file differs: '+target.name)
        return
    try:os.link(source,target)
    except OSError:shutil.copy2(source,target)

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--archive-complete',action='store_true');args=parser.parse_args()
    package=json.loads((ROOT/'package.json').read_text(encoding='utf-8'));version=package['version']
    release=ROOT/'release'/version;assets=release/'publish';assets.mkdir(parents=True,exist_ok=True)
    installer=release/f'RL.Manager.{version}.Setup.exe';blockmap=installer.with_suffix('.exe.blockmap')
    if not installer.is_file() or not blockmap.is_file():raise RuntimeError('Build the installer and blockmap first')
    packaged=json.loads((release/'release-check.json').read_text(encoding='utf-8'))
    if packaged.get('version')!=version or not packaged.get('passed'):raise RuntimeError('The packaged app check must pass for this version')
    validation=json.loads((release/'validation.json').read_text(encoding='utf-8'))
    if validation.get('version')!=version or not all(validation.get(k) for k in ['appTestsPassed','bridgeTestsPassed','nativeTestsPassed']):raise RuntimeError('Recorded release validation is missing or failed')
    resources=release/'win-unpacked/resources';verified={}
    pairs=[(ROOT/'bakkesmod/build/RLManagerHUD.dll',resources/'career-hud/RLManagerHUD.dll')]
    pairs.extend((p,resources/'local-bot-runtime'/p.name) for p in (ROOT/'scratch/local-bot-payload').iterdir() if p.is_file())
    if packaged.get('localPoliciesAudited')!=16 or not packaged.get('localBotRuntimeProvisioned'):raise RuntimeError('The packaged updater must install and audit all 16 local policies')
    pairs.extend((p,resources/'data'/p.name) for p in (ROOT/'data').glob('*.json'))
    pairs.extend((p,resources/'rl_bridge'/p.name) for p in (ROOT/'rl_bridge').glob('*.py') if not p.name.startswith('test_'))
    pairs.extend((p,resources/'rl_bridge/commentary'/p.name) for p in (ROOT/'rl_bridge/commentary').glob('*.py') if (resources/'rl_bridge/commentary'/p.name).exists())
    for directory in ['audio/desk-analyst','audio/desk-team-names']:
        pairs.extend((p,resources/'app.asar.unpacked/public'/p.relative_to(ROOT/'public')) for p in (ROOT/'public'/directory).rglob('*.mp3'))
    pairs.append((ROOT/'public/audio/introduction-anticipation.wav',resources/'app.asar.unpacked/public/audio/introduction-anticipation.wav'))
    pairs.extend((ROOT/'public'/p,resources/'app.asar.unpacked/public'/p) for p in ['brand/match-loading.png','competitions/fifae.mp4'])
    bank=json.loads((ROOT/'rl_bridge/commentary/player_intros/bank.json').read_text(encoding='utf-8'))
    for clip in bank['clips'].values():
        p=ROOT/'rl_bridge/commentary/player_intros'/clip['file'];pairs.append((p,resources/'rl_bridge/commentary/player_intros'/clip['file']))
    pairs.append((ROOT/'rl_bridge/commentary/player_intros/bank.json',resources/'rl_bridge/commentary/player_intros/bank.json'))
    for original,installed in pairs:
        if not installed.is_file() or digest(original)!=digest(installed):raise RuntimeError('Missing or different packaged payload: '+str(original.relative_to(ROOT)))
        verified[str(installed.relative_to(resources)).replace('\\','/')]=digest(installed).hex()
    sha512=base64.b64encode(digest(installer,'sha512')).decode();stamp=datetime.now(timezone.utc).isoformat().replace('+00:00','Z')
    (release/'latest.yml').write_text(f'version: {version}\nfiles:\n  - url: {installer.name}\n    sha512: {sha512}\n    size: {installer.stat().st_size}\npath: {installer.name}\nsha512: {sha512}\nreleaseName: RL Manager {version} - MAJOR RELEASE\nreleaseDate: "{stamp}"\n',encoding='utf-8')
    for p in [installer,blockmap,release/'latest.yml']:link(p,assets/p.name)
    shutil.copy2(ROOT/'docs/releases'/f'{version}.md',assets/'Release-notes.md')
    full_notes=ROOT/'docs/releases'/f'{version}-full-patch-notes.md'
    if full_notes.is_file():shutil.copy2(full_notes,assets/'Full-patch-notes.md')
    if args.archive_complete:
        kit=ROOT/'distribution'/f'RL-Manager-Complete-{version}'
        manifest=json.loads((kit/'manifest.json').read_text(encoding='utf-8'))
        if manifest['version']!=version:raise RuntimeError('Wrong complete-kit version')
        for item in manifest['files']:
            p=(kit/item['path']).resolve()
            if not p.is_relative_to(kit.resolve()) or digest(p).hex()!=item['sha256']:raise RuntimeError('Complete-kit checksum failed: '+item['path'])
        archive=assets/f'RL-Manager-Complete-{version}.7z'
        if archive.with_suffix('.7z.001').exists():raise RuntimeError('Complete archive exists; verify it rather than overwrite it')
        seven=ROOT/'node_modules/7zip-bin/win/x64/7za.exe'
        subprocess.run([str(seven),'a','-t7z','-mx=0','-mmt=4','-v1900m',str(archive),kit.name],cwd=kit.parent,check=True)
        subprocess.run([str(seven),'t',str(archive)+'.001','-bd'],check=True)
    receipt={'version':version,'releaseType':package.get('releaseType','stable'),'runtimeVersion':'1.0.8',
             'completeKitBase':'1.5.0','localBotRuntimeVersion':version,'localPoliciesAudited':packaged['localPoliciesAudited'],
             'sourceCommit':subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip(),
             'installerSHA256':digest(installer).hex(),'installerBytes':installer.stat().st_size,
             'appTestsPassed':validation['appTestsPassed'],'bridgeTestsPassed':validation['bridgeTestsPassed'],'nativeTestsPassed':validation['nativeTestsPassed'],'packagedAppPassed':True,
             'liveRocketLeagueTested':False,'introductionClips':len(bank['clips']),'verifiedPayloadSHA256':verified}
    (assets/'Release-build.json').write_text(json.dumps(receipt,indent=2)+'\n',encoding='utf-8')
    for p in assets.iterdir():
        if p.is_file() and p.stat().st_size>=2*1024**3:raise RuntimeError('GitHub asset exceeds 2 GiB: '+p.name)
    (assets/'SHA256SUMS.txt').write_text(''.join(digest(p).hex()+'  '+p.name+'\n' for p in sorted(assets.iterdir()) if p.is_file() and p.name!='SHA256SUMS.txt'),encoding='utf-8')
    print(json.dumps({'version':version,'assets':str(assets),'files':[p.name for p in sorted(assets.iterdir()) if p.is_file()]}),flush=True)

if __name__=='__main__':main()
