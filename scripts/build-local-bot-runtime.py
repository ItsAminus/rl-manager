"""Build an offline local-match runtime from audited, installed dependencies."""
import hashlib,importlib.metadata as md,json,os,shutil,subprocess,sys
from pathlib import Path
from packaging.requirements import Requirement

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'rl_bridge'))
from bot_assignment import engine_config
from local_bot_health import LOCAL_LADDER

SKIP={'__pycache__','.git','.venv','venv','.pytest_cache','.env','direct_url.json'}
def copy(source,target):
    source,target=Path(source),Path(target)
    if source.is_dir():
        for folder,dirs,files in os.walk(source):
            dirs[:]=[d for d in dirs if d not in SKIP]
            for name in files:
                if name not in SKIP and not name.endswith(('.pyc','.pyo','.log')):
                    copy(Path(folder)/name,target/Path(folder).relative_to(source)/name)
    else:
        target.parent.mkdir(parents=True,exist_ok=True)
        if target.exists():return
        try:os.link(source,target)
        except OSError:shutil.copy2(source,target)

def main():
    version=json.loads((ROOT/'package.json').read_text())['version']
    stage=ROOT/'scratch'/f'local-bot-runtime-{version}'
    output=ROOT/'scratch/local-bot-payload';output.mkdir(exist_ok=True)
    base=Path(sys.executable).parent;site=base/'Lib/site-packages'
    source=base.parent/'RLBotPackDeletable/RLBotPack-master/RLBotPack'
    stage.mkdir(exist_ok=True)
    for p in base.iterdir():
        if p.is_file() and p.suffix.lower() in {'.exe','.dll','.zip','.txt'}:copy(p,stage/'python'/p.name)
    for name in ['DLLs','Lib']:
        for p in (base/name).iterdir():
            if p.name not in {'site-packages','test','tests','idlelib','turtledemo','ensurepip','__pycache__'}:
                copy(p,stage/'python'/name/p.name)
    copy(base/'tcl',stage/'python/tcl')
    # Seed from real imports plus declared policy requirements, then include the
    # installed dependency closure and native sibling libraries from RECORDs.
    imported=['_distutils_hack','colorama','flatbuffers','more_itertools','mpmath','numpy','packaging','pkg_resources','platformdirs','psutil','requirements','rlbot','rlgym_compat','setuptools','sympy','torch','tqdm','typing_extensions.py','virxrlcu.cp311-win_amd64.pyd','websockets']
    mapping=md.packages_distributions()
    names={'pip','setuptools','packaging','rlbot','torch','numpy','rlgym-compat','VirxERLU-CLib','websocket-client'}
    for name in imported:names.update(mapping.get(name.split('.')[0],[]))
    pending=list(names);distributions={}
    while pending:
        name=pending.pop();d=md.distribution(name);key=d.metadata['Name'].lower().replace('_','-')
        if key in distributions:continue
        distributions[key]=d
        for line in d.requires or []:
            req=Requirement(line)
            if req.marker is None or req.marker.evaluate({'extra':''}):pending.append(req.name)
    tops=set(imported)
    for d in distributions.values():
        for file in d.files or []:
            parts=Path(file).parts
            if parts and parts[0] not in {'.','..'}:tops.add(parts[0])
    for name in sorted(tops):
        p=site/name
        if p.exists():copy(p,stage/'python/Lib/site-packages'/name)
    copy(ROOT/'scripts/complete-setup/sitecustomize.py',stage/'python/Lib/site-packages/sitecustomize.py')
    for group in LOCAL_LADDER:
        for name in group:
            cfg=engine_config(source,name)
            if cfg and cfg.is_relative_to(source):
                top=cfg.relative_to(source).parts[0];copy(source/top,stage/'botpack'/top)
    copy(source.parent/'LICENSE',stage/'RLBotPack-LICENSE.txt')
    copy(source/'L0laapk3_shared',stage/'botpack/L0laapk3_shared')
    seven=ROOT/'node_modules/7zip-bin/win/x64/7za.exe'
    if not (stage/'java').exists():
        subprocess.run([str(seven),'x','-y','-bd',str(ROOT/'scratch/distribution-downloads/Java17.zip'),'-o'+str(stage/'java')],check=True,stdout=subprocess.DEVNULL)
    subprocess.run([str(stage/'python/python.exe'),'-B',str(ROOT/'rl_bridge/local_bot_health.py'),'--botpack',str(stage/'botpack'),'--report',str(output/'audit.json')],check=True,
                   env={**os.environ,'PYTHONNOUSERSITE':'1','PYTHONPATH':''},cwd=stage)
    archive=output/'local-bots.7z'
    if archive.exists():raise RuntimeError('Review existing local-bots.7z before rebuilding')
    subprocess.run([str(seven),'a','-t7z','-mx=1','-mmt=4','-ms=off',str(archive),'.'],cwd=stage,check=True)
    subprocess.run([str(seven),'t',str(archive),'-bd'],check=True,stdout=subprocess.DEVNULL)
    with archive.open('rb') as stream:digest=hashlib.file_digest(stream,'sha256').hexdigest()
    manifest={'version':version,'sha256':digest,'bytes':archive.stat().st_size,'policies':sum(map(len,LOCAL_LADDER)),
              'files':[{'path':p.relative_to(stage).as_posix(),'bytes':p.stat().st_size} for p in sorted(stage.rglob('*')) if p.is_file()],
              'distributions':{k:d.version for k,d in sorted(distributions.items())}}
    (output/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
    copy(seven,output/'7za.exe')
    copy(ROOT/'node_modules/7zip-bin/LICENSE.txt',output/'7zip-wrapper-LICENSE.txt')
    copy(ROOT/'distribution/RL-Manager-Complete-1.5.0/Tools/7zip-license.txt',output/'7zip-LICENSE.txt')
    print(json.dumps({'archive':str(archive),'bytes':archive.stat().st_size,'policies':manifest['policies']}))

if __name__=='__main__':main()
