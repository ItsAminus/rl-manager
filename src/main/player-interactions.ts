import type { AppDatabase } from './database';
import { v4 as uuid } from 'uuid';
import {botDifficulty} from '../game/bot-difficulty';
import { addDays, DEFAULT_TRAINING } from '../game/career-rules';
import { DEFAULT_TACTICS, MATCH_ROLES,playerMatchRole } from '../game/tactics';
import { OutgoingTransfers } from './outgoing-transfers';

const json = (value: string | null, fallback: any = {}) => { try { return value ? JSON.parse(value) : fallback; } catch { return fallback; } };
const clamp = (n: number) => Math.max(0, Math.min(100, n));
export const CHAT_TOPICS = ['support', 'praise', 'performance', 'tactics'] as const;
export const RESPONSE_LABELS: Record<string, string> = {
  reassure: 'Listen and reassure', explain: 'Explain your decision', playing_time: 'Promise 3 starts in the next 5 series (within 28 days)',
  workload: 'Promise a lighter training week within 7 days', tactics: 'Promise a tactical adjustment within 7 days',
  transfer: 'Accept the transfer request', refuse: 'Stand firm',
};
const RESPONSES: Record<string, string[]> = {
  playing_time: ['playing_time', 'explain', 'refuse'], confidence: ['reassure', 'explain', 'refuse'],
  workload: ['workload', 'explain', 'refuse'], tactics: ['tactics', 'explain', 'refuse'], transfer: ['transfer', 'reassure', 'refuse'],
};
const REQUESTS: Record<string, string> = {
  playing_time: 'I have been left out for three series in a row. What do I need to do to get back into the starting three?',
  confidence: 'I am struggling with my confidence. Can we talk about how to get back on track?',
  workload: 'The training load is wearing me down. Can we make room for recovery?',
  tactics: 'I do not feel comfortable with my current role. Can we discuss how I fit into the rotation?',
  transfer: 'I am unhappy here and I do not feel heard. I would like you to consider letting me move to another team.',
};

export class PlayerInteractions {
  constructor(private db: AppDatabase) {}
  private career(id: string) {
    const c = this.db.prepare('SELECT * FROM careers WHERE id = ?').get(id);
    if (!c) throw new Error('Career not found.');
    return c;
  }
  private player(c: any, id: string) {
    const p = this.db.prepare('SELECT p.*, pt.confidence, pt.professionalism, pt.pressureResistance, pt.tiltTendency FROM players p LEFT JOIN player_traits pt ON pt.playerId = p.id WHERE p.id = ? AND p.teamId = ?').get(id, c.teamId);
    if (!p) throw new Error('You can only talk to your current players.');
    this.db.prepare('INSERT OR IGNORE INTO manager_relationships (careerId, playerId) VALUES (?, ?)').run(c.id, id);
    return p;
  }
  private notify(c: any, title: string, body: string, playerId: string) {
    this.db.prepare('INSERT INTO inbox_items (id, careerId, date, type, title, body, isRead, actions) VALUES (?, ?, ?, ?, ?, ?, 0, ?)')
      .run(uuid(), c.id, c.currentDate, 'player_conversation', title, body, JSON.stringify([{ label: 'Talk to player', action: 'navigate', data: { href: `/dressing-room?player=${encodeURIComponent(playerId)}` } }]));
  }
  private effect(c: any, p: any, morale: number, confidence: number, trust: number) {
    this.db.prepare('UPDATE players SET morale = ? WHERE id = ?').run(clamp((p.morale ?? 50) + morale), p.id);
    this.db.prepare('INSERT OR IGNORE INTO player_traits (playerId, confidence) VALUES (?, ?)').run(p.id, 50);
    this.db.prepare('UPDATE player_traits SET confidence = MIN(100, MAX(0, COALESCE(confidence, 50) + ?)) WHERE playerId = ?').run(confidence, p.id);
    this.db.prepare('UPDATE manager_relationships SET trust = MIN(100, MAX(0, trust + ?)) WHERE careerId = ? AND playerId = ?').run(trust, c.id, p.id);
  }
  private create(c: any, p: any, topic: string, opening: string, status = 'pending', context: any = {}) {
    const id = uuid();
    this.db.prepare('INSERT INTO player_conversations (id, careerId, playerId, date, topic, status, transcript, context) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(id, c.id, p.id, c.currentDate, topic, status, JSON.stringify([{ speaker: 'player', text: opening }]), JSON.stringify(context));
    if(topic==='transfer' && status==='pending'){
      this.db.prepare('UPDATE manager_relationships SET transferRequested=1 WHERE careerId=? AND playerId=?').run(c.id,p.id);
      this.db.prepare(`INSERT INTO player_unrest(careerId,playerId,requestedDate,reason,requestStatus) VALUES (?,?,?,?,'requested')
        ON CONFLICT(careerId,playerId) DO UPDATE SET requestedDate=excluded.requestedDate,reason=excluded.reason,requestStatus='requested',listedByRequest=0`).run(c.id,p.id,c.currentDate,context.reason||opening);
      this.notify(c,`${p.gamertag} has formally requested a transfer`,opening,p.id);
    }else if (status === 'pending') this.notify(c, `${p.gamertag} wants a conversation`, opening, p.id);
    return id;
  }
  private schedule(careerId: string) { return json(this.db.prepare('SELECT schedule FROM career_training WHERE careerId = ?').get(careerId)?.schedule, DEFAULT_TRAINING); }
  private load(schedule: any[]) { return schedule.reduce((s, d) => s + (d.category === 'Rest' ? 0 : d.intensity === 'High' ? 3 : d.intensity === 'Low' ? 1 : 2), 0); }
  private plan(careerId: string) { return json(this.db.prepare('SELECT plan FROM career_tactics WHERE careerId = ?').get(careerId)?.plan, DEFAULT_TACTICS); }
  private starters(c: any) {
    const selected: string[] = json(this.db.prepare('SELECT players FROM career_lineup WHERE careerId = ?').get(c.id)?.players, []);
    const confirmed:string[]=json(this.db.prepare('SELECT starterIds FROM team_roster_sources WHERE teamId=?').get(c.teamId)?.starterIds,[]);
    const roster = this.db.prepare('SELECT id FROM players WHERE teamId = ? ORDER BY overall DESC, id').all(c.teamId).map(p => p.id);
    const preferred=selected.length?selected:confirmed;
    return [...preferred.filter(id => roster.includes(id)), ...roster.filter(id => !preferred.includes(id))].slice(0, 3);
  }
  captureStarters(careerId: string, fixtureId: string) {
    const c = this.career(careerId);
    this.fixture(c, fixtureId);
    this.db.prepare('INSERT OR IGNORE INTO series_selections (careerId, fixtureId, players) VALUES (?, ?, ?)').run(careerId, fixtureId, JSON.stringify(this.starters(c)));
  }
  private roleConcern(c: any, p: any) {
    const plan = this.plan(c.id), slot = this.starters(c).indexOf(p.id);
    const role = playerMatchRole(plan,p.id,slot), tendency = String(p.preferredTendency || '').toLowerCase();
    if (slot < 0) return '';
    if (/striker|carry/.test(tendency) && role === MATCH_ROLES[2]) return `You have me as the last defender, but attacking is my strength. Can we discuss my role in the rotation?`;
    if (/anchor|defend/.test(tendency) && role === MATCH_ROLES[0]) return `You have me leading the attack, but I am more comfortable covering the defense. Can we discuss my role?`;
    if (/support|playmaker/.test(tendency) && plan.passingStyle === 'Solo Focus') return 'I want to support our teammates with passing plays, but our plan emphasises solo attacks. Can we discuss that?';
    return '';
  }
  reviewSeries(careerId: string, fixture: any) {
    const c = this.career(careerId);
    if (fixture.status !== 'completed' || ![fixture.homeTeamId, fixture.awayTeamId].includes(c.teamId) || !this.db.prepare('SELECT competitionId FROM career_competitions WHERE careerId = ? AND competitionId = ?').get(careerId, fixture.competitionId)) return;
    if (this.db.prepare('SELECT fixtureId FROM interaction_series WHERE careerId = ? AND fixtureId = ?').get(careerId, fixture.id)) return;
    this.db.prepare('INSERT INTO series_squads (careerId, fixtureId, players) VALUES (?, ?, ?)').run(careerId, fixture.id, JSON.stringify(this.db.prepare('SELECT id FROM players WHERE teamId = ?').all(c.teamId).map(p => p.id)));
    const played = this.db.prepare('SELECT DISTINCT gps.playerId FROM game_player_stats gps JOIN game_results gr ON gr.id = gps.gameResultId JOIN players p ON p.id = gps.playerId WHERE gr.fixtureId = ? AND p.teamId = ? AND gr.gameNumber = (SELECT MIN(gameNumber) FROM game_results WHERE fixtureId = ?)').all(fixture.id, c.teamId, fixture.id).map(p => p.playerId);
    const selection = json(this.db.prepare('SELECT players FROM series_selections WHERE careerId = ? AND fixtureId = ?').get(careerId, fixture.id)?.players, this.starters(c));
    this.db.prepare('INSERT INTO interaction_series (careerId, fixtureId, date, starters) VALUES (?, ?, ?, ?)').run(careerId, fixture.id, c.currentDate, JSON.stringify(played.length ? played : selection));
    const won = fixture.homeTeamId === c.teamId ? fixture.homeScore > fixture.awayScore : fixture.awayScore > fixture.homeScore;
    for (const id of played.length ? played : this.starters(c)) {
      const score = this.db.prepare('SELECT COALESCE(SUM(gps.score), 0) AS score FROM game_player_stats gps JOIN game_results gr ON gr.id = gps.gameResultId WHERE gr.fixtureId = ? AND gps.playerId = ?').get(fixture.id, id).score;
      const games = this.db.prepare('SELECT COUNT(*) AS count FROM game_results WHERE fixtureId = ?').get(fixture.id).count;
      const change = won ? 3 : -3;
      if(botDifficulty(c.difficulty)==='Hard')this.db.prepare('UPDATE players SET form = MIN(100, MAX(0, COALESCE(form, 50) + ?)) WHERE id = ?').run(change + (games && score / games >= 400 ? 2 : 0), id);
    }
    this.tick(careerId);
  }
  tick(careerId: string) {
    if(this.db.prepare('SELECT mode FROM career_modes WHERE careerId=?').get(careerId)?.mode==='Path To Glory')return;
    this.db.transaction(() => {
      const c = this.career(careerId);
      const ids = this.db.prepare('SELECT id FROM players WHERE teamId = ?').all(c.teamId);
      const recent = this.db.prepare('SELECT * FROM interaction_series WHERE careerId = ? ORDER BY rowid DESC LIMIT 3').all(careerId);
      for (const { id } of ids) {
        const p = this.player(c, id);
        const relation = this.db.prepare('SELECT * FROM manager_relationships WHERE careerId = ? AND playerId = ?').get(careerId, id);
        this.db.prepare('INSERT OR IGNORE INTO player_unrest(careerId,playerId) VALUES (?,?)').run(careerId,id);
        // Requests in older saves already exist; retain them and give them a
        // dated lifecycle rather than creating another request or notification.
        if(relation.transferRequested){
          const previous=this.db.prepare("SELECT date,context FROM player_conversations WHERE careerId=? AND playerId=? AND topic='transfer' ORDER BY date DESC,rowid DESC LIMIT 1").get(careerId,id);
          const response=json(previous?.context).response;
          this.db.prepare("UPDATE player_unrest SET requestedDate=?,reason=?,requestStatus=? WHERE careerId=? AND playerId=? AND requestedDate IS NULL")
            .run(previous?.date||c.currentDate,'Existing transfer request',response==='transfer'?'accepted':response==='refuse'?'refused':'requested',careerId,id);
        }
        this.db.prepare('UPDATE player_unrest SET lowMoodSince=CASE WHEN ?<=35 THEN COALESCE(lowMoodSince,?) ELSE NULL END, exhaustedSince=CASE WHEN ?>=80 THEN COALESCE(exhaustedSince,?) ELSE NULL END WHERE careerId=? AND playerId=?')
          .run(p.morale??50,c.currentDate,p.fatigue??0,c.currentDate,careerId,id);
        const unrest=this.db.prepare('SELECT * FROM player_unrest WHERE careerId=? AND playerId=?').get(careerId,id);
        if(relation.transferRequested && unrest.requestedDate && c.currentDate>=addDays(unrest.requestedDate,7) && p.morale>=60 && (p.confidence??50)>=45 && p.fatigue<=60 && relation.trust>=55){
          this.db.prepare('UPDATE manager_relationships SET transferRequested=0 WHERE careerId=? AND playerId=?').run(careerId,id);
          this.db.prepare("UPDATE player_unrest SET requestStatus='withdrawn' WHERE careerId=? AND playerId=?").run(careerId,id);
          if(unrest.listedByRequest)new OutgoingTransfers(this.db).list(careerId,id,0,false);
          this.db.prepare("UPDATE player_conversations SET status='resolved',resolvedDate=? WHERE careerId=? AND playerId=? AND topic='transfer' AND status='pending'").run(c.currentDate,careerId,id);
          this.create(c,p,'transfer','Things have improved and I feel listened to again. I am withdrawing my transfer request.','resolved');
          this.notify(c,`${p.gamertag} withdrew the transfer request`,'Improved morale, fitness and trust convinced the player to stay.',id);
          relation.transferRequested=0;
        }
        for (const promise of this.db.prepare("SELECT * FROM player_promises WHERE careerId = ? AND playerId = ? AND status = 'pending'").all(careerId, id)) {
          const ctx = json(promise.context);
          const series = this.db.prepare('SELECT * FROM interaction_series WHERE careerId = ? AND rowid > ? ORDER BY rowid LIMIT 5').all(careerId, ctx.baseline || 0);
          const starts = series.filter(s => json(s.starters, []).includes(id)).length;
          const kept = promise.kind === 'playing_time' ? starts >= 3 : promise.kind === 'workload'
            ? this.load(this.schedule(careerId)) < ctx.load : JSON.stringify(this.plan(careerId)) !== ctx.plan && !this.roleConcern(c, p);
          const ended = promise.kind === 'playing_time' && series.length >= 5 || c.currentDate > promise.dueDate;
          if (kept || ended) {
            this.db.prepare('UPDATE player_promises SET status = ? WHERE id = ?').run(kept ? 'kept' : 'broken', promise.id);
            this.effect(c, this.player(c, id), kept ? 3 : -5, kept ? 2 : -3, kept ? 8 : -12);
            this.notify(c, `${p.gamertag}: promise ${kept ? 'kept' : 'broken'}`, kept ? 'You followed through. The player has more trust in your management.' : 'The deadline passed without the agreed change. The player has lost trust.', id);
            const conversation = this.db.prepare('SELECT transcript FROM player_conversations WHERE id = ?').get(promise.conversationId);
            if (conversation) this.db.prepare('UPDATE player_conversations SET transcript = ? WHERE id = ?').run(JSON.stringify([...json(conversation.transcript, []), { speaker: 'player', text: kept ? 'You kept your word. Thank you for following through.' : 'You promised a change, but it has not happened. That is hard to trust.' }]), promise.conversationId);
          }
        }
        const pending = this.db.prepare("SELECT * FROM player_conversations WHERE careerId = ? AND playerId = ? AND status = 'pending'").get(careerId, id);
        if (pending) {
          if(pending.topic==='tactics'&&!this.roleConcern(c,p)){
            const transcript=json(pending.transcript,[]);
            transcript.push({speaker:'player',text:'The current plan has me in the role we discussed. That concern is resolved.'});
            this.db.prepare("UPDATE player_conversations SET status='resolved',resolvedDate=?,transcript=? WHERE id=?").run(c.currentDate,JSON.stringify(transcript),pending.id);
            continue;
          }
          if (c.currentDate >= addDays(pending.date, 7)) {
            this.db.prepare("UPDATE player_conversations SET status = 'ignored', resolvedDate = ? WHERE id = ?").run(c.currentDate, pending.id);
            this.effect(c, this.player(c, id), -3, -2, -5);
            this.notify(c, `${p.gamertag}: conversation missed`, 'The player waited a week without a reply and feels overlooked.', id);
          }
          continue;
        }
        const current = this.player(c, id), trust = this.db.prepare('SELECT trust FROM manager_relationships WHERE careerId = ? AND playerId = ?').get(careerId, id).trust;
        const unresolved=this.db.prepare("SELECT id FROM player_conversations WHERE careerId=? AND playerId=? AND status='ignored' LIMIT 1").get(careerId,id)
          || this.db.prepare("SELECT id FROM player_promises WHERE careerId=? AND playerId=? AND status='broken' LIMIT 1").get(careerId,id)
          || this.db.prepare("SELECT id FROM player_conversations WHERE careerId=? AND playerId=? AND context LIKE '%\"response\":\"refuse\"%' LIMIT 1").get(careerId,id);
        const prolongedMood=unrest.lowMoodSince && c.currentDate>=addDays(unrest.lowMoodSince,14) && current.morale<=35 && trust<=45;
        const prolongedExhaustion=unrest.exhaustedSince && c.currentDate>=addDays(unrest.exhaustedSince,14) && current.fatigue>=80 && unresolved;
        const wantsTransfer=!relation.transferRequested && ((trust<=30 && current.morale<=40) || prolongedMood || prolongedExhaustion);
        const last = this.db.prepare('SELECT date FROM player_conversations WHERE careerId = ? AND playerId = ? ORDER BY date DESC, rowid DESC LIMIT 1').get(careerId, id);
        if (!wantsTransfer && (last && c.currentDate < addDays(last.date, 14) || this.db.prepare("SELECT id FROM player_promises WHERE careerId = ? AND playerId = ? AND status = 'pending'").get(careerId, id))) continue;
        const wrongRole = this.roleConcern(c, p);
        const topic = wantsTransfer ? 'transfer'
          : recent.length === 3 && recent.every(s => json(this.db.prepare('SELECT players FROM series_squads WHERE careerId = ? AND fixtureId = ?').get(careerId, s.fixtureId)?.players, []).includes(id) && !json(s.starters, []).includes(id)) ? 'playing_time'
          : current.fatigue>=80 || current.fatigue >= 65 && this.schedule(careerId).filter((s: any) => s.intensity === 'High' && s.category !== 'Rest').length >= 3 ? 'workload'
          : wrongRole && trust < 65 ? 'tactics' : current.morale <= 45 || (current.confidence ?? 50) <= 35 ? 'confidence' : null;
        const reason=prolongedExhaustion?'I have been exhausted for weeks and my workload concerns have not been resolved. I am formally requesting a transfer.'
          :prolongedMood?'I have been unhappy for weeks and no longer trust the situation to improve. I am formally requesting a transfer.'
          :'My relationship with the club has broken down. I am formally requesting a transfer.';
        if (topic) this.create(c, p, topic, topic === 'transfer'?reason:topic === 'tactics' ? wrongRole : REQUESTS[topic],'pending',{reason:topic==='transfer'?reason:undefined});
      }
      // Players who leave the club cannot remain in active discussions or promises.
      this.db.prepare("UPDATE player_conversations SET status = 'closed', resolvedDate = ? WHERE careerId = ? AND status = 'pending' AND playerId NOT IN (SELECT id FROM players WHERE teamId = ?)").run(c.currentDate, careerId, c.teamId);
      this.db.prepare("UPDATE player_promises SET status = 'cancelled' WHERE careerId = ? AND status = 'pending' AND playerId NOT IN (SELECT id FROM players WHERE teamId = ?)").run(careerId, c.teamId);
      this.db.prepare("UPDATE player_unrest SET requestStatus='departed' WHERE careerId=? AND requestedDate IS NOT NULL AND playerId NOT IN (SELECT id FROM players WHERE teamId=?)").run(careerId,c.teamId);
    })();
  }
  overview(careerId: string) {
    this.tick(careerId);
    const c = this.career(careerId);
    return {
      players: this.db.prepare('SELECT p.id, p.gamertag, p.overall, p.morale, p.fatigue, p.form, pt.confidence, r.trust, r.transferRequested, r.lastChatDate,u.requestedDate,u.reason AS requestReason,u.requestStatus FROM players p LEFT JOIN player_traits pt ON pt.playerId=p.id JOIN manager_relationships r ON r.playerId=p.id AND r.careerId=? LEFT JOIN player_unrest u ON u.playerId=p.id AND u.careerId=r.careerId WHERE p.teamId=? ORDER BY p.overall DESC,p.id').all(careerId,c.teamId),
      conversations: this.db.prepare('SELECT pc.*, p.gamertag FROM player_conversations pc JOIN players p ON p.id = pc.playerId WHERE pc.careerId = ? ORDER BY pc.date DESC, pc.rowid DESC LIMIT 100').all(careerId).map(pc => ({ ...pc, transcript: json(pc.transcript, []), responses: pc.status === 'pending' ? (RESPONSES[pc.topic] || []).map(id => ({ id, label: RESPONSE_LABELS[id] })) : [] })),
      promises: this.db.prepare('SELECT pp.*, p.gamertag FROM player_promises pp JOIN players p ON p.id = pp.playerId WHERE pp.careerId = ? ORDER BY pp.rowid DESC LIMIT 100').all(careerId).map(pp => ({ ...pp, label: RESPONSE_LABELS[pp.kind] })),
    };
  }
  reply(careerId: string, conversationId: string, response: string) {
    return this.db.transaction(() => {
      const c = this.career(careerId);
      const chat = this.db.prepare('SELECT * FROM player_conversations WHERE id = ? AND careerId = ?').get(conversationId, careerId);
      if (!chat || chat.status !== 'pending') throw new Error('This conversation is no longer awaiting a reply.');
      if (c.currentDate >= addDays(chat.date, 7)) throw new Error('The player waited a week; this conversation has expired.');
      if (!RESPONSES[chat.topic]?.includes(response)) throw new Error('Choose a response available for this conversation.');
      const p = this.player(c, chat.playerId);
      const promised = ['playing_time', 'workload', 'tactics'].includes(response);
      let reply = response === 'refuse' ? 'That is disappointing. I will keep working, but I do not feel listened to.' : response === 'explain'
        ? (p.professionalism ?? 50) >= 65 ? 'I understand your reasoning. I will keep working for the team.' : 'I hear you, but I am still not convinced.'
        : response === 'transfer' ? 'Thank you for hearing me. Please consider offers when the transfer window opens.'
        : promised ? 'All right. I will hold you to that promise.' : 'Thank you for listening. I needed that support.';
      const manager = response === 'explain' ? 'My decisions are based on the lineup, our rotation and the squad workload. Here is the plan, and I still value your contribution.' : RESPONSE_LABELS[response];
      if(chat.topic==='transfer' && response==='reassure')reply='I appreciate you listening, but I still want a move unless things actually improve. I am not withdrawing my request yet.';
      this.db.prepare("UPDATE player_conversations SET status = 'resolved', resolvedDate = ?, transcript = ?,context=? WHERE id = ?").run(c.currentDate, JSON.stringify([...json(chat.transcript, []), { speaker: 'manager', text: manager }, { speaker: 'player', text: reply }]),JSON.stringify({...json(chat.context),response}), chat.id);
      this.effect(c, p, response === 'refuse' ? -3 : response === 'explain' && (p.professionalism ?? 50) < 65 ? 0 : 2, response === 'refuse' ? -1 : 1, response === 'refuse' ? -5 : promised ? 1 : 3);
      if(chat.topic==='transfer')this.db.prepare('UPDATE player_unrest SET requestStatus=? WHERE careerId=? AND playerId=?').run(response==='transfer'?'accepted':response==='refuse'?'refused':'requested',careerId,p.id);
      if (response === 'transfer') {
        const listed=!!this.db.prepare('SELECT playerId FROM transfer_listings WHERE careerId=? AND playerId=?').get(careerId,p.id);
        new OutgoingTransfers(this.db).list(careerId,p.id,Math.max(0,Math.round(p.marketValue??40000)),true);
        this.db.prepare('UPDATE player_unrest SET listedByRequest=? WHERE careerId=? AND playerId=?').run(+!listed,careerId,p.id);
      }
      if (promised) {
        const baseline = this.db.prepare('SELECT COALESCE(MAX(rowid), 0) AS baseline FROM interaction_series WHERE careerId = ?').get(careerId).baseline;
        this.db.prepare('INSERT INTO player_promises (id, careerId, playerId, conversationId, kind, date, dueDate, status, context) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
          .run(uuid(), careerId, p.id, chat.id, response, c.currentDate, addDays(c.currentDate, response === 'playing_time' ? 28 : 7), 'pending', JSON.stringify({ baseline, load: this.load(this.schedule(careerId)), plan: JSON.stringify(this.plan(careerId)) }));
      }
      return { success: true };
    })();
  }
  chat(careerId: string, playerId: string, topic: string) {
    return this.db.transaction(() => {
      const c = this.career(careerId), p = this.player(c, playerId);
      if (!CHAT_TOPICS.includes(topic as any)) throw new Error('Choose a valid conversation topic.');
      if (this.db.prepare("SELECT id FROM player_conversations WHERE careerId = ? AND playerId = ? AND status = 'pending'").get(careerId, playerId)) throw new Error('Reply to the player’s existing concern first.');
      const r = this.db.prepare('SELECT * FROM manager_relationships WHERE careerId = ? AND playerId = ?').get(careerId, playerId);
      if (r.lastChatDate && c.currentDate < addDays(r.lastChatDate, 7)) throw new Error('Give the player a week before another private meeting.');
      const strong = (p.form ?? 50) >= 65, poor = (p.form ?? 50) < 45;
      const manager = topic === 'support' ? 'How are you handling the pressure? I am here to help you reset.' : topic === 'praise' ? 'I want to recognise the work you have been putting in.' : topic === 'performance' ? 'Let us review your form and where we can improve, without blaming the team.' : `Let us go through our ${String(this.plan(careerId).rotation).toLowerCase()} rotation and your place in the starting three.`;
      const answer = topic === 'praise' ? strong ? 'Thank you. I feel good about my game, and I want to keep it going.' : 'I appreciate it, but I know there is still a lot to improve.'
        : topic === 'performance' ? poor ? 'Fair feedback. I will focus on cleaning up my decisions.' : 'I feel I am doing my job. That criticism feels a little unfair.'
        : topic === 'tactics' ? 'That helps. Knowing what you expect makes the rotation clearer.' : 'It helps to know you are behind me. I will take it one series at a time.';
      const id = this.create(c, p, topic, answer, 'resolved');
      this.db.prepare('UPDATE player_conversations SET transcript = ?, resolvedDate = ? WHERE id = ?').run(JSON.stringify([{ speaker: 'manager', text: manager }, { speaker: 'player', text: answer }]), c.currentDate, id);
      this.effect(c, p, topic === 'performance' ? poor ? 1 : -2 : 2, topic === 'praise' ? strong ? 3 : 1 : topic === 'performance' && !poor ? -1 : 2, topic === 'performance' && !poor ? -2 : 3);
      this.db.prepare('UPDATE manager_relationships SET lastChatDate = ? WHERE careerId = ? AND playerId = ?').run(c.currentDate, careerId, playerId);
      return { success: true, id };
    })();
  }
  talks(careerId: string, fixtureId: string) {
    const c = this.career(careerId), f = this.fixture(c, fixtureId);
    const finished = this.db.prepare('SELECT date FROM interaction_series WHERE careerId = ? AND fixtureId = ?').get(careerId, fixtureId)?.date || f.scheduledDate;
    return { success: true, talks: this.db.prepare('SELECT * FROM team_talks WHERE careerId = ? AND fixtureId = ?').all(careerId, fixtureId).map(t => ({ ...t, reactions: json(t.reactions, []) })),
      canPregame: f.status === 'scheduled' && f.scheduledDate <= c.currentDate && !this.db.prepare('SELECT id FROM game_results WHERE fixtureId = ? LIMIT 1').get(fixtureId),
      canPostgame: f.status === 'completed' && c.currentDate <= addDays(finished, 7) };
  }
  private fixture(c: any, id: string) {
    const f = this.db.prepare('SELECT f.* FROM fixtures f JOIN career_competitions cc ON cc.competitionId = f.competitionId WHERE f.id = ? AND cc.careerId = ?').get(id, c.id);
    if (!f || ![f.homeTeamId, f.awayTeamId].includes(c.teamId)) throw new Error('This series does not belong to your team in this career.');
    return f;
  }
  teamTalk(careerId: string, fixtureId: string, phase: string, tone: string) {
    return this.db.transaction(() => {
      const c = this.career(careerId), f = this.fixture(c, fixtureId), available = this.talks(careerId, fixtureId);
      if (!['pregame', 'postgame'].includes(phase)) throw new Error('Rocket League team talks are before or after a series.');
      if (phase === 'pregame' ? !available.canPregame : !available.canPostgame) throw new Error('This team talk is not available at this point in the series.');
      if (available.talks.some(t => t.phase === phase)) throw new Error('You have already delivered this team talk.');
      if (!(phase === 'pregame' ? ['encourage', 'focus', 'relax', 'challenge'] : ['praise', 'reassure', 'critical']).includes(tone)) throw new Error('Choose an available team talk.');
      const won = f.homeTeamId === c.teamId ? f.homeScore > f.awayScore : f.awayScore > f.homeScore;
      const body: Record<string, string> = {
        encourage: 'Back yourselves. Trust the next touch, support each other and play this series together.',
        focus: 'Keep our spacing clean, call the challenges and protect the third man. Make the next rotation count.',
        relax: 'Take a breath. You do not need to force every play. Trust the work we have put in.',
        challenge: 'I want commitment from the first kickoff. Be decisive and bring your best to every game.',
        praise: won ? 'You earned that series. The work and commitment paid off. Take pride in it and keep building.' : 'The result hurts, but I appreciate your effort. We can build on what went well.',
        reassure: won ? 'Enjoy the result, recover properly and keep our feet on the ground.' : 'One series does not define us. Reset, support each other and we will work on the next one.',
        critical: won ? 'We won, but there are still decisions to clean up. Let us review them honestly.' : 'That series fell below our standards. Own the mistakes and bring solutions to the next session.',
      };
      const reactions = this.db.prepare('SELECT id FROM players WHERE teamId = ?').all(c.teamId).map(({ id }) => {
        const p = this.player(c, id), pressure = p.pressureResistance ?? 50, trust = this.db.prepare('SELECT trust FROM manager_relationships WHERE careerId = ? AND playerId = ?').get(careerId, id).trust;
        let morale = 1, confidence = 1, relationship = 0, reaction = 'Listened and feels clearer about the next step.';
        if (tone === 'encourage' || tone === 'reassure' || tone === 'relax') { morale = 2; confidence = 2; relationship = 1; reaction = 'Feels supported and more settled.'; }
        if (tone === 'praise') { morale = won ? 3 : 1; confidence = won ? 2 : 0; relationship = 1; reaction = won ? 'Proud of the result and appreciated by the coach.' : 'Appreciates the support, but knows the result must improve.'; }
        if (tone === 'challenge' || tone === 'critical') {
          const responds = pressure >= 60 && trust >= 40;
          morale = responds ? 1 : -2; confidence = responds ? 2 : -2; relationship = responds ? 0 : -1;
          reaction = responds ? 'Responds to the challenge and is determined to improve.' : 'Feels the added pressure and is less confident.';
        }
        this.effect(c, p, morale, confidence, relationship);
        return { playerId: id, gamertag: p.gamertag, reaction, morale, confidence };
      });
      this.db.prepare('INSERT INTO team_talks (careerId, fixtureId, phase, date, tone, body, reactions) VALUES (?, ?, ?, ?, ?, ?, ?)').run(careerId, fixtureId, phase, c.currentDate, tone, body[tone], JSON.stringify(reactions));
      return { success: true, body: body[tone], reactions };
    })();
  }
}
