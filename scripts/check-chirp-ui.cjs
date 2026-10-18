// Hidden Electron UI review against the separate preview database. No game launch.
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  const win = new BrowserWindow({ show:false, width:1600, height:1100, webPreferences:{contextIsolation:true,offscreen:true,backgroundThrottling:false} });
  const run = code => win.webContents.executeJavaScript(code);
  const wait = async code => { for(let i=0;i<250;i++){if(await run(code))return;await new Promise(r=>setTimeout(r,100));}throw Error('Timeout: '+code); };
  const click = async text => { const selector=`Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()===${JSON.stringify(text)} || b.closest('.chirp-nav') && b.querySelector('span')?.textContent===${JSON.stringify(text)})`; await wait(`!!(${selector}) && !(${selector}).disabled`); return run(`${selector}.click()`); };
  const input = (selector, value) => run(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(${selector.includes('textarea') ? 'HTMLTextAreaElement' : 'HTMLInputElement'}.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  let careerId, failed=false;
  try {
    await win.webContents.session.clearCache(); await win.loadURL('http://127.0.0.1:5179/__review');
    await wait('!!window.api && document.body.innerText.includes("Your starting three")');
    const created=await run("window.api.career.create({managerName:'Chirp review',teamId:'team_1',region:'Europe',difficulty:'Normal'})");
    if(!created.success)throw Error(created.error);careerId=created.id;
    await run(`import('/src/stores/careerStore.ts').then(m=>m.useCareerStore.getState().loadCareer(${JSON.stringify(careerId)}))`);
    // Seed an existing timeline fixture; new replies still use the normal
    // private-draft/publication path in this separate review database.
    await run(`window.api.management.chirpFeed(${JSON.stringify(careerId)})`);
    await wait(`window.api.db.query("SELECT COUNT(*) n FROM chirp_posts WHERE careerId=?",[${JSON.stringify(careerId)}]).then(rows=>(Array.isArray(rows)?rows[0]:rows)?.n>50)`);
    await run(`window.api.db.run("UPDATE chirp_publications SET published=1 WHERE careerId=?",[${JSON.stringify(careerId)}])`);
    await run(`window.api.db.run("UPDATE chirp_text_jobs SET state='frozen' WHERE careerId=?",[${JSON.stringify(careerId)}])`);
    await run(`window.api.db.run("INSERT OR IGNORE INTO chirp_publication_order(postId,careerId) SELECT postId,careerId FROM chirp_publications WHERE careerId=? AND published=1",[${JSON.stringify(careerId)}])`);
    await run("location.hash='/social'");await wait('document.querySelectorAll(".chirp-post").length===25');
    if(await run('!!document.querySelector(".sidebar")'))throw Error('Chirp should have its own navigation');
    await run('document.querySelector(".main-content").scrollTop=0');
    fs.writeFileSync('scratch/ui-review/chirp-home.png',(await win.webContents.capturePage()).toPNG());
    const root=await run('document.querySelector(".chirp-post").dataset.postId');
    await run('window.__chirpPost=document.querySelector(".chirp-post")');
    await run('window.__chirpPost.querySelector(".chirp-actions button[aria-label^=Like]").click()');
    await wait('window.__chirpPost.querySelector(".chirp-actions button[aria-label^=Like]").getAttribute("aria-pressed")==="true"');
    if(await run('getComputedStyle(window.__chirpPost.querySelector(".active-like svg")).fill')!=='rgb(255, 53, 79)')throw Error('Liked heart is not solid red');
    await wait('!window.__chirpPost.querySelector(".chirp-actions button[aria-label^=Repost]").disabled');
    await run('window.__chirpPost.querySelector(".chirp-actions button[aria-label^=Repost]").click()');
    await wait('!!window.__chirpPost.querySelector(".active-repost")');
    if(await run('getComputedStyle(window.__chirpPost.querySelector(".active-repost")).color')!=='rgb(22, 216, 141)')throw Error('Repost is not green');
    await wait('!window.__chirpPost.querySelector(".chirp-actions button[aria-label^=Bookmark]").disabled');
    await run('window.__chirpPost.querySelector(".chirp-actions button[aria-label^=Bookmark]").click()');
    await wait('window.__chirpPost.querySelector(".chirp-actions button[aria-label^=Bookmark]").getAttribute("aria-pressed")==="true"');
    await click('Bookmarks');await wait('document.querySelectorAll(".chirp-post").length===1');
    if(await run('document.querySelector(".chirp-post").dataset.postId')!==root)throw Error('Wrong saved chirp');
    await click('Home');await wait('!!document.querySelector(".chirp-composer textarea") && document.querySelectorAll(".chirp-post").length===25');
    await click('Show more chirps');await wait('document.querySelectorAll(".chirp-post").length===50');
    if(await run('new Set(Array.from(document.querySelectorAll(".chirp-post")).map(p=>p.dataset.postId)).size')!==50)throw Error('Duplicate feed pagination');
    await run("location.hash='/social?view=profile&account=gibbs'");await wait('!!document.querySelector(".chirp-profile")');
    await wait('document.querySelector(".chirp-cover-image")?.complete');
    await click('Following');await wait('document.querySelector(".chirp-profile-top button").textContent==="Follow"');
    await click('Follow');await wait('document.querySelector(".chirp-profile-top button").textContent==="Following"');
    await run('document.querySelector(".main-content").scrollTop=0');
    fs.writeFileSync('scratch/ui-review/chirp-profile.png',(await win.webContents.capturePage()).toPNG());
    await click('Home');await wait('!!document.querySelector(".chirp-composer textarea")');
    await input('.chirp-composer textarea','The next series starts in practice. Backing the squad. #ClubLife');
    await wait('!document.querySelector(".chirp-composer .chirp-primary").disabled');
    await run('document.querySelector(".chirp-composer .chirp-primary").click()');
    await wait('!!document.querySelector(".chirp-thread-root") && document.body.innerText.includes("The next series starts in practice.")');
    await input('.chirp-reply-composer textarea','Thanks for the support. We are reviewing our rotations.');
    await run('document.querySelector(".chirp-reply-composer button").click()');
    await wait('document.querySelectorAll(".chirp-post").length>=2 && document.body.innerText.includes("Thanks for the support.")');
    const mainId=await run('document.querySelector(".chirp-thread-root .chirp-post").dataset.postId');
    await wait('Array.from(document.querySelectorAll(".chirp-post:not(.detail)")).some(p=>!p.closest(".chirp-ancestors")&&p.dataset.accountId!=="manager")');
    const childId=await run('Array.from(document.querySelectorAll(".chirp-post")).find(p=>!p.classList.contains("detail") && !p.closest(".chirp-ancestors")&&p.dataset.accountId!=="manager").dataset.postId');
    await run(`document.querySelector('[data-post-id="${childId}"] .chirp-actions button[title="View replies"]').click()`);
    await wait(`document.querySelector('.chirp-thread-root .chirp-post')?.dataset.postId===${JSON.stringify(childId)}`);
    if(!await run(`!!document.querySelector('.chirp-ancestors [data-post-id="${mainId}"]')`))throw Error('Missing parent context above focused reply');
    const handle=await run('document.querySelector(".chirp-thread-root .chirp-byline span:not(.chirp-verified)").textContent');
    if(!await run('document.querySelector(".chirp-compose-target").textContent.includes("@")'))throw Error('Composer has no specific recipient');
    await input('.chirp-reply-composer textarea','I disagree with that particular point.');
    await run('document.querySelector(".chirp-reply-composer button").click()');
    await wait('document.querySelector(".chirp-thread-root .chirp-post").dataset.postId==='+JSON.stringify(childId)+' && Array.from(document.querySelectorAll(".chirp-post")).some(p=>!p.closest(".chirp-ancestors")&&p.querySelector(".chirp-body")?.textContent==="I disagree with that particular point.")');
    await run('document.querySelector(".main-content").scrollTop=0');
    fs.writeFileSync('scratch/ui-review/chirp-thread.png',(await win.webContents.capturePage()).toPNG());
    await click('Notifications');await wait('document.querySelectorAll(".chirp-notification").length>=4');
    await run('document.querySelector(".chirp-notification").click()');await wait('!!document.querySelector(".chirp-thread-root")');
    await click('Explore');await wait('!!document.querySelector(".chirp-explore input")');
    await input('.chirp-explore input','Gibbs');await click('Search');await wait('!!document.querySelector(".chirp-people-results")');
    if(!await run('document.querySelector(".chirp-people-results").textContent.includes("Gibbs")'))throw Error('Profile search missing');
    await run("location.hash='/social?view=explore&region=MENA'");await wait('document.querySelectorAll(".chirp-post").length>0 && document.querySelector("#chirp-region").value==="MENA"');
    if(!await run('Array.from(document.querySelectorAll(".chirp-post .chirp-account-kind")).every(p=>p.textContent.includes("MENA"))'))throw Error('Region filter leaked');
    win.setSize(700,1000);await run("location.hash='/social'");await wait('document.querySelectorAll(".chirp-post").length===25');
    await run('document.querySelector(".main-content").scrollTop=0');
    if(await run('document.querySelector(".chirp-shell").scrollWidth>window.innerWidth+2'))throw Error('Narrow layout overflows');
    fs.writeFileSync('scratch/ui-review/chirp-narrow.png',(await win.webContents.capturePage()).toPNG());
    await run("location.hash='/inbox'");await wait('!!document.querySelector(".inbox-header")');
    const unreadBefore=await run(`window.api.inbox.getUnreadCount(${JSON.stringify(careerId)})`);
    if(unreadBefore>0){await click('✓ Read all');await wait('document.querySelectorAll(".inbox-item-card.unread").length===0');}
    if(await run(`window.api.inbox.getUnreadCount(${JSON.stringify(careerId)})`)!==0)throw Error('Read all did not persist');
    console.log('PASS: solid red likes, green reposts, follow persistence, official banner, pagination, posting, replies, notifications, filters, narrow layout and Read all.');
  } catch(e) {failed=true;console.error(e.stack);if(careerId)console.error(JSON.stringify(await run(`window.api.db.query("SELECT state,error,COUNT(*) n FROM chirp_text_jobs WHERE careerId=? GROUP BY state,error",[${JSON.stringify(careerId)}])`).catch(()=>null)));fs.writeFileSync('scratch/ui-review/chirp-failed.png',(await win.webContents.capturePage()).toPNG());}
  finally {
    if(careerId)await run(`window.api.career.delete(${JSON.stringify(careerId)})`).catch(()=>{});
    win.destroy();app.exit(failed?1:0);
  }
});
