import type { AppDatabase } from './database';
import { v4 as uuid } from 'uuid';
import { addDays, transferWindow } from '../game/career-rules';
import {careerWindow} from './transfer-calendar';

// Replace missing starters with real, available players inside the career.
// Never invent players or claim these simulated signings happened in real life.
export function ensurePlayableRoster(db: AppDatabase, teamId: string, date: string): boolean {
  const team = db.prepare('SELECT * FROM teams WHERE id = ?').get(teamId);
  if (!team) throw new Error('Team not found.');
  const source = db.prepare('SELECT status FROM team_roster_sources WHERE teamId = ?').get(teamId);
  if (source?.status === 'inactive' || db.prepare('SELECT id FROM generated_entities WHERE id = ? AND kind = ?').get(teamId,'team')) return false;
  const roster = db.prepare('SELECT * FROM players WHERE teamId = ?').all(teamId);
  if (roster.length >= 3) return true;
  const career=db.prepare('SELECT id FROM careers LIMIT 1').get();
  if (!(career?careerWindow(db,career.id,date):transferWindow(date)).open) return false;
  const target = roster.length ? roster.reduce((sum,p) => sum+p.overall,0)/roster.length : 65;
  const candidates = db.prepare(`SELECT p.* FROM players p JOIN player_affiliations af ON af.playerId = p.id
    WHERE p.teamId IS NULL AND af.status IN ('free_agent','career')
      AND NOT EXISTS (SELECT 1 FROM generated_entities g WHERE g.id = p.id)
    ORDER BY CASE WHEN p.region = ? THEN 0 ELSE 1 END, ABS(p.overall - ?), p.id`).all(team.region,target);
  for (const p of candidates) {
    if (roster.length >= 3) break;
    const salary = Math.round(p.overall*100), bonus=salary;
    const balance = db.prepare('SELECT cashBalance FROM teams WHERE id = ?').get(teamId).cashBalance || 0;
    if (balance < salary+bonus) continue;
    db.prepare('UPDATE players SET teamId = ? WHERE id = ?').run(teamId,p.id);
    db.prepare('UPDATE contracts SET isActive = 0 WHERE playerId = ?').run(p.id);
    db.prepare('INSERT INTO contracts (id,playerId,teamId,salary,duration,startDate,endDate,signingBonus,buyout,isActive) VALUES (?,?,?,?,12,?,?,?, ?,1)')
      .run(uuid(),p.id,teamId,salary,date,addDays(date,365),bonus,salary*6);
    db.prepare('UPDATE teams SET cashBalance = cashBalance - ? WHERE id = ?').run(salary+bonus,teamId);
    db.prepare('INSERT INTO transfers (id,playerId,fromTeamId,toTeamId,fee,date,type) VALUES (?,?,NULL,?,0,?,?)').run(uuid(),p.id,teamId,date,'signing');
    db.prepare('UPDATE player_affiliations SET status = ?, verifiedAt = ?, note = ? WHERE playerId = ?')
      .run('career',date,'Signed within this career simulation; not a reported real-world transfer.',p.id);
    roster.push(p);
  }
  return roster.length >= 3;
}
