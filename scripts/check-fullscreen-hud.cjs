// Exercise Electron's real image decoder without opening an app window or game.
const {app,nativeImage}=require('electron');
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
app.disableHardwareAcceleration();
app.whenReady().then(()=>{
  try {
    const root=path.resolve(__dirname,'..');
    const filename=path.join(root,'src/main/fullscreen-broadcast.ts');
    const ts=require('typescript');
    const mod=new Module(filename,module);mod.filename=filename;mod.paths=module.paths;
    mod._compile(ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true}}).outputText,filename);
    const profiles=JSON.parse(fs.readFileSync(path.join(root,'data/broadcast-profiles.json')));
    const portraits=JSON.parse(fs.readFileSync(path.join(root,'data/player-portraits.json')));
    const players=JSON.parse(fs.readFileSync(path.join(root,'data/players.json')));
    const tags=['zen','Atow','Vatira','Atomic','BeastMode','Daniel'];
    const roster=tags.map(tag=>{
      const player=players.find(p=>!p.id.startsWith('sg_player_')&&p.gamertag.toLowerCase().replace(/\.+$/,'')===tag.toLowerCase());
      const record=profiles.players[player.id];
      return {gamertag:tag,photo:portraits[tag.toLowerCase()]?.path||record.avatarUrl,title:record.title||''};
    });
    const logos=Object.values(profiles.teams).filter(p=>p.avatarUrl).slice(0,2);
    const context={blue:{name:'Blue',logo:logos[0].avatarUrl,players:roster.slice(0,3)},orange:{name:'Orange',logo:logos[1].avatarUrl,players:roster.slice(3)}};
    const output=mod.exports.fullscreenBroadcast(context,{folder:path.join(root,'scratch/native-hud-check'),assetRoots:[path.join(root,'public')]});
    const paths=[output.blue.logo,output.orange.logo,...output.blue.players.map(p=>p.photo),...output.orange.players.map(p=>p.photo)];
    const sizes=paths.map(file=>nativeImage.createFromPath(file).getSize());
    if(paths.some(file=>!file)||sizes.some(size=>size.width!==128||size.height<1))throw Error('Native texture preparation failed: '+JSON.stringify({paths,sizes,context}));
    fs.writeFileSync(path.join(root,'scratch/native-hud-check/context.json'),JSON.stringify(output,null,2));
    console.log(JSON.stringify({textures:paths.length,sizes,windowOpened:false}));app.quit();
  }catch(error){console.error(error);app.exit(1);}
});
