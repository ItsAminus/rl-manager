// Renderer smoke check against the isolated preview, without launching the game.
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, width: 1500, height: 1000, webPreferences: { contextIsolation: true, backgroundThrottling: false } });
  win.webContents.on('console-message', (_, level, message) => { if (level >= 2) console.log('Renderer:', message); });
  try {
    await win.loadURL('http://127.0.0.1:5179/__review');
    const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
    for (let i = 0; i < 120; i++) { if (await win.webContents.executeJavaScript('document.body.innerText.includes("Your starting three")')) break; await wait(250); }
    fs.mkdirSync('scratch/ui-review', { recursive: true });
    for (const route of ['dashboard', 'squad', 'competitions', 'calendar', 'training', 'transfers', 'scouting', 'inbox', 'social']) {
      await win.webContents.executeJavaScript(`location.hash = ${JSON.stringify('#/' + route)}`);
      await wait(1800);
      if (route === 'competitions') {
        console.log('Events API count:', await win.webContents.executeJavaScript('window.api.competitions.getAll().then(rows => rows.length)'));
        for (let i = 0; i < 40; i++) { if (await win.webContents.executeJavaScript('document.body.innerText.includes("Europe Open Qualifier")')) break; await wait(250); }
      }
      win.webContents.invalidate();
      await wait(200);
      const shot = await win.webContents.capturePage();
      fs.writeFileSync(path.join('scratch/ui-review', route + '.png'), shot.toPNG());
      const text = await win.webContents.executeJavaScript('document.body.innerText');
      fs.writeFileSync(path.join('scratch/ui-review', route + '.txt'), text);
      console.log(route, text.slice(0, 900));
    }
  } catch (e) { console.error(e); process.exitCode = 1; }
  app.quit();
});
