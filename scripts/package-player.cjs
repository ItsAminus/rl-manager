// The old builder archive includes macOS symlinks, which need privileges on
// Windows even though those files are unused. Cache just the Windows tools.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const root=path.resolve(__dirname,'..'),cache=path.join(root,'scratch','release-tools');
async function main(){
 const version=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8')).version;
 const payload=path.join(root,'scratch/local-bot-payload');
 const manifest=JSON.parse(fs.readFileSync(path.join(payload,'manifest.json'),'utf8'));
 const runtimeVersion=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8')).localBotRuntimeVersion||version;
 if(manifest.version!==runtimeVersion||manifest.policies!==16||!manifest.files?.length||!fs.existsSync(path.join(payload,'local-bots.7z')))throw Error('Build and audit the local-bot repair payload for this version first: python scripts/build-local-bot-runtime.py');
 if(process.platform==='win32'){
  const target=path.join(cache,'winCodeSign','winCodeSign-2.6.0');
  if(!fs.existsSync(path.join(target,'rcedit-x64.exe'))){
   fs.mkdirSync(target,{recursive:true});const archive=path.join(cache,'winCodeSign-2.6.0.7z');
   const response=await fetch('https://github.com/electron-userland/electron-builder-binaries/releases/download/winCodeSign-2.6.0/winCodeSign-2.6.0.7z');
   if(!response.ok)throw Error('Could not download Windows packaging tools: '+response.status);
   fs.writeFileSync(archive,Buffer.from(await response.arrayBuffer()));
   const r=cp.spawnSync(require('7zip-bin').path7za,['x','-y','-bd',archive,'-o'+target,'-xr!darwin','-xr!linux'],{stdio:'inherit',windowsHide:true});if(r.status)throw Error('Could not prepare Windows packaging tools.');
  }
 }
 const {build,Platform,Arch}=require('electron-builder');
 process.env.ELECTRON_BUILDER_CACHE=cache;
 await build({targets:Platform.WINDOWS.createTarget(['nsis'],Arch.x64),publish:'never'});
 const result=require('./prune-releases.cjs').pruneOldReleases(root);
 if(result.removed.length)console.log(`Removed ${result.removed.length} obsolete installers (${(result.removedBytes/1e9).toFixed(2)} GB); kept ${result.kept}.`);
}
main().catch(error=>{console.error(error);process.exitCode=1;});
