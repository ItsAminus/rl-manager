"""Build the public Windows kit from allowlisted runtime inputs, never user data."""
import hashlib,json,os,shutil,subprocess,sys,time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ROOT=Path(__file__).resolve().parent.parent
VERSION=json.loads((ROOT/'package.json').read_text())['version']
OUT=ROOT/'distribution'/f'RL-Manager-Complete-{VERSION}'
STAGE=ROOT/'scratch'/f'complete-runtime-{VERSION}'
DOWNLOADS=ROOT/'scratch/distribution-downloads'
SEVEN=ROOT/'node_modules/7zip-bin/win/x64/7za.exe'
SKIP={'__pycache__','.git','.pytest_cache','.mypy_cache','.cache','node_modules','rlbot_gui'}

def ignored(folder,names):
    extra={'tests'} if Path(folder).name=='gevent' else ({'test'} if Path(folder).name=='backports' and Path(folder).parent.name=='future' else set())
    return [name for name in names if name in SKIP or name in extra or (name.startswith('rlbot_gui-') and name.endswith('.dist-info')) or name.endswith(('.pyc','.pyo','.log'))
            or name in ('.env','direct_url.json','pyvenv.cfg')]

def copy(source,target,ignore=ignored):
    source=Path(source);target=Path(target)
    def file_copy(src,dest):
        if dest.is_file():
            a=src.stat();b=dest.stat()
            if a.st_size==b.st_size and a.st_mtime_ns==b.st_mtime_ns:return
        shutil.copy2(src,dest)
    if source.is_dir():
        pending=[]
        with ThreadPoolExecutor(max_workers=12) as pool:
            for folder,dirs,files in os.walk(source):
                excluded=set(ignore(folder,dirs+files));dirs[:]=[d for d in dirs if d not in excluded]
                dest=target/Path(folder).relative_to(source);dest.mkdir(parents=True,exist_ok=True)
                for name in files:
                    if name not in excluded:pending.append(pool.submit(file_copy,Path(folder)/name,dest/name))
            for future in pending:future.result()
    else:target.parent.mkdir(parents=True,exist_ok=True);file_copy(source,target)

def run(*args,**kwargs):
    result=subprocess.run(list(map(str,args)),**kwargs)
    if result.returncode:raise RuntimeError(f'Tool failed ({result.returncode}): {args[0]}')

def digest(file):
    with Path(file).open('rb') as source:return hashlib.file_digest(source,'sha256').hexdigest()

def package_staged():
    if any(STAGE.rglob('*.pyc')) or any(STAGE.rglob('*.pyo')):
        raise RuntimeError('Remove generated Python bytecode before packaging the public runtime')
    for name in ('python/python.exe','botpack/Necto/Nexto/bot.cfg',
                 'chatterbox_model/t3_cfg.safetensors','java','llama/llama-server.exe'):
        if not (STAGE/name).exists():raise RuntimeError(f'Incomplete staging: {name}')
    for name in ('Setup/Install-RLM.ps1','Install RL Manager.exe','Packages/RLManagerSetup.exe'):
        if not (OUT/name).is_file():raise RuntimeError(f'Incomplete setup: {name}')
    if any((OUT/'Packages').glob('Runtime.7z*')):
        raise RuntimeError('Review existing runtime archive parts before packaging')
    print('Compressing runtime (fast compression; split into upload-friendly parts)...',flush=True)
    run(SEVEN,'a','-t7z','-mx=1','-mmt=4','-ms=off','-v1500m',OUT/'Packages/Runtime.7z','.',cwd=STAGE)
    print('Checking every runtime archive part...',flush=True)
    run(SEVEN,'t',OUT/'Packages/Runtime.7z.001','-bd',stdout=subprocess.DEVNULL)
    write_manifest(sum(p.stat().st_size for p in STAGE.rglob('*') if p.is_file()))

def write_manifest(runtime_bytes, runtime_version=None):
    print('Writing download checksums...',flush=True)
    files=[]
    for file in sorted(OUT.rglob('*')):
        if file.is_file() and file.name!='manifest.json':files.append({'path':file.relative_to(OUT).as_posix(),'bytes':file.stat().st_size,'sha256':digest(file)})
    manifest={'version':VERSION,'releaseType':json.loads((ROOT/'package.json').read_text()).get('releaseType','stable'),'runtimeVersion':runtime_version or VERSION,'format':1,'runtimeId':f'RLM-Runtime-{runtime_version or VERSION}','files':files,'runtimeBytes':runtime_bytes,'sources':{
        'bakkesmodInstaller':'https://github.com/bakkesmodorg/BakkesModInjectorCpp/releases/latest/download/BakkesModSetup.zip',
        'bakkesmodCore':'https://github.com/bakkesmodorg/BakkesModInjectorCpp/releases/latest/download/bakkesmod.zip',
        'rocketHost':'https://bakkesplugins.com/plugin/216','rlbot':'https://github.com/RLBot/RLBotGUI',
        'botpack':'https://github.com/RLBot/RLBotPack','speech':'https://huggingface.co/ResembleAI/chatterbox',
        'text':'https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF'}}
    (OUT/'manifest.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8')
    print(json.dumps({'folder':str(OUT),'bytes':sum(f['bytes'] for f in files),'runtimeBytes':manifest['runtimeBytes'],'files':len(files)}),flush=True)

def reuse_runtime(source_version):
    import re
    if not re.fullmatch(r'\d+\.\d+\.\d+',source_version):raise ValueError('Invalid source release version')
    source=ROOT/'distribution'/f'RL-Manager-Complete-{source_version}'
    manifest=json.loads((source/'manifest.json').read_text(encoding='utf-8'))
    installer=ROOT/f'release/{VERSION}/RL.Manager.{VERSION}.Setup.exe'
    if not installer.is_file() or not installer.with_suffix('.exe.blockmap').is_file():raise RuntimeError('Build the new player installer first')
    OUT.mkdir(parents=True,exist_ok=False)
    for entry in manifest['files']:
        relative=Path(entry['path']);original=(source/relative).resolve()
        if not original.is_relative_to(source.resolve()):raise ValueError('Unsafe source manifest path')
        if relative.as_posix()=='Packages/RLManagerSetup.exe':continue
        target=OUT/relative;target.parent.mkdir(parents=True,exist_ok=True)
        if re.fullmatch(r'Runtime\.7z\.\d{3}',relative.name):
            if digest(original)!=entry['sha256']:raise RuntimeError(f'Runtime part failed checksum: {relative}')
            try:os.link(original,target)
            except OSError:shutil.copy2(original,target)
        else:copy(original,target)
    copy(installer,OUT/'Packages/RLManagerSetup.exe')
    copy(ROOT/'scripts/complete-setup/Install-RLM.ps1',OUT/'Setup/Install-RLM.ps1')
    copy(ROOT/'scripts/complete-setup/Read me.txt',OUT/'Read me.txt')
    copy(ROOT/'docs/AMD_SPEECH.md',OUT/'AMD speech support.txt')
    write_manifest(manifest['runtimeBytes'],manifest.get('runtimeVersion',source_version))

def main():
    if '--reuse-runtime' in sys.argv:
        reuse_runtime(sys.argv[sys.argv.index('--reuse-runtime')+1]);return
    if '--package-staged' in sys.argv:
        package_staged();return
    resume='--resume' in sys.argv
    if (OUT.exists() or STAGE.exists()) and not resume:raise RuntimeError('Use a new version or review the existing staging/output folder first')
    if resume and any((OUT/'Packages').glob('Runtime.7z*')):raise RuntimeError('Review the existing runtime archive before resuming')
    OUT.mkdir(parents=True,exist_ok=resume);STAGE.mkdir(parents=True,exist_ok=resume)
    base=Path(sys.executable).parent;site=base/'Lib/site-packages'
    speech=ROOT/'rl_bridge/local_runtime/chatterbox_venv/Lib/site-packages'
    print('Preparing portable Python and local bots...',flush=True)
    # Start with the complete working base installation. Overlay the isolated
    # CUDA policies; do not ship a venv referring to the developer's home path.
    overlays={p.name for p in speech.iterdir() if p.name!='__pycache__'}
    def python_ignore(folder,names):
        skip=set(ignored(folder,names))
        if Path(folder)==base:skip.update(n for n in names if n in ('Scripts','include','libs'))
        if Path(folder)==site:
            skip.update(n for n in names if n in overlays or n.startswith(('torch-','torchvision-')) and n.endswith('.dist-info'))
        return list(skip)
    copy(base,STAGE/'python',python_ignore)
    copy(speech,STAGE/'python/Lib/site-packages')
    copy(ROOT/'scripts/complete-setup/sitecustomize.py',STAGE/'python/Lib/site-packages/sitecustomize.py')
    run(SEVEN,'x','-y','-bd',DOWNLOADS/'Java17.zip',f'-o{STAGE/"java"}',stdout=subprocess.DEVNULL)
    copy(base.parent/'RLBotPackDeletable/RLBotPack-master/RLBotPack',STAGE/'botpack',
         lambda folder,names: ignored(folder,names)+[n for n in names if n in ('venv','.venv')])
    runtime=ROOT/'rl_bridge/local_runtime'
    copy(runtime/'llama',STAGE/'llama')
    copy(runtime/'text_model/qwen2.5-1.5b-instruct-q4_k_m.gguf',STAGE/'text_model/qwen2.5-1.5b-instruct-q4_k_m.gguf')
    snapshots=Path.home()/'.cache/huggingface/hub/models--ResembleAI--chatterbox/snapshots'
    models=sorted(p for p in snapshots.iterdir() if (p/'t3_cfg.safetensors').is_file())
    if not models:raise RuntimeError('The speech model is not installed')
    for name in ('conds.pt','s3gen.safetensors','t3_cfg.safetensors','tokenizer.json','ve.safetensors'):
        copy(models[-1]/name,STAGE/'chatterbox_model'/name)
    copy(DOWNLOADS/'BakkesMod.exe',STAGE/'bakkesmod/BakkesMod.exe')
    print('Testing relocated Python with isolated imports...',flush=True)
    proof="import sys,rlbot,torch,torchaudio,torchvision,chatterbox,websocket,numpy;from chatterbox.tts import ChatterboxTTS;print('PORTABLE_OK',sys.prefix,torch.__version__)"
    run(STAGE/'python/python.exe','-B','-I','-c',proof,cwd=STAGE)
    installer=ROOT/f'release/{VERSION}/RL.Manager.{VERSION}.Setup.exe'
    print('Waiting for the completed player installer...',flush=True)
    deadline=time.monotonic()+1200
    while not installer.is_file() or not installer.with_suffix('.exe.blockmap').is_file():
        if time.monotonic()>deadline:raise RuntimeError('Build the player installer first')
        time.sleep(2)
    copy(ROOT/'scripts/complete-setup/Install-RLM.ps1',OUT/'Setup/Install-RLM.ps1')
    csc=Path(os.environ.get('WINDIR','C:/Windows'))/'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
    run(csc,'/nologo','/target:winexe','/reference:System.Windows.Forms.dll',
        f'/win32icon:{ROOT/"public/brand/app-icon.ico"}',f'/out:{OUT/"Install RL Manager.exe"}',
        ROOT/'scripts/complete-setup/SetupLauncher.cs')
    copy(ROOT/'scripts/complete-setup/Read me.txt',OUT/'Read me.txt')
    copy(ROOT/'docs/AMD_SPEECH.md',OUT/'AMD speech support.txt')
    copy(installer,OUT/'Packages/RLManagerSetup.exe')
    copy(DOWNLOADS/'RocketHost.zip',OUT/'Packages/RocketHost.zip')
    copy(DOWNLOADS/'BakkesModCore.zip',OUT/'Packages/BakkesModCore.zip')
    copy(DOWNLOADS/'vc_redist.x64.exe',OUT/'Packages/vc_redist.x64.exe')
    run(SEVEN,'e','-y',DOWNLOADS/'BakkesModSetup.zip',f'-o{OUT/"Packages"}')
    copy(SEVEN,OUT/'Tools/7za.exe');copy(DOWNLOADS/'7zip-license.txt',OUT/'Tools/7zip-license.txt')
    copy(ROOT/'node_modules/7zip-bin/LICENSE.txt',OUT/'Tools/7zip-bin-wrapper-license.txt')
    copy(DOWNLOADS/'llama-license.txt',OUT/'Notices/llama-license.txt')
    copy(DOWNLOADS/'Qwen-license.txt',OUT/'Notices/Qwen-license.txt')
    copy(DOWNLOADS/'chatterbox-license.txt',OUT/'Notices/chatterbox-license.txt')
    copy(base.parent/'RLBotPackDeletable/RLBotPack-master/LICENSE',OUT/'Notices/RLBotPack-license.txt')
    copy(ROOT/'scripts/complete-setup/Third party notices.txt',OUT/'Third party notices.txt')
    if '--stage-only' not in sys.argv:
        package_staged()

if __name__=='__main__':main()
