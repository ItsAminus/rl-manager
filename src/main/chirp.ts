import {regionalNewsOnly,regionalPostSql,regionSql} from './news-scope';
import {RecruitmentNetwork} from './recruitment-network';
import type { AppDatabase } from './database';
import { v4 as uuid } from 'uuid';
import { addDays, socialImpact } from '../game/career-rules';
import {careerWindow} from './transfer-calendar';
import type { ChirpTextGenerator } from './chirp-text';
import { officialProfile } from '../services/broadcast-assets';
import {ClubStudio} from './club-studio';
import { chirpVoice, fanResponse, similarChirp } from './chirp-personality';
import { chirpCover, chirpMedia } from '../services/chirp-assets';
import { chirpMatchContext } from './chirp-match-context';
import { chirpReceiptMedia } from '../services/chirp-assets';

// All speech is fictional, generated from the simulated career. No live social APIs.
const community = [
  ['esports', 'Rocket League Esports', 'RLEsports', 'Esports', 'Results, rosters and the road to the next trophy.', 'Global'],
  ['gibbs', 'Gibbs', 'Gibbs', 'Analyst', 'Breaking down the decisions behind the scoreboard.', 'North America'],
  ['johnny', 'Johnnyboi_i', 'Johnnyboi_i', 'Analyst', 'Challenges, space and the details that decide a series.', 'Europe'],
  ['sunless', 'SunlessKhan', 'SunlessKhan', 'Creator', 'Rocket League stories. Occasionally a sensible take.', 'North America'],
  ['rizzo', 'Rizzo', 'Rizzo', 'Former pro', 'Watching the games. Talking about the games.', 'North America'],
  ['rosterwire', 'RosterWire', 'RosterWire', 'Media', 'The transfer desk for your career world.', 'Global'],
  ['rotation', 'The Rotation', 'TheRotation', 'Media', 'Match reactions and uncomfortable questions.', 'Global'],
  ['highlights', 'RL Highlights', 'RLHighlights', 'Media', 'The players making a difference.', 'Global'],
];
const regions = ['Europe', 'North America', 'South America', 'Oceania', 'MENA', 'Asia-Pacific', 'Sub-Saharan Africa'];
const hash = (s: string) => { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };
const choose = <T,>(list: T[], seed: string): T => list[hash(seed) % list.length];
const slug = (s: string) => s.replace(/[^a-zA-Z0-9_]/g, '').slice(0, 22) || 'player';
const topicFor = (region: string) => ({ Europe: 'EU', 'North America': 'NA', 'South America': 'SAM', Oceania: 'OCE', MENA: 'MENA', 'Middle East & North Africa': 'MENA', 'Asia-Pacific': 'APAC', 'Sub-Saharan Africa': 'SSA' }[region] || 'RL');
const colors = ['#6ee7c5', '#91b7ff', '#f4b878', '#c5a4ff', '#f58ca6'];
const fanActors = regions.flatMap(r => [0,1,2,3,4,5].map(i => `fan:${topicFor(r)}:${i}`));

export class Chirp {
  private queued = new Set<string>();
  private generating = false;
  private closed = false;
  private gameplayActive = false;
  private deferred = new Set<string>();
  private refreshing = new Set<string>();
  private textQueue=new Set<string>();
  private visible(alias='p'){return `EXISTS(SELECT 1 FROM chirp_publications publication WHERE publication.postId=${alias}.id AND publication.careerId=${alias}.careerId AND publication.published=1)`;}
  private direct(alias='p'){return `${alias}.parentId`;}
  constructor(private db: AppDatabase, private text?: ChirpTextGenerator) {}
  close() { this.closed = true;this.textQueue.clear(); this.text?.close(); }
  setGameplayActive(active:boolean) {
    this.gameplayActive=active;
    this.text?.pause?.(active);
    if(!active){const ids=[...this.deferred];this.deferred.clear();for(const id of ids)this.queueUpdates(id);}
  }
  queueUpdates(id: string) {
    if(this.gameplayActive){this.deferred.add(id);return;}
    if (this.closed || this.queued.has(id)) return;
    this.queued.add(id);
    const timer = setTimeout(() => {
      this.queued.delete(id);
      if (this.closed) return;
      if(this.gameplayActive){this.deferred.add(id);return;}
      try {
        this.tick(id);
        if(this.text && this.db.prepare("SELECT COUNT(*) n FROM chirp_text_jobs WHERE careerId=? AND state='pending'").get(id).n<160)this.db.transaction(()=>{const c=this.career(id);for(const p of this.db.prepare(`SELECT p.* FROM chirp_posts p WHERE p.careerId=? AND p.parentId IS NULL AND p.accountId<>'manager' AND ${this.visible()}
          AND (SELECT COUNT(*) FROM chirp_posts r WHERE r.careerId=p.careerId AND r.parentId=p.id)<4
          AND NOT EXISTS(SELECT 1 FROM chirp_posts r WHERE r.careerId=p.careerId AND r.sourceKey='discussion:'||p.id||':0') ORDER BY p.date DESC,p.position DESC LIMIT 4`).all(id))this.discussion(c,p,40);})();
        void this.generateText(id);
      } catch (error) { console.warn('[Chirp]', error); }
    }, 100);
    timer.unref?.();
  }
  async generateText(id: string) {
    if(this.gameplayActive){this.deferred.add(id);return;}
    if(!this.text||this.closed)return;
    if(this.generating){this.textQueue.add(id);return;}
    this.textQueue.delete(id);
    this.generating = true;
    let jobs:any[]=[];
    try {
      jobs = this.db.prepare(`SELECT j.*,p.body,p.accountId,p.parentId,p.fixtureId,m.replyToId,m.quoteId FROM chirp_text_jobs j JOIN chirp_posts p ON p.id=j.postId JOIN chirp_publications publication ON publication.postId=p.id LEFT JOIN chirp_post_meta m ON m.postId=p.id AND m.careerId=p.careerId
        WHERE j.careerId=? AND j.state='pending' AND j.attempts<3 AND publication.published=0
        AND (COALESCE(m.replyToId,p.parentId,m.quoteId) IS NULL OR EXISTS(SELECT 1 FROM chirp_publications target WHERE target.postId=COALESCE(m.replyToId,p.parentId,m.quoteId) AND target.careerId=j.careerId AND target.published=1))
        ORDER BY COALESCE(m.priority,0) DESC,p.date DESC,p.position DESC LIMIT 4`).all(id);
      if (!jobs.length) return;
      // Publish one completed response at a time; don't hide it behind the
      // rest of a slow batch. Replies to the manager have highest priority.
      for (const j of jobs) {
        if(this.closed || this.gameplayActive)break;
        const context=JSON.parse(j.context),targetId=j.replyToId||j.parentId||j.quoteId;
        context.managerClub=this.career(id).clubName;
        if(targetId){
          const target=this.requirePost(id,targetId);context.thread=target.body;
          context.conversation=this.ancestors(id,target).slice(-3).map(p=>({author:this.accountData(id,p.accountId).displayName,body:p.body}));
        }
        // Refresh at generation time: an old pregame post may now have a result.
        const target=targetId?this.requirePost(id,targetId):null;
        const fixture=j.fixtureId||target?.fixtureId||(target?this.ancestors(id,target).reverse().find(p=>p.fixtureId)?.fixtureId:null);
        if(fixture)context.matchContext=chirpMatchContext(this.db,id,fixture);
        context.avoid=this.db.prepare(`SELECT p.body FROM chirp_posts p WHERE p.careerId=? AND ${this.visible()} ORDER BY CASE WHEN p.accountId=? THEN 0 ELSE 1 END,p.date DESC,p.position DESC LIMIT 6`).all(id,j.accountId).map(p=>p.body.slice(0,180));
        const generated = await this.text.generate([{ id: j.postId, context }]);
        if(this.closed || this.gameplayActive)break;
        this.db.transaction(() => {
          const body = generated[j.postId];
          const recent=this.db.prepare(`SELECT p.body FROM chirp_posts p WHERE p.careerId=? AND p.id<>? AND ${this.visible()} ORDER BY p.date DESC,p.position DESC LIMIT 100`).all(id,j.postId);
          const duplicate=body && (this.db.prepare('SELECT id FROM chirp_posts WHERE careerId=? AND id<>? AND body=? COLLATE NOCASE LIMIT 1').get(id,j.postId,body)||recent.some(p=>similarChirp(body,p.body)));
          if (body && !duplicate) {
            this.db.prepare('UPDATE chirp_posts SET body=? WHERE id=? AND careerId=?').run(body,j.postId,id);
            this.db.prepare("UPDATE chirp_text_jobs SET state='done',attempts=attempts+1,error=NULL,generatedAt=? WHERE postId=?").run(new Date().toISOString(),j.postId);
            this.db.prepare('UPDATE chirp_publications SET published=1,publishedAt=? WHERE postId=? AND careerId=?').run(new Date().toISOString(),j.postId,id);
            this.db.prepare('INSERT OR IGNORE INTO chirp_publication_order(postId,careerId) VALUES (?,?)').run(j.postId,id);
            if(!j.parentId && !j.quoteId)this.discussion(this.career(id),this.requirePost(id,j.postId),55);
            const priority=this.db.prepare('SELECT priority FROM chirp_post_meta WHERE postId=?').get(j.postId)?.priority||0;
            this.db.prepare('UPDATE chirp_post_meta SET priority=MAX(priority,?) WHERE careerId=? AND replyToId=?').run(Math.max(40,priority-1),id,j.postId);
          } else this.failedJob(id,j.postId,'Generated text did not pass quality checks');
        })();
      }
    } catch (error: any) {
      // Keep readable drafts and retry later; UI operations never await the model.
      if(!this.gameplayActive)console.warn('[Chirp] Local text generation:',error.message);
      if(!this.gameplayActive && !this.closed)this.db.transaction(()=>{for(const j of jobs)this.failedJob(id,j.postId,error.message);})();
    } finally {
      this.generating = false;
      const next=this.textQueue.values().next().value||(jobs.length?id:undefined);
      if (!this.closed && this.text && next) {
        const timer=setTimeout(() => void this.generateText(next), 500);timer.unref?.();
      }
    }
  }
  private failedJob(id:string,post:string,error:string){
    this.db.prepare("UPDATE chirp_text_jobs SET attempts=attempts+1,state=CASE WHEN attempts>=2 THEN 'fallback' ELSE 'pending' END,error=? WHERE postId=? AND careerId=? AND state='pending'").run(error,post,id);
    // A rejected AI draft stays private. Publishing it would reintroduce the
    // canned replies the player is trying to avoid.
  }
  private ancestors(id:string,p:any){
    const parents:any[]=[],seen=new Set([p.id]);let target=this.db.prepare('SELECT replyToId FROM chirp_post_meta WHERE postId=?').get(p.id)?.replyToId||p.parentId;
    while(target && parents.length<32 && !seen.has(target)){
      seen.add(target);const parent=this.requirePost(id,target);parents.unshift(parent);
      target=this.db.prepare('SELECT replyToId FROM chirp_post_meta WHERE postId=?').get(parent.id)?.replyToId||parent.parentId;
    }
    return parents;
  }
  private career(id: string): any {
    if(this.db.prepare('SELECT mode FROM career_modes WHERE careerId=?').get(id)?.mode==='Path To Glory')throw Error('Chirp is unavailable in Path To Glory.');
    const c = this.db.prepare('SELECT c.*, t.name AS clubName FROM careers c LEFT JOIN teams t ON t.id=c.teamId WHERE c.id=?').get(id);
    if (!c) throw new Error('Career not found.');
    return c;
  }
  private account(c: string, id: string, name: string, kind: string, region: string, bio: string, player: string | null = null, team: string | null = null, followers = 1000, handle?: string) {
    this.db.prepare('INSERT OR IGNORE INTO chirp_accounts (careerId,id,displayName,handle,kind,bio,region,playerId,teamId,verified,followers,color) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)')
      .run(c, id, name, handle || slug(name) + (kind === 'Player' ? '_' + hash(id).toString(36).slice(0, 4) : ''), kind, bio, region, player, team, ['Player', 'Club', 'Fan', 'Manager'].includes(kind) ? +(followers > 20000 && kind !== 'Fan') : 1, followers, choose(colors, id));
  }
  private initialize(c: any) {
    const initialized=!!this.db.prepare('SELECT id FROM chirp_accounts WHERE careerId=? AND id=?').get(c.id,'manager');
    if(initialized && this.db.prepare('SELECT id FROM chirp_accounts WHERE careerId=? AND id=?').get(c.id,'fan:EU:5'))return;
    if(!initialized){
    for (const [id, name, handle, kind, bio, region] of community) this.account(c.id, id, name, kind, region, bio, null, null, 90000 + hash(id) % 600000, handle);
    for (const p of this.db.prepare('SELECT p.*,t.name AS club FROM players p LEFT JOIN teams t ON t.id=p.teamId').all()) {
      this.account(c.id, 'player:' + p.id, p.gamertag, 'Player', p.region || 'Global', 'Rocket League player · ' + (p.club || 'Free agent'), p.id, p.teamId || null, Math.round(Math.max(120, Math.pow(Math.max(0, p.overall - 50), 2) * 75)));
    }
    for (const t of this.db.prepare('SELECT * FROM teams').all()) this.account(c.id, 'team:' + t.id, t.name, 'Club', t.region || 'Global', 'The team account for ' + t.name + '.', null, t.id, Math.max(300, (t.reputation || 30) * 1400), slug(t.shortName || t.name) + '_' + hash(t.id).toString(36).slice(0, 3));
    }
    for (const r of regions) for (let i = 0; i < 6; i++) this.account(c.id, `fan:${topicFor(r)}:${i}`, [topicFor(r) + ' On The Wall', 'Boost Watch ' + topicFor(r), 'Backpost ' + topicFor(r),'Zero Boost '+topicFor(r),'Overtime Enjoyer '+topicFor(r),'Fraud Watch '+topicFor(r)][i], 'Fan', r,
      ['here for the games. backing the boys through the ugly ones too.','rival fans in my mentions again. lovely.','replays, memes and extremely questionable takes.','one more ranked game. famous last words.','if it goes to overtime i am not breathing.','great mechanics. shame about the decisions.'][i], null, null, 900 + hash(r + i) % 6000);
    if(initialized)return;
    this.account(c.id, 'manager', c.managerName, 'Manager', c.region, 'Manager of ' + c.clubName + '. This is our story.', null, c.teamId, 850, slug(c.managerName) + '_coach');
    for (const id of ['esports', 'gibbs', 'johnny', 'sunless', 'rizzo', 'team:' + c.teamId, ...this.db.prepare('SELECT id FROM players WHERE teamId=?').all(c.teamId).map(p => 'player:' + p.id)]) this.db.prepare('INSERT OR IGNORE INTO chirp_follows VALUES (?,?)').run(c.id, id);
  }
  private insert(c: any, account: string, body: string, topic: string, key: string, options: { date?: string; parent?: string; fixture?: string; legacy?: string; quiet?: boolean; quote?:string;replyTo?:string;tone?:string;priority?:number;media?:any;intent?:string } = {}): string {
    const old = this.db.prepare('SELECT id FROM chirp_posts WHERE careerId=? AND sourceKey=?').get(c.id, key);
    if (old) return old.id;
    const id = uuid(), date = options.date || c.currentDate;
    const related=options.replyTo||options.parent||options.quote;
    const fixture=options.fixture||(related?this.requirePost(c.id,related).fixtureId:null);
    const position = (this.db.prepare('SELECT MAX(position) AS n FROM chirp_posts WHERE careerId=? AND date=?').get(c.id, date)?.n || 0) + 1;
    const followers = this.db.prepare('SELECT followers FROM chirp_accounts WHERE careerId=? AND id=?').get(c.id, account)?.followers || 1000;
    const popularity = account === 'manager' ? 0 : Math.max(3, Math.round(followers * (0.008 + (hash(key) % 32) / 1000)));
    this.db.prepare('INSERT INTO chirp_posts (id,careerId,accountId,date,position,body,topic,parentId,fixtureId,legacyPostId,sourceKey,baseLikes,baseReposts,views) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
      .run(id, c.id, account, date, position, body, topic, options.replyTo || options.parent || null, fixture || null, options.legacy || null, key, popularity, Math.floor(popularity / 6), popularity * 32 + 81);
    const published=account==='manager'||!this.text;
    this.db.prepare('INSERT INTO chirp_publications(postId,careerId,published,publishedAt) VALUES (?,?,?,?)').run(id,c.id,+published,published?new Date().toISOString():null);
    if(published)this.db.prepare('INSERT INTO chirp_publication_order(postId,careerId) VALUES (?,?)').run(id,c.id);
    this.db.prepare('INSERT INTO chirp_post_meta(postId,careerId,quoteId,replyToId,tone,priority,media) VALUES (?,?,?,?,?,?,?)')
      .run(id,c.id,options.quote||null,options.replyTo||null,options.tone||null,options.priority||0,options.media?JSON.stringify(options.media):null);
    if (account !== 'manager') {
      const author = this.db.prepare('SELECT id,displayName,kind,teamId FROM chirp_accounts WHERE careerId=? AND id=?').get(c.id,account);
      const parent = options.replyTo || options.quote || options.parent;
      const context = parent ? this.db.prepare('SELECT body FROM chirp_posts WHERE id=? AND careerId=?').get(parent,c.id)?.body : null;
      this.db.prepare('INSERT OR IGNORE INTO chirp_text_jobs(postId,careerId,context,state) VALUES (?,?,?,?)').run(id,c.id,JSON.stringify({author:author?.displayName,role:author?.kind,draft:options.intent?'':body,intent:options.intent,thread:context,topic,voice:chirpVoice(author),tone:options.tone||'match the opinion in the draft',matchContext:fixture?chirpMatchContext(this.db,c.id,fixture):undefined}),published?'frozen':'pending');
    }
    if (!options.quiet && account !== 'manager') {
      const actors = ['rizzo', 'sunless', 'johnny', 'gibbs', 'esports', ...fanActors].filter(a => a !== account);
      for (let i = 0; i < 3; i++) {
        const actor = choose(actors, key + i);
        this.db.prepare('INSERT OR IGNORE INTO chirp_reactions VALUES (?,?,?,?,?)').run(c.id, id, actor, i === 2 ? 'repost' : 'like', date);
      }
    }
    return id;
  }
  private reply(c: any, parent: string, author: string, text: string, key: string) {
    return this.insert(c, author, text, '', key, { parent });
  }
  private discussion(c:any,p:any,priority=110){
    if(p.accountId==='manager')return;
    const count=this.db.prepare(`SELECT COUNT(*) n FROM chirp_posts reply WHERE reply.careerId=? AND ${this.direct('reply')}=?`).get(c.id,p.id).n;
    if(count>=4 || this.db.prepare('SELECT id FROM chirp_posts WHERE careerId=? AND sourceKey=?').get(c.id,'discussion:'+p.id+':0'))return;
    const nested=!!p.parentId,actors=[...fanActors].filter(a=>a!==p.accountId).sort((a,b)=>hash(p.id+a)-hash(p.id+b)).slice(0,nested?3:6);
    const excerpt=p.body.slice(0,180),stances=[
      'Agree with the specific point in the post, and give your own reason. Do not simply say good work.',
      'Disagree with one specific point in the post. Explain why, in blunt casual sports-fan language.',
      'Make a dry joke about the specific subject of this post; avoid unrelated generic jokes.',
      'Challenge the previous assumption. Ask a pointed question about this exact subject.',
      'Defend the player or team being discussed from an unfair pile-on, while acknowledging the point.',
      'Offer a different opinion on the subject. Do not invent events or statistics.',
    ];
    for(let i=0;i<actors.length;i++){
      const stance=stances[i],key='discussion:'+p.id+':'+i;
      const response=this.insert(c,actors[i],`Opinion on "${excerpt}": ${stance}`,p.topic,key,{parent:p.id,replyTo:p.id,priority,tone:stance,intent:stance,date:p.date});
      if(!nested && i===1){
        const counter=this.insert(c,actors[0],`Push back on the disagreement about "${excerpt}".`,p.topic,key+':counter',{parent:response,replyTo:response,priority:priority-2,tone:'defend your opinion, casual, a little annoyed',intent:'Disagree with their reasoning. Defend the original post, referring to a specific claim they made.',date:p.date});
        this.insert(c,actors[i],`Answer the counterargument about "${excerpt}".`,p.topic,key+':answer',{parent:counter,replyTo:counter,priority:priority-3,tone:'skeptical fan continuing an argument; no generic agreement',intent:'Answer their counterargument. Maintain your skeptical opinion but acknowledge any fair point.',date:p.date});
      }
    }
  }
  private quote(c:any,quoted:string,author:string,body:string,key:string,tone='competitive banter'){
    this.requirePost(c.id,quoted);
    this.db.prepare('INSERT OR IGNORE INTO chirp_reactions VALUES (?,?,?,?,?)').run(c.id,quoted,author,'repost',c.currentDate);
    return this.insert(c,author,body,'Debate',key,{quote:quoted,tone,priority:70});
  }
  private conversationBatch(c:any,key:string,date=c.currentDate){
    const teams=this.db.prepare('SELECT * FROM teams ORDER BY CASE WHEN id=? THEN 0 WHEN region=? THEN 1 ELSE 2 END,reputation DESC LIMIT 20').all(c.teamId,c.region);
    if(teams.length<2)return;
    const a=hash(key)%3?teams[0]:teams[hash(key)%Math.min(6,teams.length)];
    const existing=this.db.prepare('SELECT teamA,teamB FROM chirp_rivalries WHERE careerId=? AND (teamA=? OR teamB=?) ORDER BY intensity DESC,lastDate DESC LIMIT 1').get(c.id,a.id,a.id);
    const prior=existing?teams.find(t=>t.id===(existing.teamA===a.id?existing.teamB:existing.teamA)):null;
    const b=prior||choose(teams.filter(t=>t.id!==a.id),key+':rival');
    const pair=[a.id,b.id].sort();
    this.db.prepare('INSERT OR IGNORE INTO chirp_rivalries(careerId,teamA,teamB,intensity,lastDate) VALUES (?,?,?,0,?)').run(c.id,...pair,date);
    this.db.prepare('UPDATE chirp_rivalries SET intensity=MIN(100,intensity+1),lastDate=? WHERE careerId=? AND teamA=? AND teamB=?').run(date,c.id,...pair);
    const topic='Rivalries';
    const boast=choose([`${a.name} fans, who do you want next? I'd take ${b.name}. Let's settle it in the server.`,`${b.name} catching strays in the replies. We like our chances. See you on match day.`,`${a.name} vs ${b.name}. Keep the receipts. No excuses after kickoff.`],key);
    const root=this.insert(c,'team:'+a.id,boast,topic,key+':rivalry',{date,tone:'confident sports rivalry banter',priority:50,media:chirpMedia('rivalry',key)});
    const answer=this.insert(c,'team:'+b.id,choose(['posting this much before the game is a bold strategy. see you there.','noted. hope the confidence comes with a clean rotation.','keep that same energy after the series. GG in advance.'],key+':answer'),topic,key+':answer',{date,parent:root,replyTo:root,tone:'rival club admin; playful pushback',priority:50});
    this.insert(c,'rizzo','the social admins have started the series before the players have even loaded in 💀','',key+':joke',{date,parent:root,replyTo:answer,priority:45});
    this.quote(c,root,`fan:${topicFor(c.region)}:5`,`${a.name} vs ${b.name}. ${choose(['bookmarking this. the post-game replies are going to be incredible.','the social admin has more confidence than i have boost.','please keep this same energy after kickoff.','this is why i never close the timeline on match day.'],key+':quote')}`,key+':quote');
    if(careerWindow(this.db,c.id,date).open){
    const listing=this.db.prepare('SELECT p.gamertag,t.name AS club FROM transfer_listings l JOIN players p ON p.id=l.playerId LEFT JOIN teams t ON t.id=p.teamId WHERE l.careerId=? ORDER BY l.listedDate DESC LIMIT 1').get(c.id);
    const free=this.db.prepare('SELECT gamertag FROM players WHERE teamId IS NULL ORDER BY overall DESC LIMIT 1').get();
    const rumour=listing?`${listing.gamertag} is transfer-listed at ${listing.club}. Speculation: ${b.name} could be a fit. No agreement has been confirmed.`
      :free?`Roster speculation: where would ${free.gamertag} fit? A free agent on the market, not a confirmed signing. ${b.name} fans, would you take the chance?`
      :`Roster wishlist, not a report: what role would ${a.name} need to improve before making a move? Changing names isn't always the answer.`;
    const transfer=this.insert(c,'rosterwire',rumour,'RosterMoves',key+':rumour',{date,tone:'transfer discussion; preserve speculation wording',priority:55,media:chirpMedia('transfer',key)});
    this.insert(c,`fan:${topicFor(c.region)}:0`,'please do not rebuild the entire roster because of one bad series 😭','',key+':loyal',{date,parent:transfer,priority:45});
    this.insert(c,'johnny','Who takes the second challenge in that lineup? A name is only an upgrade if the roles work together.','',key+':fit',{date,parent:transfer,priority:45});
    this.insert(c,`fan:${topicFor(c.region)}:3`,'transfer window timeline is undefeated. everybody is a scout now.','',key+':meme',{date,media:chirpMedia('meme',key)});
    }
    const player=this.db.prepare('SELECT * FROM players WHERE teamId=? ORDER BY overall DESC LIMIT 1').get(a.id);
    if(player)this.insert(c,'player:'+player.id,choose(['just opened the timeline. apparently we need a new roster every time someone misses a touch.','less tweeting, more ranked. see you in the server.','the rivalry posts are funny but we still have to actually play the game.'],key+':player'),'Community',key+':player',{date,priority:35});
  }
  private queueRefresh(id:string){
    if(this.gameplayActive){this.deferred.add(id);return;}
    if(this.closed||this.refreshing.has(id))return;
    this.refreshing.add(id);
    const timer=setTimeout(()=>{
      this.refreshing.delete(id);if(this.closed)return;
      if(this.gameplayActive){this.deferred.add(id);return;}
      this.tick(id);
      this.db.transaction(()=>{
        const state=this.db.prepare('SELECT * FROM chirp_world_state WHERE careerId=?').get(id);
        // Ignore accidental double clicks, not deliberate later refreshes.
        if(state && Date.now()-state.refreshedAt<2000)return;
        const batch=(state?.batch||0)+1,c=this.career(id);
        this.db.prepare('INSERT OR REPLACE INTO chirp_world_state VALUES (?,?,?)').run(id,batch,Date.now());
        this.conversationBatch(c,`refresh:${c.currentDate}:${batch}`);
      })();
      void this.generateText(id);
    },100);timer.unref?.();
  }
  private daily(c: any, date: string) {
    if (this.db.prepare('SELECT date FROM chirp_days WHERE careerId=? AND date=?').get(c.id, date)) return;
    this.db.prepare('UPDATE chirp_posts SET baseLikes=baseLikes+MAX(1,CAST(baseLikes*.08 AS INTEGER)),baseReposts=baseReposts+CAST(baseReposts*.06 AS INTEGER),views=views+MAX(20,CAST(views*.12 AS INTEGER)) WHERE careerId=? AND date<? AND date>=?')
      .run(c.id, date, addDays(date,-3));
    for (const p of this.db.prepare('SELECT id,accountId FROM chirp_posts WHERE careerId=? AND parentId IS NULL AND date<? AND date>=? ORDER BY date DESC,position DESC LIMIT 12').all(c.id,date,addDays(date,-3))) {
      const actor=choose(['gibbs','johnny','rizzo','sunless'],date+p.id),type=hash(date+p.id)%4===0?'repost':'like';
      if(actor!==p.accountId)this.db.prepare('INSERT OR IGNORE INTO chirp_reactions VALUES (?,?,?,?,?)').run(c.id,p.id,actor,type,date);
    }
    const players = this.db.prepare('SELECT p.*, t.name AS club FROM players p JOIN teams t ON t.id=p.teamId ORDER BY p.id').all();
    // Include database region spellings as well as the seven canonical regions.
    for (const region of [...new Set(players.map(p => p.region).filter(Boolean))] as string[]) {
      const pool = players.filter(p => p.region === region);
      const offset = hash(c.id + date + region) % pool.length;
      for (let i = 0; i < Math.min(3, pool.length); i++) {
        const p = pool[(offset + i * 13) % pool.length], topic = topicFor(region), key = `day:${date}:${p.id}:${i}`;
        const lines = [
          `Back in the server with ${p.club}. One good session at a time. #${topic}`,
          `The small pads matter more than you think. Trying to keep the next rotation clean. #${topic}`,
          `Favourite part of playing with ${p.club}? Finding that extra pass when everyone expects a shot.`,
          `Working on recoveries today. The play after the play is where you can steal time. #${topic}`,
          `Anyone else watch their own replays and wonder what they were thinking? Back to work.`,
          `Would you rather defend a double tap or a perfectly timed bump? Asking for my back post. #${topic}`,
          `More time in the server, less time staring at the scoreboard. Trusting the work with ${p.club}.`,
          `You can have all the boost in the world. Still need someone covering behind the challenge. #${topic}`,
          `One clean first touch changes the whole attack. That is the focus today.`,
          `Supporting ${p.club} this season? We appreciate you. Still plenty to work on. #${topic}`,
          `Best feeling: your teammate already knows where the pass is going. #${topic}`,
          `Last-man decisions. Boring to practise until they save your game.`,
        ];
        let body = choose(lines, key);
        if (p.form >= 75) body = `Feeling sharp right now. Want to carry that into the next series with ${p.club}. #${topic}`;
        else if (p.morale < 45) body = `Tough stretch. Taking a step back, reviewing the mistakes and going again with ${p.club}. #${topic}`;
        // Avoid identical messages from the same person on consecutive days.
        if (this.db.prepare('SELECT id FROM chirp_posts WHERE careerId=? AND accountId=? AND body=? AND date>=?').get(c.id, 'player:' + p.id, body, addDays(date, -7))) body = lines[(hash(key) + 5) % lines.length];
        const portrait=officialProfile({id:'player:'+p.id,playerId:p.id,kind:'Player',displayName:p.gamertag,teamId:p.teamId});
        const photo=portrait.avatarUrl?{url:portrait.avatarUrl,source:portrait.avatarSource,caption:`${p.gamertag} · player portrait`,kind:'portrait'}:undefined;
        const post = this.insert(c, 'player:' + p.id, body, topic, key, { date,media:i===1?photo:undefined });
        if (i === 0) {
          const teammate = pool.find(t => t.teamId === p.teamId && t.id !== p.id);
          this.insert(c, teammate ? 'player:' + teammate.id : 'rizzo', choose(['Keep at it. The next touch is the one that matters.', 'The recovery is half the challenge. So easy to forget.', 'Big fan of a pass that takes two defenders out of the play.', 'More of this. Trust the second man.'], key + ':reply'), '', key + ':reply', { date, parent: post });
        }
      }
    }
    const tactical = [
      'Watch the third player, not just the ball. Their distance from the challenge tells you whether the attack can survive a bad touch.',
      'A forced clear is only a win if someone can collect it. Pressure without a follow-up just resets the defence.',
      'An early challenge is a question: does the attacker have a second option? Teammates showing for the pass make that question much harder.',
      'Possession is not the same as control. If every touch is going straight back to the opposition, the rotation needs an outlet.',
      'The best boost routes leave you useful to your teammate. A hundred boost on the wrong side of the play is not much help.',
      'Double commits are often an information problem. Watch who can see the whole play before blaming the mechanics.',
      'A demo that opens the net has a purpose. Chasing a demo while your last player defends a two-on-one has a cost.',
      'Low boost does not always mean panic. A soft touch and a route through small pads can buy the team another rotation.',
    ];
    for (const author of ['gibbs', 'johnny']) this.insert(c, author, choose(tactical, date + author), 'Analysis', `day:${date}:${author}`, { date });
    this.insert(c, 'sunless', choose(['Rocket League is a game where you can spend three hours practising a mechanic and then miss an open net. Beautiful sport.', 'The most underrated mechanic is telling your teammate they made a good play.', 'Hot take: a calm last player is more exciting than another unnecessary double commit.', 'Who in your region deserves more attention this season? Give me the names.'], date), 'Community', `day:${date}:creator`, { date });
    const upcoming = this.db.prepare("SELECT f.*,ht.name AS home,at.name AS away FROM fixtures f JOIN career_competitions cc ON cc.competitionId=f.competitionId JOIN teams ht ON ht.id=f.homeTeamId JOIN teams at ON at.id=f.awayTeamId WHERE cc.careerId=? AND f.status='scheduled' AND f.scheduledDate>=? ORDER BY f.scheduledDate,f.id LIMIT 1").get(c.id, date);
    if (upcoming) this.insert(c, 'esports', `On the schedule: ${upcoming.home} vs ${upcoming.away}. ${upcoming.seriesFormat} · ${upcoming.scheduledDate}. Who takes it?`, 'Matchday', `day:${date}:schedule`, { date });
    const own = players.filter(p=>p.teamId===c.teamId);
    if(own.length){
      const p=choose(own,date+c.id),key=`day:${date}:club-player`;
      const mood=p.morale<45?'Been a difficult stretch. Resetting with the team and keeping the work honest.':p.form>=75?'Feeling good about my game. The challenge is bringing that same focus to the next series.':choose(['The practice server is where the next result starts. Glad to be putting the hours in with this roster.','Working on giving each other better options. One extra pass can change everything.','Appreciate everyone backing the team. Want to give you something to celebrate in the next series.'],key);
      const post=this.insert(c,'player:'+p.id,`${mood} #ClubLife`, 'ClubLife',key,{date});
      this.insert(c,'fan:'+topicFor(c.region)+':1',choose(['Backing the team. Show us the response on match day.','Want to see the rotations connect. The talent is there.','Keep working. Looking forward to the next series.'],key),'',key+':fan',{date,parent:post});
    }
    this.db.prepare('INSERT INTO chirp_days VALUES (?,?)').run(c.id, date);
    this.conversationBatch(c,'conversation:'+date,date);
  }
  private events(c: any) {
    const games=this.db.prepare("SELECT g.*,f.scheduledDate,bt.name AS blueName,ot.name AS orangeName FROM game_results g JOIN fixtures f ON f.id=g.fixtureId JOIN career_competitions cc ON cc.competitionId=f.competitionId JOIN teams bt ON bt.id=g.blueTeamId JOIN teams ot ON ot.id=g.orangeTeamId WHERE cc.careerId=? AND f.scheduledDate>=? AND f.scheduledDate<=? AND NOT EXISTS(SELECT 1 FROM chirp_posts cp WHERE cp.careerId=? AND cp.sourceKey='game:'||g.id) ORDER BY f.scheduledDate DESC,g.gameNumber DESC LIMIT 6").all(c.id,addDays(c.currentDate,-7),c.currentDate,c.id);
    for(const g of games){
      const key='game:'+g.id,winner=g.blueScore>g.orangeScore?g.blueName:g.orangeName;
      const root=this.insert(c,'esports',`Game ${g.gameNumber}: ${g.blueName} ${g.blueScore}–${g.orangeScore} ${g.orangeName}. ${winner} take this game.`, 'Matchday',key,{date:g.scheduledDate,fixture:g.fixtureId});
      const moments=this.db.prepare("SELECT i.playerId,i.type,p.gamertag,COUNT(*) AS n,SUM(i.critical) AS critical FROM game_incidents i JOIN players p ON p.id=i.playerId WHERE i.gameResultId=? GROUP BY i.playerId,i.type ORDER BY critical DESC,n DESC LIMIT 8").all(g.id);
      for(const m of moments){
        if(m.type==='goal' && m.n<2)continue;
        if(m.type==='save' && m.n<3 && !m.critical)continue;
        const description=m.type==='open_net_miss'?`${m.gamertag} missed ${m.n} confirmed open-net ${m.n===1?'chance':'chances'} in game ${g.gameNumber}${m.critical?`, including ${m.critical} in critical moments`:''}.`
          :m.type==='critical_demo'?`${m.gamertag} removed the last defender with ${m.n} critical ${m.n===1?'demo':'demos'} in game ${g.gameNumber}.`
          :m.type==='save'?`${m.gamertag} made ${m.n} saves in game ${g.gameNumber}${m.critical?`, including ${m.critical} in critical moments`:''}.`
          :`${m.gamertag} scored ${m.n} goals in game ${g.gameNumber}.`;
        if(!['open_net_miss','critical_demo','save','goal'].includes(m.type))continue;
        const negative=m.type==='open_net_miss',momentKey=key+':'+m.playerId+':'+m.type;
        const legacy='incident:'+g.id+':'+m.playerId+':'+m.type;
        const impacted=this.db.prepare('SELECT p.*,pt.pressureResistance,pt.tiltTendency FROM players p LEFT JOIN player_traits pt ON pt.playerId=p.id WHERE p.id=?').get(m.playerId);
        const impact=socialImpact(negative?'negative':'positive',{pressureResistance:impacted.pressureResistance??60,tiltTendency:impacted.tiltTendency??40});
        const first=!this.db.prepare('SELECT id FROM social_posts WHERE careerId=? AND fixtureId=? AND playerId=? AND id LIKE ?').get(c.id,g.fixtureId,m.playerId,'incident:'+g.id+':%');
        this.db.prepare('INSERT OR IGNORE INTO social_posts(id,careerId,playerId,fixtureId,date,author,body,sentiment,moraleChange,confidenceChange) VALUES (?,?,?,?,?,?,?,?,?,?)').run(legacy,c.id,m.playerId,g.fixtureId,g.scheduledDate,'The Rotation',description,negative?'negative':'positive',first?impact.morale:0,first?impact.confidence:0);
        if(first){this.db.prepare('UPDATE players SET morale=MAX(0,MIN(100,morale+?)) WHERE id=?').run(impact.morale,m.playerId);this.db.prepare('UPDATE player_traits SET confidence=MAX(0,MIN(100,confidence+?)) WHERE playerId=?').run(impact.confidence,m.playerId);}
        const moment=this.insert(c,negative?'rotation':'highlights',description+(negative?' How do you let those chances go in a game like this?':' Big moments worth watching in the replay.'),negative?'UnderPressure':'Clutch',momentKey,{date:g.scheduledDate,parent:root,fixture:g.fixtureId,legacy,priority:70});
        this.insert(c,'johnny',description+(negative?' The finishing is worth reviewing; these confirmed misses do not prove the whole team played badly.':' Look at the supporting rotations around those moments.'),'Analysis',momentKey+':analysis',{date:g.scheduledDate,parent:root,fixture:g.fixtureId});
        this.insert(c,`fan:${topicFor(c.region)}:0`,description+(negative?' my grandma is asking for a tryout after watching that 😭':' actually unreal. give them their flowers.'),'',momentKey+':fan',{date:g.scheduledDate,parent:root,fixture:g.fixtureId,tone:negative?'frustrated fan; sarcastic performance criticism':'excited fan',priority:70});
        if(negative){
          this.insert(c,`fan:${topicFor(c.region)}:2`,'the net has filed a missing person report for the ball 💀','',momentKey+':joke',{date:g.scheduledDate,parent:root,replyTo:moment,priority:65});
          this.insert(c,'rizzo','yeah the misses were rough. pretending you would never miss on stage is a different kind of comedy.','',momentKey+':defend',{date:g.scheduledDate,parent:root,replyTo:moment,priority:65});
          this.quote(c,moment,`fan:${topicFor(c.region)}:5`,'fraud watch timeline is eating tonight. need a response next game.',momentKey+':quote');
        }
      }
      if(!moments.length){
        const stats=this.db.prepare('SELECT p.gamertag,s.* FROM game_player_stats s JOIN players p ON p.id=s.playerId WHERE s.gameResultId=? ORDER BY s.goals DESC,s.assists DESC LIMIT 1').get(g.id);
        if(stats)this.insert(c,'gibbs',`${stats.gamertag}: ${stats.goals} goals, ${stats.assists} assists, ${stats.saves} saves and ${stats.shots} registered shots in game ${g.gameNumber}. Shot totals alone do not show whether chances were open nets.`,'Analysis',key+':stats',{date:g.scheduledDate,parent:root,fixture:g.fixtureId});
      }
    }
    const fixtures = this.db.prepare("SELECT f.*,ht.name AS home,at.name AS away,ht.region AS region FROM fixtures f JOIN career_competitions cc ON cc.competitionId=f.competitionId JOIN teams ht ON ht.id=f.homeTeamId JOIN teams at ON at.id=f.awayTeamId WHERE cc.careerId=? AND f.status='completed' AND f.scheduledDate<=? AND f.scheduledDate>=? AND f.homeScore!=f.awayScore AND NOT EXISTS (SELECT 1 FROM chirp_posts cp WHERE cp.careerId=? AND cp.sourceKey='result:'||f.id) ORDER BY CASE WHEN f.homeTeamId=? OR f.awayTeamId=? THEN 0 ELSE 1 END,f.scheduledDate DESC,f.id LIMIT 8").all(c.id, c.currentDate, addDays(c.currentDate,-7), c.id,c.teamId,c.teamId);
    for (const f of fixtures) {
      const homeWon = f.homeScore > f.awayScore, winner = homeWon ? f.home : f.away, loser = homeWon ? f.away : f.home;
      const winnerId = homeWon ? f.homeTeamId : f.awayTeamId, loserId = homeWon ? f.awayTeamId : f.homeTeamId;
      const pair=[winnerId,loserId].sort();
      this.db.prepare('INSERT OR IGNORE INTO chirp_rivalries(careerId,teamA,teamB,intensity,lastDate) VALUES (?,?,?,0,?)').run(c.id,...pair,f.scheduledDate);
      this.db.prepare('UPDATE chirp_rivalries SET intensity=MIN(100,intensity+3),lastDate=? WHERE careerId=? AND teamA=? AND teamB=?').run(f.scheduledDate,c.id,...pair);
      const topic = topicFor(f.region), key = 'result:' + f.id;
      const result = this.insert(c, 'esports', `${winner} take the series ${Math.max(f.homeScore, f.awayScore)}–${Math.min(f.homeScore, f.awayScore)} against ${loser}. ${f.seriesFormat}. #${topic}`, topic, key, { date: f.scheduledDate, fixture: f.id });
      const winningPlayer = this.db.prepare('SELECT p.*,SUM(s.goals) AS goals,SUM(s.saves) AS saves,SUM(s.assists) AS assists,SUM(s.shots) AS shots FROM game_player_stats s JOIN game_results g ON g.id=s.gameResultId JOIN players p ON p.id=s.playerId WHERE g.fixtureId=? AND p.teamId=? GROUP BY p.id ORDER BY goals DESC,assists DESC LIMIT 1').get(f.id, winnerId);
      if (winningPlayer) {
        const feature = `${winningPlayer.gamertag}: ${winningPlayer.goals} goals, ${winningPlayer.assists} assists and ${winningPlayer.saves} saves across the series.`;
        this.reply(c, result, 'gibbs', `${feature} The finishing gets the attention, but keep watching how the support positions set up the next attack.`, key + ':stats');
      } else this.reply(c, result, 'gibbs', `${winner} get the result. A series score tells us who won; it does not tell us whether every challenge was clean. The replay review still matters.`, key + ':analysis');
      const sweep=Math.min(f.homeScore,f.awayScore)===0;
      const assessment=winningPlayer ? `${winningPlayer.gamertag} finishes with ${winningPlayer.goals} goals and ${winningPlayer.assists} assists in ${winner}'s series win. ${winningPlayer.shots ? Math.round(winningPlayer.goals/winningPlayer.shots*100)+'% of their recorded shots became goals.' : ''} Look at the decision before the shot as well as the finish.`
        : `${winner} win ${Math.max(f.homeScore,f.awayScore)}–${Math.min(f.homeScore,f.awayScore)}. ${sweep ? `${loser} never took a game. The review has to start with how the team builds an outlet under pressure.` : `Close series for ${loser}. The result matters, but the review should separate the repeatable decisions from the single moments.`}`;
      this.insert(c,'johnny',assessment, 'Analysis',key+':desk',{date:f.scheduledDate,fixture:f.id});
      this.insert(c, 'team:' + winnerId, `${winner} ${choose(['get it done!', 'take the win!', 'move forward with a series win!'], key)} GG ${loser}. Thank you for backing the team. #${topic}`, topic, key + ':club', { date: f.scheduledDate, fixture: f.id });
      const winPlayer = this.db.prepare('SELECT * FROM players WHERE teamId=? ORDER BY overall DESC,id LIMIT 1').get(winnerId);
      const lossPlayer = this.db.prepare('SELECT * FROM players WHERE teamId=? ORDER BY overall DESC,id LIMIT 1').get(loserId);
      if (winPlayer) this.reply(c, result, 'player:' + winPlayer.id, choose(['GGs. Proud of the team. Keeping the focus on the next one.', 'That one means a lot. Thanks to everyone watching. More work tomorrow.', 'Good series. Love playing with this roster.'], key), key + ':winner');
      if (lossPlayer) this.reply(c, result, 'player:' + lossPlayer.id, choose(['GGs. Not the result we wanted. Reviewing it together and going again.', 'That hurts. We owe ourselves a better response in the next series.', 'Need to be better. Taking the feedback into the next practice.'], key), key + ':loser');
      this.reply(c, result, 'rizzo', Math.min(f.homeScore, f.awayScore) === 0 ? `${loser} cannot let this become the whole story of their season. Reset, review, respond.` : `A ${f.seriesFormat} like that tests the reset between games. ${winner} come out on top.`, key + ':rizzo');
      const fan = this.db.prepare("SELECT id FROM chirp_accounts WHERE careerId=? AND id=?").get(c.id, `fan:${topicFor(f.region)}:0`);
      if (fan) {
        this.reply(c, result, fan.id, `${winner} fans have every reason to enjoy that. Big result.`, key + ':praise');
        this.reply(c, result, 'rotation', `${loser} have to answer for that result. Review the decision-making as a team; blaming one name will not fix the next rotation.`, key + ':criticism');
      }
    }
    for(const s of this.db.prepare(`SELECT s.*,p.gamertag,ft.name AS seller,tt.name AS buyer FROM market_stories s JOIN players p ON p.id=s.playerId LEFT JOIN teams ft ON ft.id=s.fromTeamId JOIN teams tt ON tt.id=s.toTeamId
      WHERE s.careerId=? AND s.date<=? AND s.date>=? AND NOT EXISTS(SELECT 1 FROM chirp_posts p WHERE p.careerId=s.careerId AND p.sourceKey='market:'||s.id||':'||s.status) ORDER BY s.date DESC LIMIT 6`).all(c.id,c.currentDate,addDays(c.currentDate,-14))){
      const body=s.status==='rumour'?`Transfer report: ${s.buyer} are exploring ${s.gamertag}, currently ${s.seller?'at '+s.seller:'a free agent'}. Talks are unconfirmed; no signing has happened.`
        :s.status==='completed'?`Confirmed: ${s.gamertag} joins ${s.buyer}. A $${s.fee} move from ${s.seller||'free agency'}.`
        :`Update: ${s.buyer}'s move for ${s.gamertag} has fallen through. ${s.reason}`;
      const post=this.insert(c,'rosterwire',body,'RosterMoves','market:'+s.id+':'+s.status,{date:c.currentDate,priority:140,tone:'esports transfer reporter; state what is confirmed and what is speculation',intent:`Report these saved career transfer facts without inventing additional teams, fees or agreements: ${body} ${s.reason}`,media:chirpMedia('transfer',s.id)});
      this.discussion(c,this.requirePost(c.id,post),90);
    }
    for (const t of this.db.prepare('SELECT tr.*,p.gamertag,tm.name AS club FROM transfers tr JOIN players p ON p.id=tr.playerId LEFT JOIN teams tm ON tm.id=tr.toTeamId WHERE tr.date<=? AND tr.date>=? AND NOT EXISTS (SELECT 1 FROM chirp_posts cp WHERE cp.careerId=? AND cp.sourceKey=\'transfer:\'||tr.id) ORDER BY tr.date DESC LIMIT 8').all(c.currentDate, addDays(c.currentDate,-7), c.id)) {
      const post = this.insert(c, 'rosterwire', t.type === 'renewal' ? `${t.gamertag} renews with ${t.club}. Continuity for the roster.` : `${t.gamertag} ${t.club ? 'joins ' + t.club : 'is now a free agent'}. ${t.fee ? '$' + Number(t.fee).toLocaleString() + ' transfer fee.' : 'A new chapter.'}`, 'RosterMoves', 'transfer:' + t.id, { date: t.date });
      this.reply(c, post, 'johnny', 'The fit matters as much as the name. Watch how they divide the challenges and the support roles.', 'transfer:' + t.id + ':reply');
    }
    for (const p of this.db.prepare('SELECT sp.* FROM social_posts sp WHERE sp.careerId=? AND sp.date>=? AND NOT EXISTS (SELECT 1 FROM chirp_posts cp WHERE cp.careerId=sp.careerId AND cp.legacyPostId=sp.id) ORDER BY sp.date,sp.rowid LIMIT 20').all(c.id,addDays(c.currentDate,-7))) {
      const author = p.author === 'RL Highlights' ? 'highlights' : p.author === 'RosterWire' ? 'rosterwire' : 'rotation';
      const post=this.insert(c, author, p.body, p.sentiment === 'negative' ? 'UnderPressure' : 'OnTheRise', 'legacy:' + p.id, { date: p.date, legacy: p.id, fixture: p.fixtureId });
      if(this.db.prepare('SELECT id FROM players WHERE id=? AND teamId=?').get(p.playerId,c.teamId))this.db.prepare('INSERT OR IGNORE INTO chirp_notifications (id,careerId,accountId,postId,type,body,date) VALUES (?,?,?,?,?,?,?)').run(uuid(),c.id,author,post,'mention',p.sentiment==='negative'?'is discussing the pressure on your squad':'is talking about your squad',p.date);
    }
  }
  private resultReceipts(c:any){
    const fixtures=this.db.prepare(`SELECT f.* FROM fixtures f JOIN career_competitions cc ON cc.competitionId=f.competitionId
      WHERE cc.careerId=? AND f.status='completed' AND f.homeScore<>f.awayScore AND f.scheduledDate BETWEEN ? AND ?
      AND ((f.homeTeamId=? AND f.homeScore<f.awayScore) OR (f.awayTeamId=? AND f.awayScore<f.homeScore)) ORDER BY f.scheduledDate,f.id LIMIT 12`)
      .all(c.id,addDays(c.currentDate,-7),c.currentDate,c.teamId,c.teamId);
    for(const f of fixtures){
      const report=this.db.prepare("SELECT position,date FROM chirp_posts WHERE careerId=? AND sourceKey=?").get(c.id,'result:'+f.id);
      const posts=this.db.prepare(`SELECT p.* FROM chirp_posts p WHERE p.careerId=? AND p.accountId='manager' AND p.parentId IS NULL
        AND p.date BETWEEN ? AND ? AND (p.fixtureId=? OR p.fixtureId IS NULL)
        AND NOT EXISTS(SELECT 1 FROM chirp_posts r WHERE r.careerId=p.careerId AND r.sourceKey='receipt:'||p.id)
        ORDER BY p.date DESC,p.position DESC LIMIT 8`).all(c.id,addDays(f.scheduledDate,-2),f.scheduledDate,f.id);
      for(const p of posts){
        if(!/not losing|won't lose|won’t lose|y['’]?all suck|frauds|easy win|free win|we.*(?:win|beat)|luck|trash|destroy|cook/i.test(p.body))continue;
        if(!p.fixtureId && report && p.date===report.date && p.position>report.position)continue; // post written after the result
        const match=chirpMatchContext(this.db,c.id,f.id);if(!match)continue;
        // Attach legacy pregame boasts as well; replies inherit this identity.
        this.db.prepare('UPDATE chirp_posts SET fixtureId=? WHERE id=? AND fixtureId IS NULL').run(f.id,p.id);
        const base='receipt:'+p.id,fan=`fan:${topicFor(c.region)}:5`;
        const intent=`You are a rival fan teasing the ${c.clubName} manager after their team lost. Quote their pre-series confidence back at them using a specific verified result or comeback that contradicts it. Do not speak as the manager or defend their boast. Casual sarcastic sports banter, not generic abuse.`;
        const quote=this.insert(c,fan,'The pre-series receipt is back on the timeline.','Receipts',base,{quote:p.id,fixture:f.id,priority:150,intent,tone:'rival fan enjoying the manager being proved wrong',media:chirpReceiptMedia(match,p.body)});
        this.db.prepare('INSERT OR IGNORE INTO chirp_notifications(id,careerId,accountId,postId,type,body,date) VALUES (?,?,?,?,?,?,?)').run(uuid(),c.id,fan,quote,'repost','quoted your pre-series post after the result',c.currentDate);
        for(const [i,actor] of [fan,'rizzo',`fan:${topicFor(c.region)}:0`,'johnny'].entries()){
          const stance=i===2?'Defend the players from an unfair pile-on while acknowledging this defeat and the manager\'s unwise boast.':i===3?'Discuss the verified series turning point as an analyst. Distinguish recorded mistakes from unsupported blame.':intent;
          const reply=this.insert(c,actor,'React to the manager\'s pre-series boast after the result.','Receipts',base+':reply:'+i,{replyTo:p.id,fixture:f.id,priority:145-i,intent:stance,tone:stance});
          this.db.prepare('INSERT OR IGNORE INTO chirp_notifications(id,careerId,accountId,postId,type,body,date) VALUES (?,?,?,?,?,?,?)').run(uuid(),c.id,actor,reply,'reply','returned to your pre-series chirp after the result',c.currentDate);
          if(i===0){
            const counter=this.insert(c,`fan:${topicFor(c.region)}:0`,'Push back on the pile-on.','Receipts',base+':defence',{replyTo:reply,fixture:f.id,priority:135,intent:'Push back on the rival fan: acknowledge the result, but disagree with blaming the whole roster. Use the exact comment you are answering.'});
            this.insert(c,fan,'Answer the defence.','Receipts',base+':rebuttal',{replyTo:counter,fixture:f.id,priority:134,intent:'Reply to the defending fan. Focus on the manager\'s boast and the verified result rather than attacking every player.'});
          }
        }
        this.discussion(c,this.requirePost(c.id,quote),60);
      }
    }
  }
  tick(id: string) {
    if(this.gameplayActive){this.deferred.add(id);return;}
    const today = this.career(id).currentDate, cutoff=addDays(today,-7);
    const ready = this.db.prepare('SELECT date FROM chirp_days WHERE careerId=? AND date=?').get(id, today);
    const pending = !ready || this.db.prepare("SELECT g.id FROM game_results g JOIN fixtures f ON f.id=g.fixtureId JOIN career_competitions cc ON cc.competitionId=f.competitionId WHERE cc.careerId=? AND f.scheduledDate>=? AND f.scheduledDate<=? AND NOT EXISTS(SELECT 1 FROM chirp_posts cp WHERE cp.careerId=? AND cp.sourceKey='game:'||g.id) LIMIT 1").get(id,cutoff,today,id)
      || this.db.prepare("SELECT sp.id FROM social_posts sp WHERE sp.careerId=? AND sp.date>=? AND NOT EXISTS(SELECT 1 FROM chirp_posts p WHERE p.careerId=sp.careerId AND p.legacyPostId=sp.id) LIMIT 1").get(id,cutoff)
      || this.db.prepare("SELECT f.id FROM fixtures f JOIN career_competitions cc ON cc.competitionId=f.competitionId WHERE cc.careerId=? AND f.status='completed' AND f.scheduledDate<=? AND f.scheduledDate>=? AND f.homeScore!=f.awayScore AND NOT EXISTS(SELECT 1 FROM chirp_posts p WHERE p.careerId=? AND p.sourceKey='result:'||f.id) LIMIT 1").get(id, today, cutoff, id)
      || this.db.prepare("SELECT t.id FROM transfers t WHERE t.date<=? AND t.date>=? AND NOT EXISTS(SELECT 1 FROM chirp_posts p WHERE p.careerId=? AND p.sourceKey='transfer:'||t.id) LIMIT 1").get(today,cutoff,id);
    const marketPending=this.db.prepare("SELECT s.id FROM market_stories s WHERE s.careerId=? AND s.date>=? AND NOT EXISTS(SELECT 1 FROM chirp_posts p WHERE p.careerId=s.careerId AND p.sourceKey='market:'||s.id||':'||s.status) LIMIT 1").get(id,addDays(today,-14));
    if (!pending&&!marketPending) {this.db.transaction(()=>this.resultReceipts(this.career(id)))();return;}
    return this.db.transaction(() => {
      const c = this.career(id), fresh = !this.db.prepare('SELECT date FROM chirp_days WHERE careerId=? LIMIT 1').get(id);
      this.initialize(c);
      // A first visit has an established world; subsequent days arrive once, not on refresh.
      if (fresh) for (let i = 2; i >= 0; i--) this.daily(c, addDays(c.currentDate, -i));
      else this.daily(c, c.currentDate);
      this.events(c);
      this.resultReceipts(c);
    })();
  }
  private accountData(id: string, account: string): any {
    const a = this.db.prepare('SELECT a.*,p.overall,p.morale,p.form,p.teamId AS currentTeamId,t.name AS club,EXISTS(SELECT 1 FROM chirp_follows f WHERE f.careerId=a.careerId AND f.accountId=a.id) AS following FROM chirp_accounts a LEFT JOIN players p ON p.id=a.playerId LEFT JOIN teams t ON t.id=COALESCE(p.teamId,a.teamId) WHERE a.careerId=? AND a.id=?').get(id, account);
    if (!a) throw new Error('Chirp profile not found.');
    if (a.kind === 'Player') { a.club = a.currentTeamId ? a.club : 'Free agent'; a.bio = 'Rocket League player · ' + a.club; }
    if(a.playerId){
      const c=this.db.prepare('SELECT teamId FROM careers WHERE id=?').get(id);
      if(a.currentTeamId!==c?.teamId){const view=new RecruitmentNetwork(this.db).visible({...c,id,currentDate:this.db.prepare('SELECT currentDate FROM careers WHERE id=?').get(id)?.currentDate},{...a,id:a.playerId,teamId:a.currentTeamId});a.overall=view.overall;a.morale=null;a.form=view.form;}
    }
    const identity=officialProfile(a);
    const club=a.kind==='Club'?new ClubStudio(this.db).decorate({id:a.teamId},id)?.branding:null;
    const custom=club?{displayName:club.name,color:club.primary,...(club.logo?{avatarUrl:club.logo,avatarSource:'Career club design',coverLogo:club.logo}:{}),...(club.banner?{bannerUrl:club.banner,bannerSource:'Career club design',bannerKind:'career-banner'}:{})}:{};
    return { ...a, following:!!a.following,...identity,...chirpCover({...a,...identity}),...custom,voice:chirpVoice(a) };
  }
  private postData(c: any, p: any): any {
    const reactions = this.db.prepare('SELECT r.type,r.accountId,a.id,a.displayName FROM chirp_reactions r JOIN chirp_accounts a ON a.careerId=r.careerId AND a.id=r.accountId WHERE r.careerId=? AND r.postId=? ORDER BY r.accountId').all(c.id, p.id);
    const legacy = p.legacyPostId ? this.db.prepare('SELECT s.*,p.gamertag,p.teamId FROM social_posts s JOIN players p ON p.id=s.playerId WHERE s.careerId=? AND s.id=?').get(c.id, p.legacyPostId) : null;
    const counts = this.db.prepare(`SELECT COUNT(*) AS n FROM chirp_posts reply WHERE reply.careerId=? AND ${this.direct('reply')}=? AND ${this.visible('reply')}`).get(c.id, p.id).n;
    const generation=this.db.prepare('SELECT state FROM chirp_text_jobs WHERE postId=?').get(p.id)?.state;
    const meta=this.db.prepare('SELECT * FROM chirp_post_meta WHERE postId=? AND careerId=?').get(p.id,c.id);
    const quoted=meta?.quoteId?this.requirePost(c.id,meta.quoteId):null;
    const target=meta?.replyToId?this.requirePost(c.id,meta.replyToId):null;
    return { ...p, textOrigin:p.accountId==='manager'?'manager':generation==='done'?'ai':'draft', account: this.accountData(c.id, p.accountId), likes: p.baseLikes + reactions.filter(r => r.type === 'like').length, reposts: p.baseReposts + reactions.filter(r => r.type === 'repost').length, replies: counts,
      media:meta?.media?JSON.parse(meta.media):null,
      quote:quoted?{id:quoted.id,body:quoted.body,account:this.accountData(c.id,quoted.accountId)}:null,
      replyTo:target?{id:target.id,account:this.accountData(c.id,target.accountId)}:null,
      liked: reactions.some(r => r.accountId === 'manager' && r.type === 'like'), reposted: reactions.some(r => r.accountId === 'manager' && r.type === 'repost'),
      bookmarked: !!this.db.prepare('SELECT postId FROM chirp_bookmarks WHERE careerId=? AND postId=?').get(c.id, p.id),
      reactions, support: legacy && legacy.teamId === c.teamId ? { id: legacy.id, playerId: legacy.playerId, name: legacy.gamertag, morale: legacy.moraleChange, confidence: legacy.confidenceChange, responded: !!legacy.responded } : null };
  }
  private requirePost(id: string, post: string) {
    const p = this.db.prepare('SELECT * FROM chirp_posts WHERE careerId=? AND id=?').get(id, post);
    if (!p) throw new Error('Chirp not found.');
    return p;
  }
  private newsScope(id:string,p='p',a='a'){return regionalNewsOnly(this.db)?regionalPostSql(this.career(id).region,p,a):'1=1';}
  feed(id: string, options: any = {}, update=true) {
    if (update) this.tick(id);
    else { this.db.transaction(() => this.initialize(this.career(id)))(); this.queueUpdates(id); }
    if(options.refresh)this.queueRefresh(id);
    const c = this.career(id), params: any[] = [id], where = ['p.careerId=?', 'p.parentId IS NULL',this.visible(),this.newsScope(id)];
    const query = String(options.query || '').trim().slice(0, 100), region = String(options.region || '');
    if (options.mode === 'following') where.push("EXISTS (SELECT 1 FROM chirp_follows f WHERE f.careerId=p.careerId AND f.accountId=p.accountId) OR p.accountId='manager' OR EXISTS(SELECT 1 FROM chirp_reactions r JOIN chirp_follows f ON f.careerId=r.careerId AND f.accountId=r.accountId WHERE r.careerId=p.careerId AND r.postId=p.id AND r.type='repost')");
    if (options.mode === 'bookmarks') where.push('EXISTS (SELECT 1 FROM chirp_bookmarks b WHERE b.careerId=p.careerId AND b.postId=p.id)');
    if (options.account) { where.push("(p.accountId=? OR EXISTS(SELECT 1 FROM chirp_reactions r WHERE r.careerId=p.careerId AND r.postId=p.id AND r.accountId=? AND r.type='repost'))"); params.push(options.account, options.account); }
    if (query) { where.push('(p.body LIKE ? ESCAPE \'\\\' OR a.displayName LIKE ? ESCAPE \'\\\' OR a.handle LIKE ? ESCAPE \'\\\' OR p.topic LIKE ? ESCAPE \'\\\')'); const q = '%' + query.replace(/^#/, '').replace(/[\\%_]/g, '\\$&') + '%'; params.push(q, q, q, q); }
    if (region&&!regionalNewsOnly(this.db)) { where.push('a.region=?'); params.push(region); }
    if (options.cursor) {
      const cursor = this.requirePost(id, options.cursor);
      where.push('(p.date<? OR (p.date=? AND p.position<?))'); params.push(cursor.date, cursor.date, cursor.position);
    }
    // Parentheses are essential: Following must never leak another career's posts.
    const rows = this.db.prepare(`SELECT p.* FROM chirp_posts p JOIN chirp_accounts a ON a.careerId=p.careerId AND a.id=p.accountId WHERE ${where.map(w => '(' + w + ')').join(' AND ')} ORDER BY p.date DESC,p.position DESC LIMIT 26`).all(...params);
    const posts = rows.slice(0, 25).map(p => this.postData(c, p));
    return { posts, cursor: rows.length > 25 ? posts[posts.length - 1].id : null, today: c.currentDate, manager: this.accountData(id, 'manager'), unread: this.unread(id),
      trends: this.db.prepare(`SELECT p.topic,COUNT(*) AS count FROM chirp_posts p JOIN chirp_accounts a ON a.careerId=p.careerId AND a.id=p.accountId WHERE p.careerId=? AND p.parentId IS NULL AND p.topic!='' AND p.date>=? AND ${this.visible()} AND ${this.newsScope(id)} GROUP BY p.topic ORDER BY count DESC,p.topic LIMIT 6`).all(id, addDays(c.currentDate, -7)),
      suggestions: this.db.prepare(`SELECT a.id FROM chirp_accounts a WHERE a.careerId=? AND a.id!='manager' ${regionalNewsOnly(this.db)?`AND a.region IN (${regionSql(c.region)})`:''} AND NOT EXISTS(SELECT 1 FROM chirp_follows f WHERE f.careerId=a.careerId AND f.accountId=a.id) ORDER BY CASE WHEN a.teamId=? THEN 0 WHEN a.kind IN ('Analyst','Creator','Former pro','Media') THEN 1 ELSE 2 END,a.followers DESC LIMIT 4`).all(id, c.teamId).map(a=>this.accountData(id,a.id)),
      people: query ? this.db.prepare(`SELECT a.id FROM chirp_accounts a WHERE a.careerId=? ${regionalNewsOnly(this.db)?`AND a.region IN (${regionSql(c.region)})`:''} AND (a.displayName LIKE ? OR a.handle LIKE ?) ORDER BY a.followers DESC LIMIT 10`).all(id, '%' + query.replace(/^@/, '') + '%', '%' + query.replace(/^@/, '') + '%').map(a=>this.accountData(id,a.id)) : [], regionalOnly:regionalNewsOnly(this.db),regions: regionalNewsOnly(this.db)?[c.region]:this.db.prepare("SELECT DISTINCT region FROM chirp_accounts WHERE careerId=? AND kind='Player' ORDER BY region").all(id).map(r => r.region) };
  }
  profile(id: string, account: string) {
    this.db.transaction(() => this.initialize(this.career(id)))(); const a = this.accountData(id, account);
    return { ...a, followers: a.followers + (a.following ? 1 : 0), followingCount: account === 'manager' ? this.db.prepare('SELECT COUNT(*) AS n FROM chirp_follows WHERE careerId=?').get(id).n : null, postCount: this.db.prepare('SELECT COUNT(*) AS n FROM chirp_posts WHERE careerId=? AND accountId=? AND parentId IS NULL').get(id, account).n };
  }
  thread(id: string, post: string) {
    const c = this.career(id), p = this.requirePost(id, post);
    if(!this.db.prepare(`SELECT p.id FROM chirp_posts p JOIN chirp_accounts a ON a.careerId=p.careerId AND a.id=p.accountId WHERE p.id=? AND p.careerId=? AND ${this.newsScope(id)}`).get(post,id))throw Error('This thread is outside your regional news setting. Turn it off in Settings to view worldwide Chirp.');
    if(!this.db.prepare('SELECT postId FROM chirp_publications WHERE postId=? AND published=1').get(p.id))throw new Error('This comment is still being prepared.');
    if(this.text)this.db.transaction(()=>this.discussion(c,p))();
    this.db.prepare('UPDATE chirp_post_meta SET priority=MAX(priority,120) WHERE careerId=? AND postId IN(SELECT id FROM chirp_posts WHERE careerId=? AND parentId=?)').run(id,id,p.id);
    this.queueUpdates(id);
    const replies = this.db.prepare(`SELECT reply.* FROM chirp_posts reply JOIN chirp_accounts ra ON ra.careerId=reply.careerId AND ra.id=reply.accountId JOIN chirp_publication_order ordering ON ordering.postId=reply.id WHERE reply.careerId=? AND ${this.direct('reply')}=? AND ${this.visible('reply')} AND ${this.newsScope(id,'reply','ra')} ORDER BY ordering.sequence LIMIT 100`).all(id,p.id);
    const preparing=this.db.prepare(`SELECT COUNT(*) n FROM chirp_posts reply JOIN chirp_text_jobs j ON j.postId=reply.id WHERE reply.careerId=? AND ${this.direct('reply')}=? AND j.state='pending'`).get(id,p.id).n;
    // The selected reply is the main post. Earlier context is navigation,
    // never a flattened replacement for the selected comment.
    return { post: this.postData(c,p), ancestors:this.ancestors(id,p).map(parent=>this.postData(c,parent)),replies:replies.map(reply=>this.postData(c,reply)),preparing,replyTarget:null };
  }
  follow(id: string, account: string) {
    this.career(id); this.accountData(id, account);
    if (account === 'manager') throw new Error('This is your own profile.');
    return this.db.transaction(() => {
      const old = this.db.prepare('SELECT accountId FROM chirp_follows WHERE careerId=? AND accountId=?').get(id, account);
      if (old) this.db.prepare('DELETE FROM chirp_follows WHERE careerId=? AND accountId=?').run(id, account);
      else this.db.prepare('INSERT INTO chirp_follows VALUES (?,?)').run(id, account);
      return { success: true, following: !old };
    })();
  }
  react(id: string, post: string, type: string) {
    const c = this.career(id), p = this.requirePost(id, post);
    if (!['like', 'repost', 'bookmark'].includes(type)) throw new Error('Choose a valid reaction.');
    return this.db.transaction(() => {
      if (type === 'bookmark') {
        if (this.db.prepare('SELECT postId FROM chirp_bookmarks WHERE careerId=? AND postId=?').get(id, post)) this.db.prepare('DELETE FROM chirp_bookmarks WHERE careerId=? AND postId=?').run(id, post);
        else this.db.prepare('INSERT INTO chirp_bookmarks VALUES (?,?)').run(id, post);
      } else {
        if (this.db.prepare('SELECT postId FROM chirp_reactions WHERE careerId=? AND postId=? AND accountId=? AND type=?').get(id, post, 'manager', type)) this.db.prepare('DELETE FROM chirp_reactions WHERE careerId=? AND postId=? AND accountId=? AND type=?').run(id, post, 'manager', type);
        else this.db.prepare('INSERT INTO chirp_reactions VALUES (?,?,?,?,?)').run(id, post, 'manager', type, c.currentDate);
      }
      return { success: true, post: this.postData(c, p) };
    })();
  }
  publish(id: string, body: string, parent?: string) {
    const c = this.career(id); this.db.transaction(() => this.initialize(c))();
    if (typeof body !== 'string' || !body.trim() || body.trim().length > 500) throw new Error('Write between 1 and 500 characters.');
    const root = parent ? this.requirePost(id, parent) : null;
    return this.db.transaction(() => {
      const threadId = root?.id;
      const upcoming=!root?this.db.prepare(`SELECT f.id FROM fixtures f JOIN career_competitions cc ON cc.competitionId=f.competitionId WHERE cc.careerId=?
        AND (f.homeTeamId=? OR f.awayTeamId=?) AND f.status='scheduled' AND f.scheduledDate=? ORDER BY f.id LIMIT 1`).get(id,c.teamId,c.teamId,c.currentDate):null;
      const post = this.insert(c, 'manager', body.trim(), body.match(/#([A-Za-z0-9_]+)/)?.[1] || 'ClubLife', 'manager:' + uuid(), { parent: threadId,replyTo:root?.id,fixture:root?.fixtureId||upcoming?.id });
      const target = root?.accountId && root.accountId !== 'manager' ? root.accountId : choose(['rizzo', 'sunless', `fan:${topicFor(c.region)}:0`], post);
      this.db.prepare('INSERT OR IGNORE INTO chirp_reactions VALUES (?,?,?,?,?)').run(id, post, target, 'like', c.currentDate);
      this.db.prepare('INSERT OR IGNORE INTO chirp_reactions VALUES (?,?,?,?,?)').run(id, post, 'sunless', 'repost', c.currentDate);
      const actors=[target,'rizzo','johnny',...[...fanActors].sort((a,b)=>hash(post+a)-hash(post+b))].filter((actor,i,all)=>all.indexOf(actor)===i).slice(0,8);
      for(let i=0;i<actors.length;i++){
        const actor=actors[i],text=actor==='johnny'?'What is the actual plan for the next series? Talent is not the issue if the support disappears after the first challenge.'
          :actor==='rizzo'?'coach posts once and suddenly the replies have a better coaching badge than the coach 😭'
          :fanResponse((hash(post)+i)%12,c.clubName,body);
        const stance=root && i===0?'The manager replied directly to YOU. Continue your own point from the earlier conversation and answer their specific response. Keep your established opinion, acknowledge a fair counterpoint if appropriate, or push back. Do not pretend to be a new observer.':i%2?'Question or disagree with a specific point in this post. Be casual and blunt.':'Support a specific point in this post, ask a relevant question or add your own perspective.';
        const response=this.insert(c,actor,text,'',`response:${post}:${i}`,{parent:post,replyTo:post,priority:root && i===0?160:130,tone:stance,intent:stance});
        this.db.prepare('INSERT OR IGNORE INTO chirp_reactions VALUES (?,?,?,?,?)').run(id,post,actor,i%3===0?'repost':'like',c.currentDate);
        this.db.prepare('INSERT OR IGNORE INTO chirp_notifications (id,careerId,accountId,postId,type,body,date) VALUES (?,?,?,?,?,?,?)').run(uuid(),id,actor,response,'reply','replied to your chirp',c.currentDate);
      }
      for(const [actor,text] of [[`fan:${topicFor(c.region)}:4`,`the ${c.clubName} manager has entered the replies. match day just got more interesting.`],[`fan:${topicFor(c.region)}:1`,'taking a screenshot of this for later. hope the team backs it up.']]){
        const quoted=this.quote(c,post,actor,text,'manager-quote:'+post+actor,'react specifically to the manager, competitive fan chatter');
        this.db.prepare('UPDATE chirp_post_meta SET priority=90 WHERE postId=?').run(quoted);
        this.db.prepare('INSERT OR IGNORE INTO chirp_notifications (id,careerId,accountId,postId,type,body,date) VALUES (?,?,?,?,?,?,?)').run(uuid(),id,actor,quoted,'repost','quoted your chirp',c.currentDate);
      }
      for(const [type,actor] of [['like',target],['repost','sunless']])this.db.prepare('INSERT OR IGNORE INTO chirp_notifications (id,careerId,accountId,postId,type,body,date) VALUES (?,?,?,?,?,?,?)').run(uuid(),id,actor,post,type,type==='like'?'liked your chirp':'reposted your chirp',c.currentDate);
      this.queueUpdates(id);
      return { success: true, post: this.postData(c, this.requirePost(id, post)), threadId: threadId || post };
    })();
  }
  notifications(id: string, markRead = false) {
    this.career(id);
    const rows = this.db.prepare(`SELECT n.* FROM chirp_notifications n JOIN chirp_publications publication ON publication.postId=n.postId AND publication.published=1 JOIN chirp_posts p ON p.id=n.postId JOIN chirp_accounts a ON a.careerId=p.careerId AND a.id=p.accountId WHERE n.careerId=? AND ${this.newsScope(id)} ORDER BY n.date DESC,n.rowid DESC LIMIT 80`).all(id);
    if (markRead) this.db.prepare('UPDATE chirp_notifications SET isRead=1 WHERE careerId=? AND postId IN(SELECT postId FROM chirp_publications WHERE published=1)').run(id);
    return rows.map(n => ({ ...n, account: this.accountData(id, n.accountId) }));
  }
  private unread(id:string){return this.db.prepare(`SELECT COUNT(*) AS n FROM chirp_notifications n JOIN chirp_publications publication ON publication.postId=n.postId AND publication.published=1 JOIN chirp_posts p ON p.id=n.postId JOIN chirp_accounts a ON a.careerId=p.careerId AND a.id=p.accountId WHERE n.careerId=? AND n.isRead=0 AND ${this.newsScope(id)}`).get(id).n;}
  updates(id: string) {
    this.career(id);
    return {latest:this.db.prepare(`SELECT p.id FROM chirp_posts p JOIN chirp_accounts a ON a.careerId=p.careerId AND a.id=p.accountId WHERE p.careerId=? AND p.parentId IS NULL AND ${this.visible()} AND ${this.newsScope(id)} ORDER BY p.date DESC,p.position DESC LIMIT 1`).get(id)?.id || '',
      revision:this.db.prepare("SELECT (SELECT COUNT(*) FROM chirp_publications WHERE careerId=? AND published=1)+(SELECT COUNT(*) FROM chirp_text_jobs WHERE careerId=? AND state='fallback') AS n").get(id,id).n,
      unread:this.unread(id)};
  }
}
