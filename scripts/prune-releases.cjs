// Keep one distributable after successful packaging; never touch saves/runtimes.
const fs=require('node:fs'),path=require('node:path');
const workspace=path.resolve(__dirname,'..');
function pruneOldReleases(root=workspace,version=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8')).version,{dryRun=false}={}){
  if(!/^\d+\.\d+\.\d+$/.test(version))throw Error('Expected a release version');
  const release=path.resolve(root,'release'),keep=path.join(release,version);
  if(fs.lstatSync(release).isSymbolicLink()||fs.lstatSync(keep).isSymbolicLink())throw Error('Refusing linked release paths');
  const installer=path.join(keep,`RL.Manager.${version}.Setup.exe`);
  if(fs.statSync(installer).size<1024*1024||fs.statSync(installer+'.blockmap').size===0)throw Error('Keep a completed latest installer before pruning');
  const parts=value=>value.split('.').map(Number);
  const older=value=>{const a=parts(value),b=parts(version);for(let i=0;i<3;i++){if(a[i]!==b[i])return a[i]<b[i];}return false;};
  function bytes(folder){let total=0;for(const item of fs.readdirSync(folder,{withFileTypes:true})){
    const file=path.join(folder,item.name),stat=fs.lstatSync(file);
    if(stat.isSymbolicLink())throw Error('Refusing linked release subtree: '+file);
    total+=stat.isDirectory()?bytes(file):stat.size;
  }return total;}
  const removed=[];
  for(const item of fs.readdirSync(release,{withFileTypes:true})){
    if(!item.isDirectory()||!/^\d+\.\d+\.\d+$/.test(item.name)||!older(item.name))continue;
    const target=path.resolve(release,item.name);
    if(path.dirname(target)!==release||fs.lstatSync(target).isSymbolicLink())throw Error('Unsafe release cleanup target');
    const expected=`RL.Manager.${item.name}.Setup.exe`;
    const allowed=new Set([expected,expected+'.blockmap','builder-debug.yml','release-check.json','win-unpacked']);
    if(!fs.existsSync(path.join(target,expected))||fs.readdirSync(target).some(name=>!allowed.has(name)))continue;
    const size=bytes(target);
    if(!dryRun)fs.rmSync(target,{recursive:true,force:false});
    removed.push({version:item.name,bytes:size});
  }
  return {kept:version,dryRun,removed,removedBytes:removed.reduce((sum,item)=>sum+item.bytes,0)};
}
module.exports={pruneOldReleases};
if(require.main===module)console.log(JSON.stringify(pruneOldReleases(workspace,undefined,{dryRun:!process.argv.includes('--apply')}),null,2));
