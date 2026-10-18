// Checks the real production bundle without opening or migrating a user save.
const {app,BrowserWindow}=require('electron');
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),scratch=path.join(root,'scratch');
app.disableHardwareAcceleration();
app.whenReady().then(async()=>{
  fs.mkdirSync(scratch,{recursive:true});
  const temp=fs.mkdtempSync(path.join(scratch,'production-media-'));
  const read=name=>JSON.parse(fs.readFileSync(path.join(root,'data',name),'utf8'));
  const portraits=read('scoreboard-portraits.json'),players=read('players.json').filter(p=>portraits[p.id]).slice(0,6),logos=Object.entries(read('team-broadcast-logos.json')).slice(0,2);
  const side=i=>({id:logos[i][0],name:i?'Orange club':'Blue club',shortName:i?'ORG':'BLU',logo:logos[i][1].logo,players:players.slice(i*3,i*3+3).map(p=>({playerId:p.id,gamertag:p.gamertag,rating:p.overall||80}))});
  const state={blue:1,orange:0,remaining:180,scoreboard:true,players:[],context:{blue:side(0),orange:side(1),event:'Production media check',round:1,arena:'Mannfield',series:{gameNumber:1,bestOf:3,blueWins:0,orangeWins:0}}};
  const preload=path.join(temp,'preload.cjs');
  fs.writeFileSync(preload,`const {contextBridge}=require('electron');contextBridge.exposeInMainWorld('api',{broadcast:{state:async()=>(${JSON.stringify(state)}),onUpdate:()=>()=>{}}});`);
  const win=new BrowserWindow({show:false,width:1440,height:1000,webPreferences:{offscreen:true,contextIsolation:true,preload}});
  win.webContents.setAudioMuted(true);
  let code=0;
  try{
    await win.loadFile(path.join(root,'dist/index.html'),{query:{broadcast:'1'}});
    let images=[];
    for(let n=0;n<150;n++){
      images=await win.webContents.executeJavaScript(`Array.from(document.images).map(i=>({src:i.src,ready:i.complete&&i.naturalWidth>0}))`);
      if(images.length>=10&&images.every(i=>i.ready))break;
      await new Promise(r=>setTimeout(r,100));
    }
    if(images.length<10||images.some(i=>!i.ready||!i.src.includes('/public/')))throw Error('Production portraits or crests failed: '+JSON.stringify(images));
    const audio=await win.webContents.executeJavaScript(`(async()=>{
      const track=new Audio(new URL('../public/audio/timeout.ogg',location.href).href);
      track.loop=true;track.volume=.3;
      await new Promise((resolve,reject)=>{track.onloadedmetadata=resolve;track.onerror=()=>reject(Error('Timeout music did not decode'));track.load();});
      await track.play();await new Promise(r=>setTimeout(r,400));
      const result={duration:track.duration,playing:!track.paused,position:track.currentTime,loop:track.loop};
      track.pause();track.currentTime=0;return {...result,stopped:track.paused};
    })()`,true);
    if(audio.duration<60||!audio.playing||audio.position<=0||!audio.loop||!audio.stopped)throw Error('Timeout playback failed: '+JSON.stringify(audio));
    console.log(JSON.stringify({passed:true,loadedImages:images.length,singleMediaDirectory:true,timeoutAudio:audio}));
  }catch(error){code=1;console.error(error.stack);}
  finally{
    win.destroy();
    if(!temp.startsWith(scratch+path.sep))throw Error('Unexpected test folder');
    fs.rmSync(temp,{recursive:true,force:true});
    app.exit(code);
  }
});
