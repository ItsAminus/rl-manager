import type { AppDatabase } from './database';
import { DEFAULT_TACTICS } from '../game/tactics';
import {createHash} from 'node:crypto';
export const TIMEOUT_MS = 60_000;
export function timeoutOpportunity(games:any[],wins:number,losses:number,bestOf:number){
  const last=games.at(-1),margin=last?last.blueScore-last.orangeScore:0;
  if(!last||wins<=losses||margin<=0)return {chance:0,reason:''};
  const needed=Math.floor(bestOf/2)+1,deficit=wins-losses;
  let streak=0;for(const game of [...games].reverse()){if(game.blueScore<=game.orangeScore)break;streak++;}
  // A routine opening-game loss is not a crisis. Preserve the timeout for a
  // later adjustment unless the game was a blowout or elimination is next.
  if(games.length===1&&margin<4&&wins<needed-1)return {chance:0,reason:''};
  if(margin>=7)return {chance:1,reason:'A heavy defeat needs an immediate reset.'};
  if(wins===needed-1)return {chance:streak>=2?1:.72,reason:'One more loss would end the series.'};
  if(deficit>=2)return {chance:Math.min(.92,.58+(streak-1)*.12+(margin>=4?.12:0)),reason:'Consecutive losses have shifted the series momentum.'};
  if(margin>=4)return {chance:Math.min(.9,.48+(margin-4)*.14),reason:'The last game got away from the team.'};
  return {chance:0,reason:''};
}
export function timeoutRoll(key:string){return createHash('sha256').update(key).digest().readUInt32BE(0)/0x100000000;}
export class SeriesTimeouts {
  constructor(private db: AppDatabase,private decisionRoll=timeoutRoll) {}
  private series(id: string, fixtureId: string) {
    const c = this.db.prepare('SELECT * FROM careers WHERE id=?').get(id),
      f = this.db.prepare('SELECT * FROM fixtures WHERE id=?').get(fixtureId);
    if (
      !c ||
      !f ||
      ![f.homeTeamId, f.awayTeamId].includes(c.teamId) ||
      !this.db
        .prepare(
          'SELECT competitionId FROM career_competitions WHERE careerId=? AND competitionId=?'
        )
        .get(id, f.competitionId)
    )
      throw Error('This series does not belong to your career.');
    const games = this.db
        .prepare('SELECT * FROM game_results WHERE fixtureId=? ORDER BY gameNumber')
        .all(fixtureId),
      needed = Math.floor(Number(String(f.seriesFormat).match(/\d+/)?.[0] || 5) / 2) + 1;
    const blue = games.filter((g) => g.blueScore > g.orangeScore).length,
      orange = games.length - blue;
    return {
      c,
      f,
      games,
      blue,
      orange,
      over: f.status === 'completed' || Math.max(blue, orange) >= needed,
    };
  }
  state(id: string, fixtureId: string, now = Date.now()) {
    const s = this.series(id, fixtureId),
      clocks = this.db
        .prepare('SELECT * FROM series_timeout_clocks WHERE careerId=? AND fixtureId=?')
        .all(id, fixtureId);
    const own = clocks.find((r) => r.side === 'manager'),
      opponent = clocks.find((r) => r.side === 'opponent'),
      saved =
        this.db
          .prepare(
            'SELECT * FROM series_timeouts WHERE careerId=? AND fixtureId=? ORDER BY afterGame DESC LIMIT 1'
          )
          .get(id, fixtureId) || null;
    const active = !s.over && clocks.find((r) => r.afterGame === s.games.length && r.endsAt > now);
    const opponentId = s.f.homeTeamId === s.c.teamId ? s.f.awayTeamId : s.f.homeTeamId;
    return {
      fixtureId,
      used: !!own || !!saved,
      opponentUsed: !!opponent,
      afterGame: s.games.length,
      seriesOver: s.over,
      serverNow: now,
      saved,
      own:own?{afterGame:own.afterGame,endsAt:own.endsAt}:null,
      opponentName:
        this.db.prepare('SELECT name FROM teams WHERE id=?').get(opponentId)?.name || 'Opposition',
      active: active
        ? {
            side: active.side,
            startedAt: active.startedAt,
            afterGame: active.afterGame,
            endsAt: active.endsAt,
            remainingSeconds: Math.max(0, Math.ceil((active.endsAt - now) / 1000)),
            reason:active.side==='opponent'?this.opponentPlan(id,fixtureId).timeoutReason||'':'',
          }
        : null,
    };
  }
  active(id:string,now=Date.now()){
    const clocks=this.db.prepare('SELECT DISTINCT fixtureId FROM series_timeout_clocks WHERE careerId=? AND endsAt>? ORDER BY endsAt DESC').all(id,now);
    for(const clock of clocks){
      const state=this.state(id,clock.fixtureId,now);
      if(state.active)return state;
    }
    return {fixtureId:null,active:null,serverNow:now};
  }
  start(id: string, fixtureId: string, now = Date.now()) {
    return this.db.transaction(() => {
      const state = this.state(id, fixtureId, now);
      if (state.seriesOver || !state.afterGame)
        throw Error('Timeouts are available between games of an unfinished series.');
      if (state.used) throw Error('Your one timeout for this series has already been used.');
      if (state.active) throw Error('Wait for the opposing timeout to finish.');
      this.db
        .prepare('INSERT INTO series_timeout_clocks VALUES (?,?,?,?,?,?,?)')
        .run(id, fixtureId, 'manager', state.afterGame, now, now + TIMEOUT_MS, '{}');
      return { success: true, ...this.state(id, fixtureId, now) };
    })();
  }
  assertManagerActive(id: string, fixtureId: string, now = Date.now()) {
    const s = this.state(id, fixtureId, now);
    if (s.active?.side !== 'manager')
      throw Error(
        'Use your series timeout to make adjustments. You have 60 seconds after calling it.'
      );
    return s;
  }
  assertCanLaunch(id: string, fixtureId: string, now = Date.now()) {
    const s = this.state(id, fixtureId, now);
    if (s.active)
      throw Error(
        `The ${s.active.side === 'manager' ? 'team' : 'opposing team'} timeout has ${s.active.remainingSeconds}s remaining.`
      );
  }
  assertCanEdit(id: string, now = Date.now()) {
    const c = this.db.prepare('SELECT teamId FROM careers WHERE id=?').get(id);
    if (!c) return;
    const f = this.db
      .prepare(
        "SELECT f.id FROM fixtures f JOIN career_competitions cc ON cc.competitionId=f.competitionId WHERE cc.careerId=? AND f.status IN ('scheduled','in_progress') AND (f.homeTeamId=? OR f.awayTeamId=?) AND EXISTS(SELECT 1 FROM game_results g WHERE g.fixtureId=f.id) LIMIT 1"
      )
      .get(id, c.teamId, c.teamId);
    if (f) this.assertManagerActive(id, f.id, now);
  }
  considerOpponent(id: string, fixtureId: string, now = Date.now()) {
    return this.db.transaction(() => {
      const s = this.series(id, fixtureId),
        state = this.state(id, fixtureId, now),
        last = s.games.at(-1);
      // Blue always represents the manager in saved played-game results.
      // Never call while ahead or level, and never after the series ends.
      if (s.over || state.opponentUsed || state.active || !last || s.orange >= s.blue) return state;
      const heavyLoss = last.blueScore - last.orangeScore >= 4;
      const bestOf=Number(String(s.f.seriesFormat).match(/\d+/)?.[0]||5);
      const decision=timeoutOpportunity(s.games,s.blue,s.orange,bestOf);
      // Stable per game: polling and reopening the page never reroll a coach's
      // decision into an inevitable timeout.
      if(!decision.chance||this.decisionRoll(`${id}:${fixtureId}:${s.games.length}`)>=decision.chance)return state;
      const opponentId = s.f.homeTeamId === s.c.teamId ? s.f.awayTeamId : s.f.homeTeamId,
        players = this.db
          .prepare('SELECT id FROM players WHERE teamId=? ORDER BY overall DESC,id LIMIT 3')
          .all(opponentId);
      const orders = Object.fromEntries(
        players.map((p, i) => [p.id, ['press', 'infield', 'defend'][i]])
      );
      const plan = {
        ...DEFAULT_TACTICS,
        overallStyle: heavyLoss ? 'Defensive' : 'Balanced',
        passingStyle: 'Passing Focus',
        ordersByPlayer: orders,
        timeoutReason:decision.reason,
      };
      this.db
        .prepare('INSERT INTO series_timeout_clocks VALUES (?,?,?,?,?,?,?)')
        .run(
          id,
          fixtureId,
          'opponent',
          s.games.length,
          now,
          now + TIMEOUT_MS,
          JSON.stringify(plan)
        );
      for (const p of players) {
        this.db.prepare('UPDATE players SET morale=MIN(100,morale+1) WHERE id=?').run(p.id);
        this.db
          .prepare('UPDATE player_traits SET confidence=MIN(100,confidence+2) WHERE playerId=?')
          .run(p.id);
      }
      return this.state(id, fixtureId, now);
    })();
  }
  opponentPlan(id: string, fixtureId: string) {
    const row = this.db
      .prepare(
        "SELECT orders FROM series_timeout_clocks WHERE careerId=? AND fixtureId=? AND side='opponent'"
      )
      .get(id, fixtureId);
    try {
      return row ? JSON.parse(row.orders) : {};
    } catch {
      return {};
    }
  }
}
