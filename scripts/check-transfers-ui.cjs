// Exercise the actual renderer with an isolated career database.
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, width: 1500, height: 1000, webPreferences: { contextIsolation: true, backgroundThrottling: false } });
  win.webContents.on('console-message', (_, level, message) => { if (level >= 2) console.log('Renderer:', message); });
  const run = async code => { try { return await win.webContents.executeJavaScript(code); } catch(e) { throw new Error(code + ': ' + e.message); } };
  const waitFor = async code => {
    for (let i = 0; i < 160; i++) { if (await run(code)) return; await new Promise(r => setTimeout(r, 150)); }
    throw new Error('Timed out: ' + code);
  };
  try {
    await win.loadURL('http://127.0.0.1:5179/__review');
    await waitFor('document.body.innerText.includes("Your starting three")');
    await run('location.hash="/transfers"');
    await waitFor('document.querySelectorAll(".transfers-table tbody tr").length===50');
    await waitFor(`Array.from(document.querySelectorAll('button')).some(b=>b.textContent.startsWith('Show more'))`);
    const measure = () => run(`(() => { const wrap=document.querySelector('.transfers-table-wrap'), table=document.querySelector('.transfers-table'); return { rows: table.tBodies[0].rows.length, wrapperHeight: wrap.clientHeight, tableHeight: table.clientHeight }; })()`);
    let sizes = await measure();
    if (sizes.wrapperHeight < sizes.tableHeight - 2) throw new Error('Transfer rows are clipped: ' + JSON.stringify(sizes));
    await run(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent.startsWith('Show more')).click()`);
    await waitFor('document.querySelectorAll(".transfers-table tbody tr").length===100');
    sizes = await measure();
    if (sizes.wrapperHeight < sizes.tableHeight - 2) throw new Error('Expanded rows are clipped');
    const view = await run('location.hash');
    await run(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()==='Dossier').click()`);
    await waitFor('location.hash.includes("/player/")');
    await run('document.querySelector(".back-button").click()');
    await waitFor('document.querySelectorAll(".transfers-table tbody tr").length===100');
    if (await run('location.hash') !== view) throw new Error('Back did not restore the transfer view');
    await run('document.querySelectorAll(".transfers-table tbody tr")[99].scrollIntoView({block:"center"})');
    fs.mkdirSync('scratch/ui-review', { recursive: true });
    fs.writeFileSync('scratch/ui-review/transfers-expanded.png', (await win.webContents.capturePage()).toPNG());
    console.log('PASS: 50 rows visible, Show more reveals 100 unclipped rows, Dossier → Back restores 100 rows.', sizes);
  } catch (e) { console.error(e); process.exitCode = 1; }
  app.quit();
});
