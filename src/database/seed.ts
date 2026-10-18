import * as fs from 'fs';
import * as path from 'path';

export function seedDatabase(dbService: any) {
  console.log('Starting database seed...');
  
  const dataDir = path.join(__dirname, '../../data');
  
  const teamsData = JSON.parse(fs.readFileSync(path.join(dataDir, 'teams.json'), 'utf8'));
  const playersData = JSON.parse(fs.readFileSync(path.join(dataDir, 'players.json'), 'utf8'));
  const compsData = JSON.parse(fs.readFileSync(path.join(dataDir, 'competitions.json'), 'utf8'));

  dbService.transaction(() => {
    // 1. Insert Teams
    const insertTeam = dbService.db.prepare(`
      INSERT OR REPLACE INTO teams (id, name, shortName, region, reputation, budget, cashBalance, coachRating, facilityLevel, fanbase, sponsorIncome, teamChemistry, teamForm)
      VALUES (@id, @name, @shortName, @region, @reputation, @budget, @cashBalance, @coachRating, @facilityLevel, @fanbase, @sponsorIncome, @teamChemistry, @teamForm)
    `);
    teamsData.forEach((t: any) => insertTeam.run(t));

    // 2. Insert Players & Attributes & Traits
    const insertPlayer = dbService.db.prepare(`
      INSERT OR REPLACE INTO players (id, gamertag, realName, nationality, region, age, teamId, preferredTendency, overall, potential, form, morale, fatigue, consistency, chemistry, reputation, careerEarnings, marketValue, scoutKnowledge)
      VALUES (@id, @gamertag, @realName, @nationality, @region, @age, @teamId, @preferredTendency, @overall, @potential, @form, @morale, @fatigue, @consistency, @chemistry, @reputation, @careerEarnings, @marketValue, @scoutKnowledge)
    `);
    
    const insertAttrs = dbService.db.prepare(`
      INSERT OR REPLACE INTO player_attributes (playerId, mechanical, aerial, groundControl, shooting, shotPower, shotAccuracy, passing, defense, goalkeeping, positioning, rotations, boostManagement, speed, recovery, fiftyFifty, demolitions, gameSense, consistency, clutch)
      VALUES (@playerId, @mechanical, @aerial, @groundControl, @shooting, @shotPower, @shotAccuracy, @passing, @defense, @goalkeeping, @positioning, @rotations, @boostManagement, @speed, @recovery, @fiftyFifty, @demolitions, @gameSense, @consistency, @clutch)
    `);

    const insertTraits = dbService.db.prepare(`
      INSERT OR REPLACE INTO player_traits (playerId, aggression, riskTolerance, teamOrientation, adaptability, pressureResistance, developmentRate, professionalism, confidence, tiltTendency)
      VALUES (@playerId, @aggression, @riskTolerance, @teamOrientation, @adaptability, @pressureResistance, @developmentRate, @professionalism, @confidence, @tiltTendency)
    `);

    playersData.forEach((p: any) => {
      insertPlayer.run(p);
      insertAttrs.run({ playerId: p.id, ...p.attributes });
      insertTraits.run({ playerId: p.id, ...p.traits });
    });

    // 3. Insert Competitions
    const insertComp = dbService.db.prepare(`
      INSERT OR REPLACE INTO competitions (id, name, region, type, format, prizePool, status, config)
      VALUES (@id, @name, @region, @type, @format, @prizePool, 'UPCOMING', @config)
    `);
    compsData.forEach((c: any) => {
      insertComp.run({ ...c, config: JSON.stringify(c.config) });
    });

    console.log('Seed completed successfully.');
  });
}
