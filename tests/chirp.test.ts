import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import initSqlJs from 'sql.js';
import { runMigration } from '../src/database/migrations/001_initial_schema';
import { Chirp } from '../src/main/chirp';
import { CareerManagement } from '../src/main/career-management';
import {markAllInboxRead} from '../src/main/inbox';
import {validChirpText} from '../src/main/chirp-text';
import {similarChirp} from '../src/main/chirp-personality';
import {chirpMatchContext} from '../src/main/chirp-match-context';

let SQL: any, raw: any, db: any, chirp: Chirp;
const regions = ['Europe','North America','MENA','Oceania','South America','Asia-Pacific','Sub-Saharan Africa'];
function adapter(sql: any) {
  let nested = false;
  return { exec: (s: string) => sql.exec(s), prepare: (s: string) => ({
    all: (...args: any[]) => { const q=sql.prepare(s);q.bind(args);const a=[];while(q.step())a.push(q.getAsObject());q.free();return a; },
    get: (...args: any[]) => { const q=sql.prepare(s);q.bind(args);const r=q.step()?q.getAsObject():undefined;q.free();return r; },
    run: (...args: any[]) => { sql.run(s,args);return {changes:sql.getRowsModified(),lastInsertRowid:0}; },
  }), transaction: (fn: any) => () => { if(nested)return fn();nested=true;sql.run('BEGIN');try{const r=fn();sql.run('COMMIT');return r;}catch(e){sql.run('ROLLBACK');throw e;}finally{nested=false;} } };
}
beforeAll(async()=>{ SQL=await initSqlJs(); });
beforeEach(()=>{
  raw=new SQL.Database();db=adapter(raw);runMigration(db);chirp=new Chirp(db);
  db.exec("INSERT INTO careers VALUES ('a','Coach','t0','Europe','Normal','2026-10-11','',''),('b','Other Coach','t1','North America','Normal','2026-10-11','','')");
  for(let r=0;r<7;r++){
    db.prepare('INSERT INTO teams (id,name,region,reputation) VALUES (?,?,?,80)').run('t'+r,'Team '+r,regions[r]);
    for(let n=0;n<3;n++){
      db.prepare('INSERT INTO players (id,gamertag,region,teamId,overall,potential,form,morale,preferredTendency) VALUES (?,?,?,?,90,95,60,70,?)').run('p'+r+n,'Player'+r+n,regions[r],'t'+r,'Balanced');
      db.prepare('INSERT INTO player_traits (playerId,confidence,pressureResistance) VALUES (?,60,70)').run('p'+r+n);
    }
  }
});
const count=()=>db.prepare('SELECT COUNT(*) n FROM chirp_posts WHERE careerId=?').get('a').n;
const fixture=()=>db.exec("INSERT INTO competitions (id,name) VALUES ('event','Event'); INSERT INTO career_competitions VALUES ('event','a','REGIONAL',1,'2026-10-11','[]'); INSERT INTO fixtures (id,competitionId,homeTeamId,awayTeamId,scheduledDate,status,seriesFormat,homeScore,awayScore) VALUES ('match','event','t0','t1','2026-10-11','completed','BO7',4,3)");

describe('Chirp career platform',()=>{
  it('feeds the real reverse sweep, deciding game and confirmed incidents into receipt replies even after result posts exist',async()=>{
    const own=chirp.publish('a',"We are NOT losing to this team again based on luck. Y'all suck");
    fixture();db.exec("UPDATE fixtures SET seriesFormat='BO5',homeScore=2,awayScore=3 WHERE id='match'");
    for(const [i,score] of [[6,5],[4,2],[3,5],[2,3],[0,9]].entries())db.prepare('INSERT INTO game_results(id,fixtureId,gameNumber,blueTeamId,orangeTeamId,blueScore,orangeScore) VALUES (?,?,?,?,?,?,?)').run('g'+i,'match',i+1,'t0','t1',...score);
    db.exec("INSERT INTO game_incidents VALUES ('g4',0,'p00','t0','open_net_miss',5,0,1,'{}'),('g4',1,'p00','t0','open_net_miss',4,0,1,'{}')");
    chirp.tick('a');const receipt=db.prepare("SELECT * FROM chirp_posts WHERE sourceKey=?").get('receipt:'+own.post.id);
    expect(receipt.fixtureId).toBe('match');
    const media=JSON.parse(db.prepare('SELECT media FROM chirp_post_meta WHERE postId=?').get(receipt.id).media);
    expect(media.headline).toBe('REVERSE SWEEP RECEIPTS');expect(media.games[4].score).toBe('0–9');
    const match=chirpMatchContext(db,'a','match')!;
    expect(match.facts.join(' ')).toMatch(/Team 0 led the series 2–0.*Team 1 completed a reverse sweep/);
    expect(match.incidents).toContain('Player00: 2 confirmed open-net misses in game 5; 2 marked critical.');
    const reaction={id:'verified-reply',context:{author:'Fan',role:'Fan',draft:'',topic:'Receipts',matchContext:match}};
    expect(validChirpText('Team 1 led 2–0 and won the series',reaction)).toBe(false);
    expect(validChirpText('Team 0 won the series, easy win',reaction)).toBe(false);
    expect(validChirpText('Team 0 led 2-0, then won 3-2. you got owned',reaction)).toBe(false);
    expect(validChirpText('Team 0 led 2-0, then Team 1 won 3-2. you got owned',reaction)).toBe(true);
    expect(validChirpText('5–0 in game 5? rough',reaction)).toBe(false);
    expect(validChirpText('you got 9 goals in the deciding game',reaction)).toBe(false);
    expect(validChirpText('{"body":"the receipt is staying up"}',reaction)).toBe(false);
    expect(validChirpText('Team 0 led 2–0 then got reverse swept, the receipt is staying up',reaction)).toBe(true);
    expect(chirpMatchContext(db,'b','match')).toBeUndefined();
    const before=count();chirp.tick('a');expect(count()).toBe(before);
    // A new manager reply inherits the fixture and re-reads it at generation time.
    const captured:any[]=[];const ai=new Chirp(db,{generate:async js=>{captured.push(...js);return {};},close:()=>{}});
    const reply=chirp.thread('a',own.post.id).replies.find((p:any)=>p.sourceKey?.includes(':reply:0'))||db.prepare('SELECT * FROM chirp_posts WHERE sourceKey=?').get('receipt:'+own.post.id+':reply:0');
    const response=ai.publish('a','We will respond in the next series.',reply.id);
    await ai.generateText('a');ai.close();
    const job=captured.find(j=>j.context.thread===response.post.body);
    expect(job.context.matchContext.games[4].score).toBe('0–9');expect(job.context.matchContext.incidents).toEqual(match.incidents);
    expect(job.context.intent).toContain('replied directly to YOU');
    expect(job.context.author).toBe(chirp.profile('a',reply.accountId).displayName);
  });
  it('does not infer a reverse sweep from an incomplete history or misses from shot totals',()=>{
    fixture();db.exec("INSERT INTO game_results(id,fixtureId,gameNumber,blueTeamId,orangeTeamId,blueScore,orangeScore) VALUES ('g','match',7,'t1','t0',0,9); INSERT INTO game_player_stats(id,gameResultId,playerId,goals,shots) VALUES ('s','g','p10',0,4)");
    const match=chirpMatchContext(db,'a','match')!;
    expect(match.facts.join(' ')).not.toMatch(/reverse sweep|came back/);expect(match.incidents).toEqual([]);
    const job={id:'reply',context:{author:'Fan',role:'Fan',draft:'',topic:'Matchday',matchContext:match}};
    expect(validChirpText('9–0 in the last saved game? painful viewing',job)).toBe(true);
    expect(validChirpText('4 open nets missed, seriously?',job)).toBe(false);
    expect(validChirpText('they got reverse swept lmao',job)).toBe(false);
    expect(validChirpText('5–0 in the deciding game? painful viewing',job)).toBe(false);
  });
  it('recognizes a game comeback and overtime only from a complete saved scoring sequence',()=>{
    fixture();db.exec("INSERT INTO game_results(id,fixtureId,gameNumber,blueTeamId,orangeTeamId,blueScore,orangeScore) VALUES ('comeback','match',1,'t1','t0',3,2)");
    for(const [i,score] of [[0,1],[0,2],[1,2],[2,2],[3,2]].entries())db.prepare('INSERT INTO game_incidents VALUES (?,?,?,?,?,?,?,?,?)').run('comeback',i,i<2?'p00':'p10',i<2?'t0':'t1','goal',5,i===4?1:0,1,JSON.stringify({score}));
    const context=chirpMatchContext(db,'a','match')!;
    expect(context.facts).toContain('Game 1: Team 1 recovered from a 2-goal deficit to win 3–2 against Team 0.');
    expect(context.facts).toContain('Team 1 won game 1 in overtime.');
    db.exec("DELETE FROM game_incidents WHERE gameResultId='comeback' AND sequence=1");
    expect(chirpMatchContext(db,'a','match')!.facts.join(' ')).not.toMatch(/goal deficit|overtime/);
  });
  it('backs up receipt reactions for a loss whose normal result report has already been processed',()=>{
    fixture();db.exec("UPDATE fixtures SET seriesFormat='BO3',homeScore=0,awayScore=2 WHERE id='match'");
    chirp.tick('a');
    // Legacy pre-series post can be present on load with no fixture association.
    const own=chirp.publish('a','Y\'all suck, easy win.');
    db.prepare('UPDATE chirp_posts SET date=?,position=0 WHERE id=?').run('2026-10-10',own.post.id);
    chirp.tick('a');expect(db.prepare('SELECT id FROM chirp_posts WHERE sourceKey=?').get('receipt:'+own.post.id)).toBeTruthy();
    const before=count();chirp.tick('a');expect(count()).toBe(before);
  });
  it('refreshes create new bounded conversations without regenerating on every passive poll',async()=>{
    chirp.tick('a');const before=count();
    vi.useFakeTimers();
    try{
      chirp.feed('a',{refresh:true},false);chirp.feed('a',{refresh:true},false);
      await vi.advanceTimersByTimeAsync(200);
      expect(count()).toBeGreaterThan(before);expect(count()-before).toBeLessThan(20);
      const after=count();chirp.feed('a',{},false);await vi.advanceTimersByTimeAsync(200);
      expect(count()).toBe(after);
      expect(db.prepare("SELECT COUNT(*) n FROM chirp_rivalries WHERE careerId='a'").get().n).toBeGreaterThan(0);
      const quotes=chirp.feed('a').posts.filter((p:any)=>p.quote);expect(quotes.length).toBeGreaterThan(0);
      expect(chirp.feed('a').posts.some((p:any)=>p.media)).toBe(true);
    }finally{chirp.close();vi.clearAllTimers();vi.useRealTimers();}
  });
  it('persists follows and reaction flags across reload with enriched profile suggestions',()=>{
    const first=chirp.feed('a').posts[0];chirp.react('a',first.id,'like');chirp.react('a',first.id,'repost');
    chirp.follow('a','rosterwire');
    const restored=new Chirp(adapter(new SQL.Database(raw.export())) as any);
    expect(restored.thread('a',first.id).post).toMatchObject({liked:true,reposted:true});
    expect(restored.profile('a','rosterwire').following).toBe(true);
    expect(chirp.profile('a','gibbs').bannerKind).toBe('official-banner');
    const suggestions=chirp.feed('a').suggestions;
    expect(suggestions.every((a:any)=>typeof a.following==='boolean'&&a.voice&&a.bannerKind)).toBe(true);
  });
  it('prioritizes manager replies and supplies distinct voices to AI jobs',async()=>{
    chirp.tick('a');
    const jobs:any[]=[];const text={generate:async(batch:any[])=>{jobs.push(...batch);return {};},close:()=>{}};
    const ai=new Chirp(db,text);const post=ai.publish('a','What should we work on next?');await ai.generateText('a');ai.close();
    expect(jobs).toHaveLength(4);
    expect(jobs.every(j=>j.context.thread==='What should we work on next?')).toBe(true);
    expect(new Set(jobs.map(j=>j.context.voice)).size).toBeGreaterThan(1);
    expect(chirp.thread('a',post.post.id).replies).toHaveLength(0);
    expect(ai.thread('a',post.post.id).preparing).toBe(8);
  });
  it('keeps varied drafts when the AI repeats the same reply across accounts',async()=>{
    chirp.tick('a');
    const text={generate:async(batch:any[])=>Object.fromEntries(batch.map(j=>[j.id,'bookmarked. see you after kickoff lol'])),close:()=>{}};
    const ai=new Chirp(db,text);ai.publish('a','Thoughts on our next series?');try{await ai.generateText('a');}finally{ai.close();chirp.close();}
    expect(db.prepare("SELECT COUNT(*) n FROM chirp_posts WHERE careerId='a' AND body='bookmarked. see you after kickoff lol'").get().n).toBe(1);
    expect(db.prepare("SELECT COUNT(*) n FROM chirp_text_jobs WHERE careerId='a' AND attempts=1 AND state='pending'").get().n).toBe(3);
  });
  it('publishes finalized AI replies once and never rewrites them on later polls or reload',async()=>{
    chirp.tick('a');let round=0;
    const variants=['the midfield gap is massive when the first challenge goes wrong','stop sending everyone into the corner at once 😭','passing lanes need support, not another car chasing the ball','let your last man collect pads before launching that aerial','i would review the recovery routes before blaming mechanics','a patient second player gives the attacker another option','back post positioning buys time for teammates to recover','the first touch matters because it decides who challenges next'];
    const text={generate:async(batch:any[])=>Object.fromEntries(batch.map(j=>[j.id,variants[round++%variants.length]])),close:()=>{}};
    const ai=new Chirp(db,text),own=ai.publish('a','How can we improve our rotations?');
    expect(ai.thread('a',own.post.id).replies).toHaveLength(0);
    expect(ai.notifications('a').filter((n:any)=>n.type==='reply')).toHaveLength(0);
    await ai.generateText('a');const first=ai.thread('a',own.post.id).replies;
    expect(first).toHaveLength(4);expect(first.every((p:any)=>p.textOrigin==='ai')).toBe(true);
    await ai.generateText('a');const later=ai.thread('a',own.post.id).replies;
    expect(later.slice(0,first.length).map((p:any)=>p.id)).toEqual(first.map((p:any)=>p.id));
    for(const p of first)expect(later.find((r:any)=>r.id===p.id).body).toBe(p.body);
    ai.close();
    const restored=new Chirp(adapter(new SQL.Database(raw.export())) as any,text);
    expect(restored.thread('a',own.post.id).replies.map((p:any)=>p.body)).toEqual(later.map((p:any)=>p.body));restored.close();
  });
  it('rejects near-identical phrasing, not just matching punctuation',()=>{
    expect(similarChirp('The talent is there but the rotations keep falling apart tonight.','the talent is there, but the rotations keep falling apart again 😭')).toBe(true);
    expect(similarChirp('That last-man challenge leaves the net exposed.','the pass was perfect, the defender just read it early')).toBe(false);
  });
  it('preserves already published legacy text and migrates direct parents without exposing private drafts',()=>{
    const own=chirp.publish('a','Original post'),child=chirp.thread('a',own.post.id).replies[0];
    const nested=chirp.publish('a','Reply to that specific comment',child.id);
    db.prepare('UPDATE chirp_posts SET parentId=? WHERE id=?').run(own.post.id,nested.post.id);
    db.prepare("UPDATE chirp_text_jobs SET state='pending' WHERE postId=?").run(child.id);
    const ai=new Chirp(db,{generate:async()=>({}),close:()=>{}}),fresh=ai.publish('a','Another post waiting for AI reactions');
    runMigration(db);
    expect(db.prepare('SELECT parentId FROM chirp_posts WHERE id=?').get(nested.post.id).parentId).toBe(child.id);
    expect(db.prepare('SELECT state FROM chirp_text_jobs WHERE postId=?').get(child.id).state).toBe('frozen');
    expect(ai.thread('a',fresh.post.id).replies).toHaveLength(0);expect(ai.thread('a',fresh.post.id).preparing).toBe(8);
    expect(chirp.thread('a',child.id).post.body).toBe(child.body);ai.close();
  });
  it('allows a reply to discuss an explicit parent incident without fabricating another one',()=>{
    const job={id:'reply',context:{author:'Fan',role:'Fan',draft:'',thread:'PlayerOne missed 4 open nets in game 2.',topic:'UnderPressure'}};
    expect(validChirpText('4 open nets? that finishing is painful 😭',job)).toBe(true);
    expect(validChirpText('7 open nets? that finishing is painful 😭',job)).toBe(false);
    expect(validChirpText('and another own goal, seriously?',job)).toBe(false);
  });
  it('opens a reply as the main post and keeps its branch separate from sibling replies',()=>{
    const own=chirp.publish('a','Which team has the best rotations?'),root=chirp.thread('a',own.post.id);
    const target=root.replies[0],sibling=root.replies[1];
    const reply=chirp.publish('a','That is the point I disagree with.',target.id);
    const branch=chirp.thread('a',target.id);
    expect(branch.post.id).toBe(target.id);expect(branch.ancestors.map((p:any)=>p.id)).toEqual([own.post.id]);
    expect(branch.replies.map((p:any)=>p.id)).toContain(reply.post.id);
    expect(branch.replies.map((p:any)=>p.id)).not.toContain(sibling.id);
    const deeper=chirp.thread('a',reply.post.id);expect(deeper.post.id).toBe(reply.post.id);
    expect(deeper.ancestors.map((p:any)=>p.id)).toEqual([own.post.id,target.id]);
    expect(chirp.thread('a',own.post.id).replies).toHaveLength(8);
  });
  it('creates topical discussions with opposing opinions and chained rebuttals on an older post',()=>{
    const root=chirp.feed('a').posts.find((p:any)=>p.replies===0);
    const ai=new Chirp(db,{generate:async()=>({}),close:()=>{}});
    const before=ai.thread('a',root.id);expect(before.post.id).toBe(root.id);expect(before.preparing).toBe(6);
    const jobs=db.prepare("SELECT j.context,p.id,p.parentId FROM chirp_text_jobs j JOIN chirp_posts p ON p.id=j.postId WHERE p.sourceKey LIKE ?").all('discussion:'+root.id+':%');
    expect(jobs).toHaveLength(8);
    expect(jobs.map((j:any)=>JSON.parse(j.context).intent).some((s:string)=>/Disagree/.test(s))).toBe(true);
    expect(jobs.filter((j:any)=>j.parentId!==root.id)).toHaveLength(2);
    ai.thread('a',root.id);expect(db.prepare("SELECT COUNT(*) n FROM chirp_posts WHERE sourceKey LIKE ?").get('discussion:'+root.id+':%').n).toBe(8);ai.close();
  });
  it('marks all emails only in one career while retaining pending decisions',()=>{
    db.exec("INSERT INTO inbox_items(id,careerId,title,isRead,actions) VALUES ('one','a','Offer',0,'[]'),('two','a','Report',0,'[]'),('other','b','Other',0,'[]')");
    expect(markAllInboxRead(db,'a')).toMatchObject({success:true,changed:2,unread:0});
    expect(db.prepare("SELECT isRead FROM inbox_items WHERE id='other'").get().isRead).toBe(0);
    expect(db.prepare("SELECT actions FROM inbox_items WHERE id='one'").get().actions).toBe('[]');
    expect(markAllInboxRead(db,'a').changed).toBe(0);
  });
  it('allows brief human replies while keeping rumours unconfirmed',()=>{
    const job={id:'reply',context:{author:'Fan',role:'Fan',draft:'lol',topic:'Community'}};
    expect(validChirpText('lol',job)).toBe(true);
    const rumor={id:'rumour',context:{author:'RosterWire',role:'Media',draft:'Speculation: a roster change might be coming.',topic:'RosterMoves'}};
    expect(validChirpText('Roster change confirmed.',rumor)).toBe(false);
    expect(validChirpText('might see a roster change. speculation for now.',rumor)).toBe(true);
  });
  it('defers social generation during gameplay and resumes pending work afterward',async()=>{
    const generated:any[]=[];const paused:boolean[]=[];
    const text={generate:async(jobs:any[])=>{generated.push(jobs);return {};},pause:(p:boolean)=>paused.push(p),close:()=>{}};
    const live=new Chirp(db,text);
    vi.useFakeTimers();
    try{
      live.setGameplayActive(true);
      live.tick('a');live.queueUpdates('a');await live.generateText('a');
      await vi.advanceTimersByTimeAsync(200);
      expect(count()).toBe(0);expect(generated).toHaveLength(0);expect(paused).toEqual([true]);
      live.setGameplayActive(false);
      await vi.advanceTimersByTimeAsync(200);
      expect(count()).toBeGreaterThan(0);expect(generated).toHaveLength(4);expect(generated.every(j=>j.length===1)).toBe(true);expect(paused).toEqual([true,false]);
    }finally{live.close();vi.clearAllTimers();vi.useRealTimers();}
  });
  it('seeds an established paginated world after asynchronous account setup',()=>{
    expect(chirp.feed('a',{},false).posts).toHaveLength(0);
    chirp.tick('a');
    const first=chirp.feed('a',{},false),second=chirp.feed('a',{cursor:first.cursor},false);
    expect(first.posts).toHaveLength(25);expect(second.posts).toHaveLength(25);
    expect(db.prepare("SELECT COUNT(*) n FROM chirp_days WHERE careerId='a'").get().n).toBe(3);
    chirp.close();
  });
  it('creates a varied world across all seven regions and never duplicates a refresh',()=>{
    const feed=chirp.feed('a');expect(feed.posts.length).toBe(25);expect(feed.cursor).toBeTruthy();
    expect(feed.regions).toHaveLength(7);const initial=count();chirp.feed('a');expect(count()).toBe(initial);
    const authors=db.prepare("SELECT DISTINCT a.region FROM chirp_posts p JOIN chirp_accounts a ON a.id=p.accountId AND a.careerId=p.careerId WHERE p.careerId='a' AND a.kind='Player'").all();expect(authors).toHaveLength(7);
    db.exec("UPDATE careers SET currentDate='2026-10-12' WHERE id='a'");chirp.tick('a');expect(count()).toBeGreaterThan(initial);const updated=count();chirp.tick('a');expect(count()).toBe(updated);
  });
  it('paginates without repeats, even when a new chirp arrives between pages',()=>{
    const first=chirp.feed('a');chirp.publish('a','A brand new update #ClubLife');const second=chirp.feed('a',{cursor:first.cursor});
    expect(second.posts).toHaveLength(25);expect(second.posts.some((p:any)=>first.posts.some((q:any)=>p.id===q.id))).toBe(false);
    expect(second.posts.some((p:any)=>p.body==='A brand new update #ClubLife')).toBe(false);
  });
  it('grows engagement on a new career day, once only, and keeps own players in the conversation',()=>{
    const first=chirp.feed('a'),own=first.posts.find((p:any)=>p.account.kind==='Player' && p.account.teamId==='t0');expect(own).toBeTruthy();
    const before=chirp.thread('a',own.id).post.likes;db.exec("UPDATE careers SET currentDate='2026-10-12' WHERE id='a'");chirp.tick('a');
    const after=chirp.thread('a',own.id).post.likes;expect(after).toBeGreaterThan(before);chirp.feed('a');expect(chirp.thread('a',own.id).post.likes).toBe(after);
  });
  it('uses the actual result, stats, and both sides of the discussion only once',()=>{
    fixture();db.exec("INSERT INTO game_results (id,fixtureId,gameNumber,blueTeamId,orangeTeamId,blueScore,orangeScore) VALUES ('game','match',1,'t0','t1',5,1); INSERT INTO game_player_stats (id,gameResultId,playerId,goals,assists,saves,shots) VALUES ('stats','game','p00',3,2,4,5)");
    chirp.tick('a');const result=db.prepare("SELECT * FROM chirp_posts WHERE careerId='a' AND sourceKey='result:match'").get();
    expect(result.body).toContain('Team 0 take the series 4–3');const thread=chirp.thread('a',result.id);
    expect(thread.replies.some((p:any)=>p.body.includes('3 goals, 2 assists and 4 saves'))).toBe(true);
    expect(thread.replies.some((p:any)=>p.account.id==='player:p10' && /Not the result|That hurts|Need to be better/.test(p.body))).toBe(true);
    expect(thread.replies.some((p:any)=>p.account.kind==='Former pro')).toBe(true);expect(thread.replies.some((p:any)=>p.account.kind==='Analyst')).toBe(true);
    const n=count();chirp.tick('a');expect(count()).toBe(n);
  });
  it('handles signings and renewals as distinct events',()=>{
    db.exec("INSERT INTO transfers(id,playerId,fromTeamId,toTeamId,fee,date,type) VALUES ('sign','p10','t1','t0',30000,'2026-10-11','signing'),('renew','p00','t0','t0',0,'2026-10-11','renewal')");chirp.tick('a');
    expect(db.prepare("SELECT body FROM chirp_posts WHERE sourceKey='transfer:sign'").get().body).toContain('joins Team 0');
    expect(db.prepare("SELECT body FROM chirp_posts WHERE sourceKey='transfer:renew'").get().body).toContain('renews with Team 0');
  });
  it('persists reversible likes, reposts and bookmarks without changing player morale',()=>{
    const p=chirp.feed('a').posts[0],before=db.prepare("SELECT morale FROM players WHERE id='p00'").get().morale;
    const liked=chirp.react('a',p.id,'like');expect(liked.post.likes).toBe(p.likes+1);expect(liked.post.liked).toBe(true);
    expect(chirp.react('a',p.id,'like').post.likes).toBe(p.likes);
    chirp.react('a',p.id,'repost');expect(chirp.profile('a','manager').postCount).toBe(0);expect(chirp.feed('a',{account:'manager'}).posts.some((q:any)=>q.id===p.id)).toBe(true);
    chirp.react('a',p.id,'bookmark');expect(chirp.feed('a',{mode:'bookmarks'}).posts).toHaveLength(1);
    const restored=new Chirp(adapter(new SQL.Database(raw.export())) as any);expect(restored.feed('a',{mode:'bookmarks'}).posts[0].id).toBe(p.id);
    chirp.react('a',p.id,'bookmark');expect(chirp.feed('a',{mode:'bookmarks'}).posts).toHaveLength(0);
    expect(db.prepare("SELECT morale FROM players WHERE id='p00'").get().morale).toBe(before);
  });
  it('keeps careers separate for feeds, profiles, threads, follows, actions and notifications',()=>{
    const p=chirp.feed('a').posts[0];chirp.feed('b');
    expect(()=>chirp.react('b',p.id,'like')).toThrow('not found');expect(()=>chirp.thread('b',p.id)).toThrow('not found');expect(()=>chirp.publish('b','Reply',p.id)).toThrow('not found');
    const a=chirp.publish('a','Only this career');expect(chirp.feed('b',{mode:'following'}).posts.some((q:any)=>q.id===a.post.id)).toBe(false);
    expect(chirp.notifications('a')).toHaveLength(12);expect(chirp.notifications('b')).toHaveLength(0);
    chirp.follow('a','gibbs');expect(chirp.profile('a','gibbs').following).toBe(false);expect(chirp.profile('b','gibbs').following).toBe(true);
  });
  it('lets the manager post and reply, receives named responses and reads notifications',()=>{
    const own=chirp.publish('a','Ready for the next series #ClubLife');const thread=chirp.thread('a',own.post.id);
    expect(thread.replies).toHaveLength(8);expect(new Set(thread.replies.map((p:any)=>p.account.id)).size).toBe(8);
    const reply=chirp.publish('a','Thank you for the support',thread.replies[0].id);expect(chirp.thread('a',own.post.id).replies).toHaveLength(8);
    expect(chirp.thread('a',reply.post.id).post.id).toBe(reply.post.id);
    expect(chirp.feed('a').unread).toBe(24);chirp.notifications('a',true);expect(chirp.feed('a').unread).toBe(0);
    expect(()=>chirp.publish('a',' ')).toThrow();expect(()=>chirp.publish('a','a'.repeat(501))).toThrow();expect(()=>chirp.react('a',own.post.id,'bad')).toThrow();
  });
  it('searches literal text and filters actual regions',()=>{
    chirp.publish('a','100% focused on improvement');expect(chirp.feed('a',{query:'100%'}).posts).toHaveLength(1);
    expect(chirp.feed('a',{query:'Player00'}).people.some((p:any)=>p.id==='player:p00')).toBe(true);
    const feed=chirp.feed('a',{region:'MENA'});expect(feed.posts.length).toBeGreaterThan(0);expect(feed.posts.every((p:any)=>p.account.region==='MENA')).toBe(true);
  });
  it('keeps the existing private support mechanic on own-player posts, once only',()=>{
    const manager=new CareerManagement(db);manager.post('a',db.prepare("SELECT * FROM players WHERE id='p00'").get(),'negative','The Rotation','Pressure on Player00.');
    chirp.tick('a');const post=db.prepare("SELECT * FROM chirp_posts WHERE careerId='a' AND legacyPostId IS NOT NULL").get();
    expect(chirp.thread('a',post.id).post.support.name).toBe('Player00');manager.respond('a',post.legacyPostId);
    expect(chirp.notifications('a').filter((n:any)=>n.type==='mention')).toHaveLength(1);
    expect(chirp.thread('a',post.id).post.support.responded).toBe(true);expect(()=>manager.respond('a',post.legacyPostId)).toThrow();
    manager.post('a',db.prepare("SELECT * FROM players WHERE id='p10'").get(),'negative','The Rotation','Other team criticism.');chirp.tick('a');
    expect(chirp.feed('a',{query:'Other team criticism'}).posts[0].support).toBe(null);
  });
});
