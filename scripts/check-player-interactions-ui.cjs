// Exercise the real UI/IPC against scripts/preview-ui.mjs's separate test save.
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, width: 1500, height: 1000, webPreferences: { contextIsolation: true, backgroundThrottling: false, offscreen: true } });
  let failed = false;
  const run = code => win.webContents.executeJavaScript(code);
  const waitFor = async code => { for (let i = 0; i < 160; i++) { if (await run(code)) return; await new Promise(r => setTimeout(r, 150)); } throw new Error('Timed out: ' + code); };
  const click = text => run(`Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === ${JSON.stringify(text)} && !b.disabled)?.click()`);
  const shot = async name => { await new Promise(r => setTimeout(r, 600)); win.webContents.invalidate(); await new Promise(r => setTimeout(r, 250)); fs.mkdirSync('scratch/ui-review', { recursive: true }); fs.writeFileSync(`scratch/ui-review/${name}.png`, (await win.webContents.capturePage()).toPNG()); };
  try {
    await win.loadURL('http://127.0.0.1:5179/__review');
    await waitFor('document.body.innerText.includes("Your starting three")');
    const player = await run(`window.api.management.dressingRoom('ui-preview').then(d=>d.players[0])`);
    // Reset only this test player's interaction history in the isolated preview save.
    for (const table of ['player_conversations', 'player_promises', 'manager_relationships']) await run(`window.api.db.run('DELETE FROM ${table} WHERE careerId = ? AND playerId = ?', ['ui-preview', ${JSON.stringify(player.id)}])`);
    await run(`window.api.db.run('UPDATE players SET morale = 35 WHERE id = ?', [${JSON.stringify(player.id)}])`);
    await run(`location.hash='/dressing-room?player='+${JSON.stringify(player.id)}`);
    await waitFor('document.body.innerText.includes("Reply within 7 days")');
    await click('Listen and reassure');
    await waitFor(`document.body.innerText.includes('Thank you for listening. I needed that support.')`);
    await click('Offer support');
    await waitFor(`document.body.innerText.includes('I am here to help you reset.')`);
    if (!await run(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Offer support').disabled`)) throw new Error('Private meeting cooldown missing');
    await shot('dressing-room');
    const f = await run(`window.api.db.query("SELECT f.* FROM fixtures f JOIN career_competitions cc ON cc.competitionId=f.competitionId JOIN careers ca ON ca.id=cc.careerId WHERE ca.id='ui-preview' AND (f.homeTeamId=ca.teamId OR f.awayTeamId=ca.teamId) AND f.status='scheduled' ORDER BY f.scheduledDate LIMIT 1")`);
    if (!f) throw new Error('No preview fixture available');
    await run(`window.api.db.run("UPDATE careers SET currentDate = MAX(currentDate, ?) WHERE id = 'ui-preview'", [${JSON.stringify(f.scheduledDate)}])`);
    await win.reload(); await waitFor('document.body.innerText.includes("Your starting three")');
    await run(`location.hash='/match-day/'+${JSON.stringify(f.id)}`);
    await waitFor('document.body.innerText.includes("Before the first kickoff")');
    await click('Back the squad');
    await waitFor('document.querySelectorAll(".talk-reactions > div").length>=3');
    await shot('pregame-team-talk');
    const c = await run(`window.api.career.load('ui-preview').then(r=>r.career)`);
    const required = Math.ceil(Number(f.seriesFormat.replace(/\D/g, ''))/2);
    for (let n = 1; n <= required; n++) {
      const result = { fixtureId: f.id, gameNumber: n, blueTeamId: c.teamId, orangeTeamId: f.homeTeamId===c.teamId?f.awayTeamId:f.homeTeamId, blueScore: 2, orangeScore: 0, playerStats: [], wasPlayed: false };
      const save = await run(`window.api.gameResults.create(${JSON.stringify(result)})`); if (!save.success) throw new Error(save.error);
      const update = await run(`window.api.fixtures.updateResult(${JSON.stringify(f.id)}, ${n}, 0, ${JSON.stringify(n===required?'completed':'in_progress')})`); if (!update.success) throw new Error(update.error);
    }
    await run('location.hash="/dashboard"'); await waitFor('document.body.innerText.includes("Your starting three")');
    await run(`location.hash='/match-day/'+${JSON.stringify(f.id)}`);
    await waitFor('document.body.innerText.includes("Series debrief")');
    await click('Recognise the effort'); await waitFor('document.body.innerText.includes("You earned that series.")');
    await new Promise(r => setTimeout(r, 600));
    await waitFor('document.body.innerText.includes("You earned that series.") && !document.body.innerText.includes("Loading match day arena")');
    await shot('postgame-team-talk');
    console.log('PASS: inbox concern/reply, private meeting cooldown, pregame and postgame talks, persisted reactions rendered through real IPC.');
  } catch (e) { failed = true; console.error(e); }
  win.destroy(); app.exit(failed ? 1 : 0);
});
