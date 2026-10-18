// Review face photos in an isolated database, without opening the user's game.
const {app,BrowserWindow}=require('electron');
const fs=require('node:fs');
app.whenReady().then(async()=>{
  const win=new BrowserWindow({show:false,width:1550,height:1000,webPreferences:{contextIsolation:true,offscreen:true,backgroundThrottling:false}});
  const run=code=>win.webContents.executeJavaScript(code);
  const wait=async code=>{for(let i=0;i<250;i++){if(await run(code))return;await new Promise(r=>setTimeout(r,100));}throw Error('Timeout: '+code);};
  let failed=false;
  try{
    await win.loadURL('http://127.0.0.1:5179/__review');
    await wait('!!window.api&&document.body.innerText.includes("Your starting three")');
    const cases=[['pro_b745b0df-a964-4e56-905f-a0fc21703a8f','M7md'],['real_juicy','juicy'],['real_diaz','diaz'],['player_1','zen']];
    fs.mkdirSync('scratch/ui-review',{recursive:true});
    for(const [id,tag] of cases){
      await run(`location.hash=${JSON.stringify('/player/'+id)}`);
      await wait(`document.querySelector('.header-gamertag')?.textContent===${JSON.stringify(tag)}`);
      await wait(`(()=>{const image=document.querySelector('.profile-header-card .player-avatar-img');return image?.complete&&image.naturalWidth>0&&image.title.startsWith('Player headshot');})()`);
      const image=await run(`document.querySelector('.profile-header-card .player-avatar-img').getAttribute('src')`);
      if(!image.includes('/player-headshots/')&&!image.includes('/player-portraits/'))throw Error('Wrong photo: '+tag+' '+image);
      if(!await run(`document.querySelector('.portrait-credit').textContent.includes('Headshot source')`))throw Error('Wrong credit: '+tag);
      await run('document.querySelector(".main-content").scrollTop=0');
      await run('document.querySelector(".profile-header-card .player-avatar-img").decode()');
      await new Promise(resolve=>setTimeout(resolve,700));
      fs.writeFileSync('scratch/ui-review/headshot-'+tag+'.png',(await win.webContents.capturePage()).toPNG());
      console.log('PASS: '+tag+' rendered real headshot: '+image);
    }
  }catch(error){failed=true;console.error(error.stack);}
  win.destroy();app.exit(failed?1:0);
});
