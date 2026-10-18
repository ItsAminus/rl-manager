// Real IPC and rendered buttons against the isolated preview database only.
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, width: 1600, height: 1100,
    webPreferences: { contextIsolation: true, offscreen: true, backgroundThrottling: false } });
  const run = code => win.webContents.executeJavaScript(code);
  const wait = async code => {
    for (let i = 0; i < 160; i++) {
      if (await run(code)) return;
      await new Promise(r => setTimeout(r, 100));
    }
    throw Error('Timeout: ' + code);
  };
  const sql = (query, params = []) => run(`window.api.db.run(${JSON.stringify(query)},${JSON.stringify(params)})`);
  const qa = 'qa-transfer-' + Date.now();
  let careerId, failed = false;
  try {
    await win.webContents.session.clearCache();
    await win.loadURL('http://127.0.0.1:5179/__review');
    await wait('document.body.innerText.includes("Your starting three")');
    for (const suffix of ['us', 'seller']) {
      await sql('INSERT INTO teams (id,name,region,reputation,cashBalance) VALUES (?,?,?,100,61904)', [qa+suffix,'Transfer test '+suffix,'Europe']);
      for (let i=0;i<4;i++) {
        if (suffix==='us' && i===3) continue;
        await sql('INSERT INTO players (id,gamertag,teamId,region,overall,potential,morale,reputation,marketValue) VALUES (?,?,?,?,93,95,70,80,420544)', [qa+suffix+i, suffix==='seller' && i===0 ? 'Atomic (test)' : 'Test player '+suffix+i,qa+suffix,'Europe']);
      }
    }
    const target=qa+'seller0';
    await sql('INSERT INTO contracts (id,playerId,teamId,salary,buyout,isActive) VALUES (?,?,?,14580,87480,1)', [qa+'contract',target,qa+'seller']);
    const created=await run(`window.api.career.create({managerName:'Transfer regression',teamId:${JSON.stringify(qa+'us')},region:'Europe',difficulty:'Normal'})`);
    if (!created.success) throw Error(created.error);
    careerId=created.id;
    await run(`import('/src/stores/careerStore.ts').then(m=>m.useCareerStore.getState().loadCareer(${JSON.stringify(careerId)}))`);
    const loadNegotiation=async()=>{
      await run("location.hash='/dashboard'");
      await wait('document.body.innerText.includes("Your starting three")');
      await run(`location.hash='/negotiate/${target}'`);
      await wait('!!document.querySelector(".signing-costs")');
    };
    await loadNegotiation();
    const costText=await run('document.querySelector(".signing-costs").innerText');
    if (!costText.includes('87,480') || !costText.includes('61,904') || !costText.includes('Short by')) throw Error('Existing buyout / cash shortfall not shown');
    if (!await run('document.querySelectorAll(".terms-actions-bar button")[1].disabled')) throw Error('Unaffordable accept button enabled');
    if (await run('document.body.innerText.includes("excited to put on the jersey")')) throw Error('Premature signing dialogue');
    // A quote can become stale: registration must reject and explain it in the room.
    await sql('UPDATE teams SET cashBalance=1000000 WHERE id=?', [qa+'us']);
    await loadNegotiation();
    await sql('UPDATE teams SET cashBalance=0 WHERE id=?', [qa+'us']);
    await run('document.querySelectorAll(".terms-actions-bar button")[1].click()');
    await wait('document.querySelector(".transcript-messages").innerText.includes("short by")');
    if (await run('document.body.innerText.includes("excited to put on the jersey") || !!document.querySelector(".deal-signed-card")')) throw Error('Failure displayed acceptance');
    await sql('UPDATE teams SET cashBalance=1000000 WHERE id=?', [qa+'us']);
    await loadNegotiation();
    await run('document.querySelectorAll(".terms-actions-bar button")[1].click()');
    await wait('!!document.querySelector(".deal-signed-card")');
    const signed=await run(`window.api.players.getById(${JSON.stringify(target)})`);
    if(signed.teamId!==qa+'us')throw Error('Successful deal did not move player');
    fs.mkdirSync('scratch/ui-review',{recursive:true});
    fs.writeFileSync('scratch/ui-review/signing-fixed.png',(await win.webContents.capturePage()).toPNG());
    // Restore a three-player squad, then exercise the fee agreement's actual button.
    await sql('UPDATE players SET teamId=? WHERE id=?',[qa+'seller',target]);
    const offer=qa+'offer';
    await sql("INSERT INTO outgoing_offers (id,careerId,playerId,sellerId,buyerId,fee,ceiling,salary,bonus,duration,status,createdDate,expiresDate,rounds) VALUES (?,?,?,?,?,30000,50000,30000,60000,12,'pending','2026-10-11','2026-10-31',0)",[offer,careerId,qa+'us0',qa+'us',qa+'seller']);
    await run(`import('/src/stores/careerStore.ts').then(m=>m.useCareerStore.getState().reloadRoster())`);
    await run("location.hash='/transfers?tab=outgoing'");
    await wait('document.querySelectorAll(".sale-offer").length===1');
    await run('document.querySelector(".sale-offer button").click()');
    await wait('document.querySelector(".sale-offer").innerText.includes("replacement") && !!document.querySelector(".sale-offer [role=status]")');
    const overview=await run(`window.api.management.outgoingTransfers(${JSON.stringify(careerId)})`);
    if(overview.offers[0].status!=='player_talks')throw Error('Three-player fee agreement failed');
    // A changed offer must show its error beside its button, even when scrolled.
    await sql("UPDATE outgoing_offers SET status='pending' WHERE id=?",[offer]);
    await run("location.hash='/dashboard'");await wait('document.body.innerText.includes("Your starting three")');
    await run("location.hash='/transfers?tab=outgoing'");await wait('!!document.querySelector(".sale-offer button")');
    await sql("UPDATE outgoing_offers SET status='rejected' WHERE id=?",[offer]);
    await run('document.querySelector(".sale-offer").scrollIntoView();document.querySelector(".sale-offer button").click()');
    await wait('!!document.querySelector(".sale-offer [role=alert]")');
    fs.writeFileSync('scratch/ui-review/transfer-feedback-fixed.png',(await win.webContents.capturePage()).toPNG());
    console.log('PASS: full buyout and costs; unaffordable button blocked; stale quote rejected without acceptance dialogue; successful contract persisted; three-player fee agreement; offer errors beside buttons.');
  } catch(e) { failed=true; console.error(e); }
  finally {
    if(careerId)await run(`window.api.career.delete(${JSON.stringify(careerId)})`).catch(()=>{});
    // All fixtures and generated career records were confined to the preview.
    for(const table of ['transfers','contracts','player_affiliations','player_traits','player_attributes','players']) {
      const column=table==='players'?'id':'playerId';
      await sql(`DELETE FROM ${table} WHERE ${column} LIKE ?`,[qa+'%']).catch(()=>{});
    }
    await sql('DELETE FROM teams WHERE id LIKE ?',[qa+'%']).catch(()=>{});
    await run("window.api.career.load('ui-preview')").catch(()=>{});
    fs.mkdirSync('scratch/ui-review',{recursive:true});
    fs.writeFileSync('scratch/ui-review/transfer-fixes-check.json',JSON.stringify({passed:!failed}));
    win.destroy();app.exit(failed?1:0);
  }
});
