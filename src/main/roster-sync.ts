import type { AppDatabase } from './database';

export interface RealRosterSnapshot {
  version: string; verifiedAt: string;
  teams: { id: string; name: string; shortName: string; region: string; status: string; starters: string[]; reserves?: string[]; inactivePlayers?: string[]; starterIds?: string[]; reserveIds?: string[]; inactiveIds?: string[]; rosterDate?: string; source: string; note?: string }[];
  freeAgents: string[]; freeAgentSources: Record<string, string>;
  ratingVersion?: string;
}

// A versioned update, not a recurring overwrite of career transfers/training.
export function applyRealRosterSnapshot(db: AppDatabase, snapshot: RealRosterSnapshot, players: any[], teams: any[], backup: () => void = () => {}) {
  const key = 'real_rosters_version';
  if (db.prepare('SELECT value FROM settings WHERE key = ?').get(key)?.value === snapshot.version) return false;
  const tagIds = new Map(players.map(p => [p.gamertag.toLowerCase(), p.id]));
  const ids = new Set(players.map(p => p.id));
  const rosterIds = (t: RealRosterSnapshot['teams'][number], role: 'starter'|'reserve'|'inactive'): string[] => {
    const explicit = role === 'starter' ? t.starterIds : role === 'reserve' ? t.reserveIds : t.inactiveIds;
    const tags = role === 'starter' ? t.starters : role === 'reserve' ? t.reserves || [] : t.inactivePlayers || [];
    return explicit || tags.map(tag => tagIds.get(tag.toLowerCase())!);
  };
  const assigned = snapshot.teams.flatMap(t => [...rosterIds(t,'starter'), ...rosterIds(t,'reserve'), ...rosterIds(t,'inactive')]);
  if (new Set(assigned).size !== assigned.length || assigned.some(id => !ids.has(id))) throw new Error('The real roster snapshot contains duplicate or missing players.');
  if (snapshot.teams.some(t => t.status === 'active' && t.starters.length !== 3)) throw new Error('An active real club must have three confirmed starters.');
  backup();
  db.transaction(() => {
    const realIds = new Set(snapshot.teams.map(t => t.id));
    const transferred = new Set(db.prepare('SELECT DISTINCT playerId FROM transfers').all().map(p => p.playerId));
    const protectedIds = new Set<string>(transferred);
    // Custom career signings made by older versions did not always create a transfer record.
    for (const p of db.prepare('SELECT id, teamId FROM players WHERE teamId IS NOT NULL').all()) {
      if (!realIds.has(p.teamId) && !db.prepare('SELECT id FROM generated_entities WHERE id = ? AND kind = ?').get(p.teamId, 'team')) protectedIds.add(p.id);
    }
    // Archive invented identities without deleting old match statistics.
    if (snapshot.ratingVersion) {
      db.prepare("UPDATE players SET teamId = NULL WHERE id IN (SELECT id FROM generated_entities WHERE kind = 'player')").run();
      db.prepare("UPDATE contracts SET isActive = 0 WHERE playerId IN (SELECT id FROM generated_entities WHERE kind = 'player')").run();
    }
    const existingPlayers = new Map(db.prepare('SELECT * FROM players').all().map(p => [p.id,p]));
    const existingAttrs = new Map(db.prepare('SELECT * FROM player_attributes').all().map(p => [p.playerId,p]));
    const oldRatings = new Map(db.prepare('SELECT * FROM player_rating_sources').all().map(p => [p.playerId,p]));
    const hasCareer = !!db.prepare('SELECT id FROM careers LIMIT 1').get();
    const teamSources = new Map(snapshot.teams.map(t => [t.id,t.source]));
    for (const t of teams) {
      db.prepare('INSERT OR IGNORE INTO teams (id, name, shortName, region, reputation, budget, cashBalance, coachRating, facilityLevel, fanbase, sponsorIncome, teamChemistry, teamForm) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .run(t.id,t.name,t.shortName,t.region,t.reputation,t.budget,t.cashBalance,t.coachRating,t.facilityLevel,t.fanbase,t.sponsorIncome,t.teamChemistry,t.teamForm);
    }
    for (const t of snapshot.teams) {
      db.prepare('UPDATE teams SET name = ?, shortName = ?, region = ? WHERE id = ?').run(t.name,t.shortName,t.region,t.id);
      db.prepare('INSERT OR REPLACE INTO team_roster_sources (teamId, status, verifiedAt, source, note, starterIds) VALUES (?, ?, ?, ?, ?, ?)')
        .run(t.id,t.status,t.rosterDate || snapshot.verifiedAt,t.source,t.note || '',JSON.stringify(rosterIds(t,'starter')));
      // Remove previous fictional academy fills from these real organizations.
      for (const p of db.prepare('SELECT p.id FROM players p JOIN generated_entities g ON g.id = p.id WHERE p.teamId = ?').all(t.id)) {
        if (protectedIds.has(p.id)) continue;
        db.prepare('UPDATE players SET teamId = NULL WHERE id = ?').run(p.id);
        db.prepare('UPDATE contracts SET isActive = 0 WHERE playerId = ?').run(p.id);
      }
    }
    for (const p of players) {
      db.prepare('INSERT OR IGNORE INTO players (id, gamertag, realName, nationality, region, age, teamId, preferredTendency, overall, potential, form, morale, fatigue, consistency, chemistry, reputation, careerEarnings, marketValue, scoutKnowledge) VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .run(p.id,p.gamertag,p.realName,p.nationality,p.region,p.age,p.preferredTendency,p.overall,p.potential,p.form,p.morale,p.fatigue,p.consistency,p.chemistry,p.reputation,p.careerEarnings,p.marketValue,p.scoutKnowledge);
      const attributes = Object.entries(p.attributes || {});
      if (attributes.length) db.prepare(`INSERT OR IGNORE INTO player_attributes (playerId, ${attributes.map(([k]) => k).join(', ')}) VALUES (${Array(attributes.length+1).fill('?').join(',')})`).run(p.id,...attributes.map(([,v]) => v));
      const traits = Object.entries(p.traits || {});
      if (traits.length) db.prepare(`INSERT OR IGNORE INTO player_traits (playerId, ${traits.map(([k]) => k).join(', ')}) VALUES (${Array(traits.length+1).fill('?').join(',')})`).run(p.id,...traits.map(([,v]) => v));
      if (snapshot.ratingVersion) {
        const previous = existingPlayers.get(p.id), old = oldRatings.get(p.id);
        const earned = old || hasCareer ? Math.max(0,(previous?.overall || 0)-(old?.baseline ?? p.previousOverall ?? p.overall)) : 0;
        const overall = Math.min(99,p.overall+earned);
        const potential = Math.min(99,Math.max(overall,p.potential+earned));
        db.prepare('UPDATE players SET gamertag = ?, realName = ?, nationality = ?, age = ?, overall = ?, potential = ?, marketValue = ?, reputation = ?, preferredTendency = ? WHERE id = ?')
          .run(p.gamertag,p.realName ?? null,p.nationality ?? null,p.age ?? null,overall,potential,p.marketValue,p.reputation,p.preferredTendency,p.id);
        const priorAttrs = old?.attributes ? JSON.parse(old.attributes) : p.previousAttributes || p.attributes;
        const previousAttrs = existingAttrs.get(p.id);
        if (attributes.length) {
          const adjusted = attributes.map(([attr,base]) => {
            const growth = old || hasCareer ? Math.max(0,(previousAttrs?.[attr] || 0)-(priorAttrs[attr] || base)) : 0;
            return Math.min(99,Number(base)+growth);
          });
          db.prepare(`UPDATE player_attributes SET ${attributes.map(([attr]) => `${attr} = ?`).join(',')} WHERE playerId = ?`).run(...adjusted,p.id);
        }
        db.prepare('INSERT OR REPLACE INTO player_rating_sources (playerId,version,baseline,potential,attributes,confidence,method,sources,reviewedAt) VALUES (?,?,?,?,?,?,?,?,?)')
          .run(p.id,snapshot.ratingVersion,p.overall,p.potential,JSON.stringify(p.attributes),p.ratingConfidence,p.ratingMethod,JSON.stringify(p.ratingSources || []),snapshot.verifiedAt);
      }
      if (protectedIds.has(p.id)) continue;
      const previous = db.prepare('SELECT teamId FROM players WHERE id = ?').get(p.id)?.teamId;
      const oldContract = db.prepare('SELECT * FROM contracts WHERE playerId = ? AND isActive = 1 LIMIT 1').get(p.id);
      db.prepare('UPDATE players SET teamId = ?, region = ? WHERE id = ?').run(p.teamId || null,p.region,p.id);
      if (previous !== p.teamId || !p.teamId) db.prepare('UPDATE contracts SET isActive = 0 WHERE playerId = ?').run(p.id);
      if (p.teamId && !db.prepare('SELECT id FROM contracts WHERE playerId = ? AND teamId = ? AND isActive = 1').get(p.id,p.teamId)) {
        db.prepare('INSERT INTO contracts (id, playerId, teamId, salary, duration, startDate, endDate, signingBonus, buyout, isActive) VALUES (?, ?, ?, ?, 24, ?, ?, 0, ?, 1)')
          .run(`${snapshot.version}_${p.id}`,p.id,p.teamId,oldContract?.salary || Math.round(p.overall*180),snapshot.verifiedAt,'2028-10-10',oldContract?.buyout || Math.round(p.overall*180*6));
      }
      const source = p.teamId ? teamSources.get(p.teamId) : snapshot.freeAgentSources[p.gamertag] || '';
      db.prepare('INSERT OR REPLACE INTO player_affiliations (playerId, status, verifiedAt, source, note) VALUES (?, ?, ?, ?, ?)')
        .run(p.id,p.affiliationStatus || 'unverified',snapshot.verifiedAt,source || '',p.affiliationNote || '');
    }
    // Saved lineup order must no longer point to departed players.
    for (const career of db.prepare('SELECT id, teamId FROM careers').all()) {
      const row = db.prepare('SELECT players FROM career_lineup WHERE careerId = ?').get(career.id);
      if (row) {
        const ids: string[] = JSON.parse(row.players);
        if (ids.some(id => !db.prepare('SELECT id FROM players WHERE id = ? AND teamId = ?').get(id,career.teamId))) db.prepare('DELETE FROM career_lineup WHERE careerId = ?').run(career.id);
      }
    }
    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key,snapshot.version);
  })();
  return true;
}

// Historical series remain intact. Pending legacy or withdrawn entries are
// replaced by unused, complete real squads from the same region.
export function repairFutureRosterEntries(db: AppDatabase, careerId: string) {
  const career = db.prepare('SELECT * FROM careers WHERE id = ?').get(careerId);
  if (!career) return;
  db.transaction(() => {
    const pool = db.prepare(`SELECT t.* FROM teams t LEFT JOIN team_roster_sources rs ON rs.teamId = t.id
      WHERE COALESCE(rs.status,'active') != 'inactive' AND NOT EXISTS(SELECT 1 FROM generated_entities g WHERE g.id = t.id)
        AND (SELECT COUNT(*) FROM players p WHERE p.teamId = t.id) >= 3 ORDER BY t.reputation DESC, t.id`).all();
    const competitions = db.prepare("SELECT c.id FROM competitions c JOIN career_competitions cc ON cc.competitionId = c.id WHERE cc.careerId = ? AND c.status != 'completed'").all(careerId);
    const used = new Map(competitions.map(c => [c.id,new Set(db.prepare('SELECT teamId FROM competition_entries WHERE competitionId = ?').all(c.id).map(t => t.teamId))]));
    const entries = db.prepare(`SELECT ce.*, c.region FROM competition_entries ce JOIN career_competitions cc ON cc.competitionId = ce.competitionId JOIN competitions c ON c.id = ce.competitionId
      LEFT JOIN team_roster_sources rs ON rs.teamId = ce.teamId WHERE cc.careerId = ? AND c.status != 'completed' AND ce.teamId != ?
      AND (rs.status = 'inactive' OR EXISTS(SELECT 1 FROM generated_entities g WHERE g.id = ce.teamId)
        OR (SELECT COUNT(*) FROM players p WHERE p.teamId = ce.teamId) < 3)`).all(careerId,career.teamId);
    for (const entry of entries) {
      const started = db.prepare("SELECT id FROM fixtures WHERE competitionId = ? AND (homeTeamId = ? OR awayTeamId = ?) AND status = 'in_progress'").get(entry.competitionId,entry.teamId,entry.teamId);
      if (started) continue;
      const pending = db.prepare("SELECT id FROM fixtures WHERE competitionId = ? AND (homeTeamId = ? OR awayTeamId = ?) AND status = 'scheduled' LIMIT 1").get(entry.competitionId,entry.teamId,entry.teamId);
      const bye = db.prepare('SELECT teamId FROM competition_byes WHERE competitionId = ? AND teamId = ?').get(entry.competitionId,entry.teamId);
      if (!pending && !bye) continue;
      const region = entry.region === 'GLOBAL' ? db.prepare('SELECT region FROM teams WHERE id = ?').get(entry.teamId).region : entry.region;
      const replacement = pool.find(t => t.region === region && t.id !== career.teamId && !used.get(entry.competitionId)?.has(t.id))?.id;
      if (!replacement) {
        // With fewer confirmed real entrants, withdrawals become walkovers.
        // Never duplicate an already-entered squad to fill an artificial target.
        for (const f of db.prepare("SELECT * FROM fixtures WHERE competitionId = ? AND (homeTeamId = ? OR awayTeamId = ?) AND status = 'scheduled'").all(entry.competitionId,entry.teamId,entry.teamId)) {
          const required = Math.floor(Number(String(f.seriesFormat).match(/\d+/)?.[0] || 3)/2)+1;
          const home = pool.some(t => t.id === f.homeTeamId), away = pool.some(t => t.id === f.awayTeamId);
          db.prepare("UPDATE fixtures SET status = 'completed', homeScore = ?, awayScore = ? WHERE id = ?").run(home ? required : 0,away ? required : 0,f.id);
        }
        db.prepare('DELETE FROM competition_byes WHERE competitionId = ? AND teamId = ?').run(entry.competitionId,entry.teamId);
        continue;
      }
      used.get(entry.competitionId)?.add(replacement);
      db.prepare('INSERT OR IGNORE INTO competition_entries (competitionId, teamId, groupName, seed) VALUES (?, ?, ?, ?)').run(entry.competitionId,replacement,entry.groupName,entry.seed);
      db.prepare("UPDATE fixtures SET homeTeamId = ? WHERE competitionId = ? AND homeTeamId = ? AND status = 'scheduled'").run(replacement,entry.competitionId,entry.teamId);
      db.prepare("UPDATE fixtures SET awayTeamId = ? WHERE competitionId = ? AND awayTeamId = ? AND status = 'scheduled'").run(replacement,entry.competitionId,entry.teamId);
      db.prepare('UPDATE competition_byes SET teamId = ? WHERE competitionId = ? AND teamId = ?').run(replacement,entry.competitionId,entry.teamId);
      if (!db.prepare('SELECT id FROM fixtures WHERE competitionId = ? AND (homeTeamId = ? OR awayTeamId = ?)').get(entry.competitionId,entry.teamId,entry.teamId)) db.prepare('DELETE FROM competition_entries WHERE competitionId = ? AND teamId = ?').run(entry.competitionId,entry.teamId);
    }
  })();
}
