import type { AppDatabase } from './database';
import { v4 as uuid } from 'uuid';
import { careerMode } from '../game/career-mode';
import { addDays } from '../game/career-rules';
import { CORE_SKILLS, coreSkills } from '../game/local-skill-progression';
import config from '../../data/local-skill-progression.json';
import { PATH_CHALLENGES, pathRank } from '../game/path-start';
export const pathPointCost = (overall: number) =>
  Math.round(45 + Math.max(0, overall - 60) * 3 + Math.max(0, overall - 85) ** 2);
export class PathToGlory {
  constructor(private db: AppDatabase) {}
  enabled(id: string) {
    return careerMode(this.db, id) === 'Path To Glory';
  }
  private career(id: string) {
    const c = this.db.prepare('SELECT * FROM careers WHERE id=?').get(id);
    if (!c || !this.enabled(id)) throw Error('Load a Path To Glory save.');
    return c;
  }
  private memory(c: any, kind: string, title: string, body: string, fixtureId?: string) {
    this.db
      .prepare('INSERT INTO path_memories VALUES (?,?,?,?,?,?,?)')
      .run(uuid(), c.id, c.currentDate, kind, title, body, fixtureId || null);
  }
  candidates(region?: string) {
    const teams = this.db
      .prepare(
        "SELECT t.id,t.name,t.region,COUNT(p.id) AS n,AVG(p.overall) AS average,MAX(p.overall) AS highest,MIN(p.overall) AS lowest FROM teams t JOIN players p ON p.teamId=t.id LEFT JOIN team_roster_sources rs ON rs.teamId=t.id WHERE COALESCE(rs.status,'') NOT IN ('inactive','incomplete','disbanded') GROUP BY t.id HAVING n=3 AND highest<=65 AND lowest>=40 ORDER BY ABS(average-55),t.id"
      )
      .all();
    return teams
      .filter((t) => !region || t.region === region)
      .slice(0, 12)
      .map((t) => ({
        ...t,
        players: this.db
          .prepare('SELECT id,gamertag,overall FROM players WHERE teamId=? ORDER BY id')
          .all(t.id),
      }));
  }
  generateSquad(rank: string, region: string, name = 'Phoenix Academy') {
    const preset = pathRank(rank),
      regions = [
        'Europe',
        'North America',
        'MENA',
        'South America',
        'Oceania',
        'Asia-Pacific',
        'Sub-Saharan Africa',
      ];
    if (!regions.includes(region)) throw Error('Choose a supported competitive region.');
    const title = String(name).trim();
    if (title.length < 2 || title.length > 40)
      throw Error('Use a club name between 2 and 40 characters.');
    const id = 'path_team_' + uuid();
    this.db
      .prepare(
        'INSERT INTO teams(id,name,shortName,region,reputation,budget,cashBalance,coachRating,facilityLevel,fanbase,sponsorIncome,teamChemistry,teamForm) VALUES (?,?,?,?,40,0,0,60,1,100,0,65,50)'
      )
      .run(
        id,
        title,
        title
          .replace(/[^a-z0-9]/gi, '')
          .slice(0, 3)
          .toUpperCase(),
        region
      );
    const tags = ['Kestrel', 'Flux', 'Rook'],
      roles = ['STRIKER', 'SUPPORT', 'DEFENSIVE_ANCHOR'];
    for (let i = 0; i < 3; i++) {
      const pid = 'path_player_' + uuid(),
        rating = Math.min(80, preset.start + i - 1),
        tag = tags[i] + String((parseInt(pid.slice(-4), 16) % 90) + 10);
      this.db
        .prepare(
          'INSERT INTO players(id,gamertag,realName,region,age,teamId,preferredTendency,overall,potential,form,morale,fatigue,consistency,chemistry,reputation,careerEarnings,marketValue,scoutKnowledge) VALUES (?,?,?,?,18,?,?,?,99,50,65,0,60,65,30,0,0,?)'
        )
        .run(pid, tag, 'Path To Glory academy player', region, id, roles[i], rating, 'Full');
      const keys = [
        'mechanical',
        'aerial',
        'groundControl',
        'shooting',
        'shotPower',
        'shotAccuracy',
        'passing',
        'defense',
        'goalkeeping',
        'positioning',
        'rotations',
        'boostManagement',
        'speed',
        'recovery',
        'fiftyFifty',
        'demolitions',
        'gameSense',
        'consistency',
        'clutch',
      ];
      this.db
        .prepare(
          `INSERT INTO player_attributes(playerId,${keys.join(',')}) VALUES (${Array(
            keys.length + 1
          )
            .fill('?')
            .join(',')})`
        )
        .run(pid, ...keys.map(() => rating));
      this.db
        .prepare(
          'INSERT INTO player_traits(playerId,aggression,riskTolerance,teamOrientation,adaptability,pressureResistance,developmentRate,professionalism,confidence,tiltTendency) VALUES (?,50,45,70,60,60,60,70,60,40)'
        )
        .run(pid);
    }
    return { id, region };
  }
  initialise(id: string, setup?: { rank: string; generated?: boolean }) {
    const c = this.career(id);
    if (this.db.prepare('SELECT careerId FROM path_campaigns WHERE careerId=?').get(id)) return;
    const players = this.db
      .prepare('SELECT * FROM players WHERE teamId=? ORDER BY id')
      .all(c.teamId);
    if (
      players.length !== 3 ||
      players.some((p) => p.overall < 40 || p.overall > (setup ? 80 : 65))
    )
      throw Error('Path To Glory starts with three players; starting OVR cannot exceed 80.');
    if (setup)
      this.db
        .prepare('INSERT INTO path_setups(careerId,rank,generated) VALUES (?,?,?)')
        .run(id, pathRank(setup.rank).rank, setup.generated ? 1 : 0);
    this.db
      .prepare('INSERT INTO path_campaigns(careerId,roster) VALUES (?,?)')
      .run(id, JSON.stringify(players.map((p) => p.id)));
    for (const p of players) {
      this.db.prepare('UPDATE players SET potential=99 WHERE id=?').run(p.id);
      this.db.prepare('INSERT OR IGNORE INTO player_attributes(playerId) VALUES (?)').run(p.id);
      for (const skill of CORE_SKILLS)
        for (const key of skill.attributes)
          this.db
            .prepare(
              `UPDATE player_attributes SET ${key}=MIN(?,MAX(?,COALESCE(${key},?))) WHERE playerId=?`
            )
            .run(p.overall + 4, p.overall - 4, p.overall, p.id);
      let skills = coreSkills(
        this.db.prepare('SELECT * FROM player_attributes WHERE playerId=?').get(p.id),
        p.overall
      );
      // Retain relative strengths, while reserving enough skill headroom for
      // the earned OVR formula to reach 99 before every attribute hits 100.
      const excess = Math.max(
        0,
        Object.values(skills).reduce((n, v) => n + v, 0) / CORE_SKILLS.length - p.overall
      );
      if (excess > 0) {
        for (const skill of CORE_SKILLS)
          for (const key of skill.attributes)
            this.db
              .prepare(`UPDATE player_attributes SET ${key}=${key}-? WHERE playerId=?`)
              .run(excess, p.id);
        skills = coreSkills(
          this.db.prepare('SELECT * FROM player_attributes WHERE playerId=?').get(p.id),
          p.overall
        );
      }
      this.db
        .prepare(
          'INSERT OR IGNORE INTO player_skill_development(careerId,playerId,baseOverall,baseSkills) VALUES (?,?,?,?)'
        )
        .run(id, p.id, p.overall, JSON.stringify(skills));
      this.db
        .prepare('INSERT OR IGNORE INTO path_player_xp(careerId,playerId) VALUES (?,?)')
        .run(id, p.id);
    }
    this.db
      .prepare('UPDATE teams SET budget=0,cashBalance=0,sponsorIncome=0 WHERE id=?')
      .run(c.teamId);
    this.db.exec('UPDATE contracts SET isActive=0');
    if (setup) {
      const cutoff = config.difficulties['Path To Glory'].find((t) =>
        players.every(
          (p) =>
            p.overall >= t.cutoff &&
            Object.values(
              coreSkills(
                this.db.prepare('SELECT * FROM player_attributes WHERE playerId=?').get(p.id),
                p.overall
              )
            ).every((v) => v >= t.minimumSkill)
        )
      )!.cutoff;
      this.db
        .prepare('UPDATE path_campaigns SET unlockedCutoff=? WHERE careerId=?')
        .run(cutoff, id);
    }
    this.db
      .prepare('INSERT OR REPLACE INTO career_lineup(careerId,players) VALUES (?,?)')
      .run(id, JSON.stringify(players.map((p) => p.id)));
    this.memory(
      c,
      'beginning',
      'The climb begins',
      'Three players. One fixed squad. Earn every promotion.'
    );
    this.ensureFixture(id);
  }
  roster(id: string): any[] {
    const s = this.db.prepare('SELECT * FROM path_campaigns WHERE careerId=?').get(id);
    if (!s) return [];
    return JSON.parse(s.roster).map((pid: string) =>
      this.db.prepare('SELECT * FROM players WHERE id=?').get(pid)
    );
  }
  review(id: string) {
    const c = this.career(id),
      s = this.db.prepare('SELECT * FROM path_campaigns WHERE careerId=?').get(id);
    if (!s) return;
    const players = this.roster(id);
    if (players.length !== 3 || players.some((p) => !p || p.teamId !== c.teamId))
      throw Error('The fixed Path To Glory squad is incomplete.');
    if (!s.completedAt && players.every((p) => p.overall >= 99)) {
      this.db
        .prepare('UPDATE path_campaigns SET completedAt=? WHERE careerId=?')
        .run(c.currentDate, id);
      this.achievement(c, 'all_99', 'From the trenches to glory', 0);
      this.memory(
        c,
        'completion',
        'Path To Glory complete',
        'All three players reached 99. Keep playing here, or begin a separate Manager Career.'
      );
    }
  }
  nextTier(id: string) {
    const s = this.db.prepare('SELECT * FROM path_campaigns WHERE careerId=?').get(id);
    if (!s) return null;
    return (
      [...config.difficulties['Path To Glory']]
        .reverse()
        .find((t) => t.cutoff > s.unlockedCutoff) || null
    );
  }
  readyForTrial(id: string) {
    const next = this.nextTier(id);
    return next &&
      this.roster(id).every(
        (p) =>
          p.overall >= next.cutoff &&
          Object.values(
            coreSkills(
              this.db.prepare('SELECT * FROM player_attributes WHERE playerId=?').get(p.id),
              p.overall
            )
          ).every((v) => v >= next.minimumSkill)
      )
      ? next
      : null;
  }
  ensureFixture(id: string) {
    const c = this.career(id),
      state = this.db.prepare('SELECT * FROM path_campaigns WHERE careerId=?').get(id);
    if (!state) return;
    const existing = this.db
      .prepare(
        "SELECT f.id FROM fixtures f JOIN career_competitions cc ON cc.competitionId=f.competitionId WHERE cc.careerId=? AND cc.stage='PATH' AND f.status IN ('scheduled','in_progress') AND (f.homeTeamId=? OR f.awayTeamId=?)"
      )
      .get(id, c.teamId, c.teamId);
    if (existing) return existing.id;
    const imminent = this.db
      .prepare(
        "SELECT f.id FROM fixtures f JOIN career_competitions cc ON cc.competitionId=f.competitionId WHERE cc.careerId=? AND cc.stage NOT IN ('PATH','ARCHIVED') AND f.status IN ('scheduled','in_progress') AND f.scheduledDate<=? AND (f.homeTeamId=? OR f.awayTeamId=?) ORDER BY f.scheduledDate LIMIT 1"
      )
      .get(id, addDays(c.currentDate, 2), c.teamId, c.teamId);
    if (imminent) return imminent.id;
    const trio = this.roster(id),
      average = trio.reduce((n, p) => n + p.overall, 0) / 3,
      trial = this.readyForTrial(id),
      chapter = state.unlockedCutoff;
    const opponents = this.db
      .prepare(
        "SELECT t.id,t.name,AVG(p.overall) AS average FROM teams t JOIN players p ON p.teamId=t.id LEFT JOIN team_roster_sources rs ON rs.teamId=t.id WHERE t.id<>? AND COALESCE(rs.status,'') NOT IN ('inactive','incomplete','disbanded') AND p.id IN (SELECT s.id FROM players s WHERE s.teamId=t.id ORDER BY s.overall DESC,s.id LIMIT 3) GROUP BY t.id HAVING COUNT(p.id)=3"
      )
      .all(c.teamId);
    const selectedRank = this.db
      .prepare('SELECT rank FROM path_setups WHERE careerId=?')
      .get(id)?.rank;
    const floor = selectedRank ? pathRank(selectedRank).opposition : 0;
    const target = trial
      ? trial.cutoff + 2
      : Math.max(floor, Math.min(99, average + 2 + Math.min(4, Math.floor(state.streak / 4))));
    opponents.sort(
      (a, b) =>
        Math.abs(a.average - target) - Math.abs(b.average - target) || a.id.localeCompare(b.id)
    );
    if (!opponents.length) throw Error('Path To Glory needs an opposing squad.');
    const nearTarget = opponents.filter((t) => Math.abs(t.average - target) <= 6);
    const pool = nearTarget.length ? nearTarget : opponents.slice(0, 1);
    let rival = this.db
      .prepare('SELECT * FROM path_rivals WHERE careerId=? AND chapter=?')
      .get(id, chapter);
    if (!rival) {
      this.db
        .prepare('INSERT INTO path_rivals(careerId,chapter,teamId) VALUES (?,?,?)')
        .run(id, chapter, opponents[0].id);
      rival = { teamId: opponents[0].id };
    }
    const seriesCount = this.db
      .prepare('SELECT COUNT(*) AS n FROM path_series WHERE careerId=?')
      .get(id).n;
    const opponent = trial
      ? opponents[0]
      : seriesCount % 3 === 0
        ? pool.find((t) => t.id === rival.teamId) || pool[0]
        : pool[seriesCount % Math.min(5, pool.length)];
    const comp = 'path:' + id;
    this.db
      .prepare(
        "INSERT OR IGNORE INTO competitions(id,name,type,status,config,prizePool) VALUES (?,?,'SCRIM','in_progress','{}',0)"
      )
      .run(comp, 'Path To Glory');
    this.db
      .prepare(
        "INSERT OR IGNORE INTO career_competitions(competitionId,careerId,stage,cycle,startDate,sources) VALUES (?,?,'PATH',0,?,'[]')"
      )
      .run(comp, id, c.currentDate);
    for (const teamId of [c.teamId, opponent.id])
      this.db
        .prepare('INSERT OR IGNORE INTO competition_entries(competitionId,teamId) VALUES (?,?)')
        .run(comp, teamId);
    const fixture = uuid(),
      date = seriesCount ? addDays(c.currentDate, 2) : c.currentDate;
    this.db
      .prepare(
        "INSERT INTO fixtures(id,competitionId,round,homeTeamId,awayTeamId,scheduledDate,status,seriesFormat) VALUES (?,?,?,?,?,?,'scheduled',?)"
      )
      .run(fixture, comp, seriesCount + 1, c.teamId, opponent.id, date, trial ? 'BO5' : 'BO3');
    this.db
      .prepare('INSERT INTO path_series(fixtureId,careerId,trialCutoff) VALUES (?,?,?)')
      .run(fixture, id, trial?.cutoff || null);
    this.db
      .prepare(
        "INSERT INTO calendar_events(id,careerId,date,type,title,description,relatedId) VALUES (?,?,?,'match',?,?,?)"
      )
      .run(
        uuid(),
        id,
        date,
        trial ? `${trial.level} promotion trial` : `Path To Glory · ${opponent.name}`,
        trial
          ? 'Win this series to unlock the next bot tier.'
          : 'Earn match XP with your fixed squad.',
        fixture
      );
    return fixture;
  }
  private addXp(c: any, playerId: string, amount: number) {
    const p = this.db.prepare('SELECT overall FROM players WHERE id=?').get(playerId);
    this.db
      .prepare('INSERT OR IGNORE INTO path_player_xp(careerId,playerId) VALUES (?,?)')
      .run(c.id, playerId);
    const old = this.db
        .prepare('SELECT xp FROM path_player_xp WHERE careerId=? AND playerId=?')
        .get(c.id, playerId),
      total = old.xp + amount,
      cost = pathPointCost(p.overall),
      points = Math.floor(total / cost);
    this.db
      .prepare('UPDATE path_player_xp SET xp=?,totalXp=totalXp+? WHERE careerId=? AND playerId=?')
      .run(total - points * cost, amount, c.id, playerId);
    this.db
      .prepare(
        'UPDATE player_skill_development SET points=points+?,earnedPoints=earnedPoints+? WHERE careerId=? AND playerId=?'
      )
      .run(points, points, c.id, playerId);
  }
  private achievement(c: any, key: string, title: string, xp: number) {
    if (
      this.db.prepare('SELECT key FROM path_achievements WHERE careerId=? AND key=?').get(c.id, key)
    )
      return;
    this.db
      .prepare('INSERT INTO path_achievements VALUES (?,?,?,?,?)')
      .run(c.id, key, title, c.currentDate, xp);
    if (xp) for (const p of this.roster(c.id)) this.addXp(c, p.id, xp);
    this.memory(
      c,
      'achievement',
      title,
      xp ? `${xp} bonus XP for each squad member.` : 'The squad has reached the summit.'
    );
  }
  recordGame(id: string, result: any, gameId: string) {
    const c = this.career(id),
      s = this.db.prepare('SELECT * FROM path_campaigns WHERE careerId=?').get(id);
    if (
      !s ||
      this.db.prepare('SELECT gameResultId FROM path_rewards WHERE gameResultId=?').get(gameId)
    )
      return;
    this.db
      .prepare('INSERT OR IGNORE INTO path_series(fixtureId,careerId) VALUES (?,?)')
      .run(result.fixtureId, id);
    const won = result.blueScore > result.orangeScore,
      streak = won ? s.streak + 1 : 0,
      multiplier = 1 + Math.min(1, streak * 0.075);
    const ours = this.roster(id),
      opp = this.db
        .prepare('SELECT overall FROM players WHERE teamId=? ORDER BY overall DESC LIMIT 3')
        .all(result.orangeTeamId),
      average = ours.reduce((n, p) => n + p.overall, 0) / 3,
      opposition = opp.reduce((n, p) => n + p.overall, 0) / Math.max(1, opp.length);
    const weight = Math.max(0.35, Math.min(1.3, 1 + (opposition - average) / 30)),
      // Completing a difficult game is useful practice even in a heavy loss.
      // Early squads learn faster; the late-career point curve stays demanding.
      early = 1 + Math.max(0, 80 - average) / 60,
      xp = Math.round((won ? 125 : 95) * multiplier * weight * early);
    this.db
      .prepare('INSERT INTO path_rewards VALUES (?,?,?,?,?)')
      .run(gameId, id, xp, streak, multiplier);
    this.db
      .prepare(
        'UPDATE path_campaigns SET streak=?,bestStreak=MAX(bestStreak,?),games=games+1,wins=wins+? WHERE careerId=?'
      )
      .run(streak, streak, won ? 1 : 0, id);
    for (const p of ours) {
      const stats = (result.playerStats || []).find((v: any) => v.playerId === p.id),
        bonus = stats
          ? Math.max(
              0,
              Math.min(
                18,
                Math.round(
                  (Number(stats.score) || 0) / 100 +
                    (Number(stats.assists) || 0) * 2 +
                    (Number(stats.saves) || 0)
                )
              )
            )
          : 0;
      this.addXp(c, p.id, xp + bonus);
    }
    this.reviewChallenges(id);
    if (won) {
      this.achievement(c, 'first_win', 'First taste of victory', 80);
      if (streak >= 5) this.achievement(c, 'streak_5', 'Five games unbeaten', 150);
      if (s.wins + 1 >= 25) this.achievement(c, 'wins_25', 'Twenty-five wins earned', 250);
    }
    if (streak > s.bestStreak && streak >= 3)
      this.memory(
        c,
        'streak',
        `${streak}-game winning streak`,
        `Match XP multiplier: ${multiplier.toFixed(2)}×.`,
        result.fixtureId
      );
    if (!won && s.streak >= 3)
      this.memory(
        c,
        'setback',
        'A streak broken',
        `The ${s.streak}-game run ended ${result.blueScore}–${result.orangeScore}. The squad still earned XP.`,
        result.fixtureId
      );
    const previousWorst =
      this.db
        .prepare(
          'SELECT MAX(g.orangeScore-g.blueScore) AS margin FROM game_results g JOIN path_series ps ON ps.fixtureId=g.fixtureId WHERE ps.careerId=? AND g.id<>?'
        )
        .get(id, gameId)?.margin || 0;
    if (!won && result.orangeScore - result.blueScore > previousWorst)
      this.memory(
        c,
        'setback',
        'Our toughest loss',
        `${result.blueScore}–${result.orangeScore}. A loss to learn from; the squad still earned XP.`,
        result.fixtureId
      );
  }
  finishSeries(id: string, f: any) {
    const c = this.career(id),
      series = this.db
        .prepare('SELECT * FROM path_series WHERE fixtureId=? AND careerId=?')
        .get(f.id, id);
    if (!series || series.processed || f.status !== 'completed') return;
    this.db.prepare('UPDATE path_series SET processed=1 WHERE fixtureId=?').run(f.id);
    const home = f.homeTeamId === c.teamId,
      ours = home ? f.homeScore : f.awayScore,
      theirs = home ? f.awayScore : f.homeScore,
      won = ours > theirs,
      opponentId = home ? f.awayTeamId : f.homeTeamId,
      opponent = this.db.prepare('SELECT name FROM teams WHERE id=?').get(opponentId)?.name;
    this.db
      .prepare(
        `UPDATE path_rivals SET ${won ? 'wins=wins+1' : 'losses=losses+1'} WHERE careerId=? AND teamId=? AND chapter=(SELECT unlockedCutoff FROM path_campaigns WHERE careerId=?)`
      )
      .run(id, opponentId, id);
    const competition = this.db
      .prepare('SELECT name FROM competitions WHERE id=?')
      .get(f.competitionId)?.name;
    this.memory(
      c,
      'series',
      won ? `Victory over ${opponent}` : `Defeat to ${opponent}`,
      `${ours}–${theirs} · ${competition}${series.trialCutoff ? ' · promotion trial' : ''}`,
      f.id
    );
    if (won && theirs === 0) this.achievement(c, 'first_sweep', 'First clean sweep', 120);
    if (won) {
      const opposing = this.db
          .prepare('SELECT overall FROM players WHERE teamId=? ORDER BY overall DESC LIMIT 3')
          .all(opponentId),
        ours = this.roster(id);
      if (
        opposing.length === 3 &&
        opposing.reduce((n, p) => n + p.overall, 0) / 3 >=
          ours.reduce((n, p) => n + p.overall, 0) / 3 + 5
      )
        this.achievement(c, 'underdog_series', 'Against the odds', 180);
    }
    const games = this.db
      .prepare(
        'SELECT blueScore,orangeScore FROM game_results WHERE fixtureId=? ORDER BY gameNumber'
      )
      .all(f.id);
    if (
      won &&
      games.length >= 5 &&
      games[0].blueScore < games[0].orangeScore &&
      games[1].blueScore < games[1].orangeScore
    )
      this.achievement(c, 'reverse_sweep', 'Never count us out: comeback from 0–2', 240);
    if (won && series.trialCutoff) {
      this.db
        .prepare('UPDATE path_campaigns SET unlockedCutoff=MAX(unlockedCutoff,?) WHERE careerId=?')
        .run(series.trialCutoff, id);
      const tier = config.difficulties['Path To Glory'].find(
        (t) => t.cutoff === series.trialCutoff
      )!;
      this.achievement(c, 'promotion_' + tier.cutoff, `${tier.level} promotion earned`, 140);
      this.memory(
        c,
        'promotion',
        `${tier.level} unlocked`,
        'The squad proved itself in a promotion trial.',
        f.id
      );
    }
    this.review(id);
    this.ensureFixture(id);
  }
  qualified(id: string, event: any) {
    const c = this.career(id),
      xp =
        event.stage === 'WORLDS'
          ? 500
          : event.stage === 'MAJOR'
            ? 300
            : event.stage === 'REGIONAL'
              ? 120
              : 80;
    this.achievement(c, 'qualified_' + event.id, `Qualified: ${event.name}`, xp);
  }
  setRank(id: string, rank: string) {
    return this.db.transaction(() => this.applyRank(id, rank))();
  }
  private applyRank(id: string, rank: string) {
    const c = this.career(id),
      preset = pathRank(rank);
    if (
      this.db
        .prepare(
          "SELECT id FROM fixtures WHERE status='in_progress' AND (homeTeamId=? OR awayTeamId=?)"
        )
        .get(c.teamId, c.teamId)
    )
      throw Error('Finish the current series before changing your rank calibration.');
    this.db
      .prepare(
        'INSERT INTO path_setups(careerId,rank,generated) VALUES (?,?,0) ON CONFLICT(careerId) DO UPDATE SET rank=excluded.rank'
      )
      .run(id, preset.rank);
    const pending = this.db
      .prepare(
        "SELECT f.id FROM fixtures f JOIN career_competitions cc ON cc.competitionId=f.competitionId WHERE cc.careerId=? AND cc.stage='PATH' AND f.status='scheduled'"
      )
      .all(id);
    for (const f of pending) {
      this.db.prepare('DELETE FROM calendar_events WHERE careerId=? AND relatedId=?').run(id, f.id);
      this.db.prepare('DELETE FROM path_series WHERE fixtureId=?').run(f.id);
      this.db.prepare('DELETE FROM fixtures WHERE id=?').run(f.id);
    }
    this.db
      .prepare(
        'DELETE FROM path_rivals WHERE careerId=? AND chapter=(SELECT unlockedCutoff FROM path_campaigns WHERE careerId=?)'
      )
      .run(id, id);
    this.memory(
      c,
      'calibration',
      `Rank calibration: ${preset.rank}`,
      'New ladder opponents reflect your rank. Earned OVR, skills, XP and achievements are unchanged.'
    );
    this.ensureFixture(id);
    return { success: true };
  }
  challenges(id: string) {
    const s = this.db.prepare('SELECT * FROM path_campaigns WHERE careerId=?').get(id),
      c = this.career(id);
    const totals = this.db
      .prepare(
        'SELECT COALESCE(SUM(ps.assists),0) AS assists,COALESCE(SUM(ps.saves),0) AS saves,COALESCE(SUM(ps.goals),0) AS goals,COALESCE(SUM(ps.shots),0) AS shots,COALESCE(SUM(ps.demos),0) AS demos FROM game_player_stats ps JOIN game_results g ON g.id=ps.gameResultId JOIN path_series sr ON sr.fixtureId=g.fixtureId JOIN players p ON p.id=ps.playerId WHERE sr.careerId=? AND p.teamId=? AND g.wasPlayed=1'
      )
      .get(id, c.teamId);
    const values: any = {
      first_win: Math.min(1, s.wins),
      games_10: s.games,
      streak_5: s.bestStreak,
      wins_25: s.wins,
      assists_20: totals.assists,
      saves_30: totals.saves,
    };
    const results = this.db
      .prepare(
        'SELECT g.blueScore,g.orangeScore FROM game_results g JOIN path_series ps ON ps.fixtureId=g.fixtureId WHERE ps.careerId=? AND g.wasPlayed=1'
      )
      .all(id);
    const counts: any = {
      ...totals,
      games: s.games,
      wins: s.wins,
      losses: s.games - s.wins,
      streak: s.bestStreak,
      close: results.filter((g) => Math.abs(g.blueScore - g.orangeScore) === 1).length,
      clean: results.filter((g) => g.blueScore > 0 && g.orangeScore === 0).length,
      series: this.db
        .prepare('SELECT COUNT(*) AS n FROM path_series WHERE careerId=? AND processed=1')
        .get(id).n,
    };
    return PATH_CHALLENGES.map((rule) => {
      const earned = this.db
        .prepare('SELECT date FROM path_achievements WHERE careerId=? AND key=?')
        .get(id, rule.key);
      return {
        ...rule,
        progress: earned
          ? rule.target
          : Math.min(rule.target, values[rule.key] ?? counts[rule.key.replace(/_\d+$/, '')] ?? 0),
        completed: !!earned,
        date: earned?.date,
        reward:
          this.db
            .prepare('SELECT * FROM path_form_rewards WHERE careerId=? AND rewardKey=?')
            .get(id, rule.key) || null,
      };
    });
  }
  private reviewChallenges(id: string) {
    this.db.transaction(() => {
      const c = this.career(id);
      for (const rule of this.challenges(id))
        if (!rule.completed && rule.progress >= rule.target)
          this.achievement(c, rule.key, rule.title, rule.xp);
    })();
  }
  activateFormReward(id: string, key: string, playerId: string, fixtureId: string) {
    return this.db.transaction(() => {
      const c = this.career(id),
        rule = PATH_CHALLENGES.find((r) => r.key === key && r.boost);
      if (
        !rule ||
        !this.db
          .prepare('SELECT key FROM path_achievements WHERE careerId=? AND key=?')
          .get(id, key)
      )
        throw Error('Earn this form reward first.');
      if (!this.roster(id).some((p) => p.id === playerId))
        throw Error('Choose a member of your fixed squad.');
      const f = this.db.prepare('SELECT * FROM fixtures WHERE id=?').get(fixtureId);
      if (
        !f ||
        f.status !== 'scheduled' ||
        ![f.homeTeamId, f.awayTeamId].includes(c.teamId) ||
        !this.db
          .prepare(
            'SELECT competitionId FROM career_competitions WHERE careerId=? AND competitionId=?'
          )
          .get(id, f.competitionId)
      )
        throw Error('Choose an unstarted series in this save.');
      if (!['BO3', 'BO5'].includes(f.seriesFormat))
        throw Error('Form rewards last one BO3 or BO5 series (two to five games).');
      if (
        this.db
          .prepare('SELECT gameNumber FROM game_results WHERE fixtureId=? LIMIT 1')
          .get(fixtureId)
      )
        throw Error('Activate before the first game.');
      if (
        this.db
          .prepare(
            'SELECT rewardKey FROM path_form_rewards WHERE careerId=? AND (rewardKey=? OR fixtureId=?)'
          )
          .get(id, key, fixtureId)
      )
        throw Error('One form reward per series; a reward can only be used once.');
      this.db
        .prepare('INSERT INTO path_form_rewards VALUES (?,?,?,?,?)')
        .run(id, key, playerId, fixtureId, c.currentDate);
      this.memory(
        c,
        'reward',
        'Breakthrough form',
        `${this.roster(id).find((p) => p.id === playerId).gamertag} plays at 92+ AI form for the next series. Permanent OVR and promotion eligibility stay earned.`,
        fixtureId
      );
      return { success: true };
    })();
  }
  formFor(id: string, playerId: string, fixtureId: string) {
    if (!this.enabled(id)) return null;
    const r = this.db
      .prepare(
        "SELECT r.* FROM path_form_rewards r JOIN fixtures f ON f.id=r.fixtureId WHERE r.careerId=? AND r.playerId=? AND r.fixtureId=? AND f.status IN ('scheduled','in_progress')"
      )
      .get(id, playerId, fixtureId);
    return r ? { rating: 92, fixtureId, rewardKey: r.rewardKey } : null;
  }
  competitionWon(id: string, event: any, winnerId: string | undefined, date: string) {
    const c = this.career(id);
    if (winnerId !== c.teamId) return;
    const xp =
      event.stage === 'WORLDS'
        ? 1000
        : event.stage === 'MAJOR'
          ? 700
          : event.stage === 'REGIONAL'
            ? 350
            : 200;
    this.achievement(
      { ...c, currentDate: date },
      'champion_' + event.id,
      `Champions: ${event.name}`,
      xp
    );
  }
  tutorial(id: string, step: number) {
    this.career(id);
    if (!Number.isInteger(step) || step < 0 || step > 4) throw Error('Invalid tutorial step');
    this.db.prepare('UPDATE path_campaigns SET tutorialStep=? WHERE careerId=?').run(step, id);
    return { success: true };
  }
  overview(id: string) {
    this.review(id);
    this.reviewChallenges(id);
    const c = this.career(id),
      s = this.db.prepare('SELECT * FROM path_campaigns WHERE careerId=?').get(id);
    if (!s) throw Error('Path To Glory has not been initialised');
    const next = this.nextTier(id);
    return {
      ...s,
      mode: 'Path To Glory',
      rank: this.db.prepare('SELECT rank FROM path_setups WHERE careerId=?').get(id)?.rank || null,
      challenges: this.challenges(id),
      lastReward:
        this.db
          .prepare('SELECT * FROM path_rewards WHERE careerId=? ORDER BY rowid DESC LIMIT 1')
          .get(id) || null,
      multiplier: 1 + Math.min(1, s.streak * 0.075),
      nextTier: next,
      trialReady: !!this.readyForTrial(id),
      players: this.roster(id).map((p) => ({
        ...p,
        ...this.db
          .prepare('SELECT xp,totalXp FROM path_player_xp WHERE careerId=? AND playerId=?')
          .get(id, p.id),
        xpNeeded: pathPointCost(p.overall),
        points:
          this.db
            .prepare('SELECT points FROM player_skill_development WHERE careerId=? AND playerId=?')
            .get(id, p.id)?.points || 0,
      })),
      nextFixture: this.db
        .prepare(
          "SELECT f.*,t.name AS opponentName,t.id AS opponentId,ps.trialCutoff,comp.name AS competitionName,cc.stage FROM fixtures f JOIN career_competitions cc ON cc.competitionId=f.competitionId JOIN competitions comp ON comp.id=f.competitionId LEFT JOIN path_series ps ON ps.fixtureId=f.id JOIN teams t ON t.id=CASE WHEN f.homeTeamId=? THEN f.awayTeamId ELSE f.homeTeamId END WHERE cc.careerId=? AND cc.stage<>'ARCHIVED' AND f.status IN ('scheduled','in_progress') AND (f.homeTeamId=? OR f.awayTeamId=?) ORDER BY f.scheduledDate,CASE cc.stage WHEN 'PATH' THEN 1 ELSE 0 END LIMIT 1"
        )
        .get(c.teamId, id, c.teamId, c.teamId),
      circuit: this.db
        .prepare(
          "SELECT comp.id,comp.name,comp.status,cc.stage,cc.startDate,EXISTS(SELECT 1 FROM competition_entries e WHERE e.competitionId=comp.id AND e.teamId=?) AS entered FROM competitions comp JOIN career_competitions cc ON cc.competitionId=comp.id WHERE cc.careerId=? AND cc.stage NOT IN ('PATH','ARCHIVED') AND comp.status NOT IN ('completed','cancelled') AND (comp.region=? OR comp.region='GLOBAL') ORDER BY cc.startDate LIMIT 6"
        )
        .all(
          c.teamId,
          id,
          this.db.prepare('SELECT region FROM teams WHERE id=?').get(c.teamId)?.region
        ),
      achievements: this.db
        .prepare('SELECT * FROM path_achievements WHERE careerId=? ORDER BY date DESC,rowid DESC')
        .all(id),
      memories: this.db
        .prepare('SELECT * FROM path_memories WHERE careerId=? ORDER BY rowid DESC LIMIT 60')
        .all(id),
      rival: this.db
        .prepare(
          'SELECT r.*,t.name FROM path_rivals r JOIN teams t ON t.id=r.teamId WHERE r.careerId=? AND r.chapter=?'
        )
        .get(id, s.unlockedCutoff),
    };
  }
}
