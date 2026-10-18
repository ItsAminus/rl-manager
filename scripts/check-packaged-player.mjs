import fs from 'node:fs';import path from 'node:path';import cp from 'node:child_process';import net from 'node:net';
const screenshots=!process.argv.includes('--no-screenshots');
const root=process.cwd(),scratch=path.join(root,'scratch'),folder=fs.mkdtempSync(path.join(scratch,'packaged-check-'));
const port=await new Promise(resolve=>{const s=net.createServer();s.listen(0,'127.0.0.1',()=>{const value=s.address().port;s.close(()=>resolve(value));});});
const version=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8')).version;
const exe=path.join(root,'release',version,'win-unpacked/RL Manager.exe');
const proc=cp.spawn(exe,[`--remote-debugging-port=${port}`,'--remote-debugging-address=127.0.0.1'],{env:{...process.env,RLM_USER_DATA:folder},windowsHide:true,stdio:'ignore'});
const delay=ms=>new Promise(r=>setTimeout(r,ms));let socket;
try{
 let page;
 for(let i=0;i<900;i++){try{const rows=await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();page=rows.find(p=>p.type==='page'&&p.url.includes('/dist/index.html'));if(page)break;}catch{}await delay(100);}
 if(!page)throw Error('Packaged game did not open the main screen. Log: '+(fs.existsSync(path.join(folder,'logs/rl-manager.log'))?fs.readFileSync(path.join(folder,'logs/rl-manager.log'),'utf8'):'none'));
 socket=new WebSocket(page.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;});let next=0;const pending=new Map();
 socket.onmessage=event=>{const value=JSON.parse(event.data);if(value.id){const p=pending.get(value.id);pending.delete(value.id);value.error?p?.reject(Error(JSON.stringify(value.error))):p?.resolve(value.result);}};
 const command=(method,params={})=>new Promise((resolve,reject)=>{const id=++next;pending.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params}));});
 const run=async expression=>{const r=await command('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true,userGesture:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
 const wait=async expression=>{for(let i=0;i<450;i++){if(await run(expression))return;await delay(100);}throw Error('Timed out: '+expression);};
 await wait("!!document.querySelector('.tour-intro')");
 const info=await run('window.api.app.playerInfo()');if(!info.packaged||info.version!==version)throw Error('Wrong packaged identity: '+JSON.stringify(info));
 if(!await run("typeof window.api.competitions.repairFormat==='function'"))throw Error('Tournament repair API missing');
 if(!await run("typeof window.api.rlbot.confirmBakkesmod==='function'"))throw Error('BakkesMod confirmation API missing');
 const denied=await run("window.api.db.run('UPDATE players SET overall=1').then(()=>false,()=>true)");if(!denied)throw Error('Packaged database editor still accessible');
 await run("document.querySelector('.tour-intro .tour-primary').click()");await wait("!!document.querySelector('.tour-root[data-step=office]')&&!!document.querySelector('.overview-metrics')");
 const emblem=await run("(async()=>{const el=document.querySelector('.nav-item[href=\"#/social\"] img');if(!el)throw Error('Chirp emblem missing');await el.decode();return el.naturalWidth;})()");if(emblem<500)throw Error('Packaged Chirp image did not load');
 if((await run('window.api.career.list()')).length)throw Error('Practice leaked into career list');
 await run("document.querySelector('.tour-skip').click()");await wait("!!document.querySelector('.welcome-page')&&!document.querySelector('.tour-root')");
 await delay(700);
 const image=await run("(async()=>{const url=getComputedStyle(document.querySelector('.welcome-art')).backgroundImage.slice(5,-2);const image=new Image();image.src=url;await image.decode();return {width:image.naturalWidth,url};})()");if(image.width<1000)throw Error('Missing packaged background');
 if(screenshots){const screenshot=await command('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(scratch,'release-review/packaged-menu.png'),Buffer.from(screenshot.data,'base64'));}
 for(const name of ['Championship night','Into the arena']){
  await run(`document.querySelector('.arena-backdrops button[aria-label="${name}"]').click()`);
  const width=await run("(async()=>{const i=new Image();i.src=getComputedStyle(document.querySelector('.welcome-art')).backgroundImage.slice(5,-2);await i.decode();return i.naturalWidth;})()");if(width<1000)throw Error('Missing packaged scene: '+name);
 }
 const saved=await run('window.api.app.playerInfo()');if(saved.preferences.tutorialOutcome!=='skipped')throw Error('Skip not remembered');
 await run("location.hash='/settings'");await wait("!!document.querySelector('.settings-tabs')");if(await run("/Developer Mode|INJECT TREASURY|Force Advance/.test(document.body.textContent)"))throw Error('Cheats remain');
 if(!await run("typeof window.api.rlbot.testAudio==='function'&&document.body.textContent.includes('Test match audio')"))throw Error('Packaged match audio test missing');
 await run("document.querySelectorAll('.settings-tabs button')[1].click()");await wait("!!document.querySelector('#speech-device')");
 await run("(()=>{const select=document.querySelector('#speech-device');select.value='cpu';select.dispatchEvent(new Event('change',{bubbles:true}));})()");
 await run("Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Save connection settings').click()");
 await wait("document.body.textContent.includes('Connection settings saved')");
 if((await run('window.api.app.integration()')).speechDevice!=='cpu')throw Error('CPU caster preference not saved');
 await run("location.hash='/'");await wait("!document.querySelector('#speech-device')");await run("location.hash='/settings'");await wait("!!document.querySelector('.settings-tabs')");
 await run("document.querySelectorAll('.settings-tabs button')[1].click()");await wait("document.querySelector('#speech-device')?.value==='cpu'");
 if(screenshots){const voiceShot=await command('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(scratch,'release-review/caster-compute-settings.png'),Buffer.from(voiceShot.data,'base64'));}
 if(!await run("window.api.app.saveIntegration({speechDevice:'windows'}).then(()=>false,()=>true)"))throw Error('Unsupported voice substitution accepted');
 await run('window.api.app.quit()');
 console.log(JSON.stringify({passed:true,packaged:true,version:info.version,background:image.width,practiceIsolated:true,cheatApiBlocked:true,splashAndPreloadWorking:true,chirpEmblem:emblem,arenaBackgrounds:3,folder}));
}catch(error){console.error(error.stack);process.exitCode=1;}finally{socket?.close();if(proc.exitCode===null)proc.kill();}
