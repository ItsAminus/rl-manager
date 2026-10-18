const fs = require('fs');
const path = require('path');

const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

function randomInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }

const regions = ['EU', 'NA', 'MENA', 'SAM', 'OCE', 'APAC', 'SSA'];
const tendencies = ['MECHANICAL_CARRY', 'STRIKER', 'SUPPORT', 'BALANCED'];

// Generate Teams (24 Teams)
const teamNames = [
  'Team Vitality', 'Karmine Corp', 'BDS', 'Gentle Mates', 'Oxygen Esports', 'Moist Esports', 
  'G2 Stride', 'Gen.G Mobil1', 'Spacestation', 'Luminosity', 'M80', 'Shopify Rebellion',
  'Team Falcons', 'Rule One', 'Twisted Minds',
  'FURIA', 'Complexity', 'NIP',
  'PWR', 'Chiefs', 'Pioneers',
  'Elevate', 'Gladiators', 'Limitless'
];

const teams = teamNames.map((name, i) => {
  let region = 'EU';
  if (i >= 6 && i < 12) region = 'NA';
  else if (i >= 12 && i < 15) region = 'MENA';
  else if (i >= 15 && i < 18) region = 'SAM';
  else if (i >= 18 && i < 21) region = 'OCE';
  else if (i >= 21 && i < 23) region = 'APAC';
  else if (i >= 23) region = 'SSA';

  return {
    id: `team_${i+1}`,
    name: name,
    shortName: name.substring(0, 3).toUpperCase(),
    region: region,
    reputation: randomInt(50, 99),
    budget: randomInt(50000, 2000000),
    cashBalance: randomInt(10000, 500000),
    coachRating: randomInt(50, 95),
    facilityLevel: randomInt(1, 5),
    fanbase: randomInt(1000, 100000),
    sponsorIncome: randomInt(5000, 50000),
    teamChemistry: randomInt(60, 100),
    teamForm: randomInt(40, 90)
  };
});

// Generate Players (80 Players)
const topPros = [
  { gt: 'zen', nat: 'FR', reg: 'EU', age: 17, ovr: 99, pot: 99, tend: 'MECHANICAL_CARRY' },
  { gt: 'Vatira', nat: 'FR', reg: 'EU', age: 18, ovr: 98, pot: 99, tend: 'BALANCED' },
  { gt: 'Atow', nat: 'BE', reg: 'EU', age: 17, ovr: 96, pot: 98, tend: 'MECHANICAL_CARRY' },
  { gt: 'M0nkey M00n', nat: 'FR', reg: 'EU', age: 21, ovr: 97, pot: 97, tend: 'SUPPORT' },
  { gt: 'Seikoo', nat: 'FR', reg: 'EU', age: 20, ovr: 94, pot: 96, tend: 'STRIKER' },
  { gt: 'ExoTiiK', nat: 'FR', reg: 'EU', age: 20, ovr: 93, pot: 95, tend: 'SUPPORT' },
  { gt: 'dralii', nat: 'MA', reg: 'EU', age: 16, ovr: 95, pot: 99, tend: 'MECHANICAL_CARRY' },
  { gt: 'Oski', nat: 'PL', reg: 'EU', age: 17, ovr: 94, pot: 97, tend: 'STRIKER' },
  { gt: 'Daniel', nat: 'US', reg: 'NA', age: 17, ovr: 97, pot: 99, tend: 'MECHANICAL_CARRY' },
  { gt: 'BeastMode', nat: 'US', reg: 'NA', age: 18, ovr: 98, pot: 99, tend: 'STRIKER' },
  { gt: 'Firstkiller', nat: 'US', reg: 'NA', age: 20, ovr: 96, pot: 97, tend: 'MECHANICAL_CARRY' },
  { gt: 'nass', nat: 'MA', reg: 'NA', age: 16, ovr: 90, pot: 96, tend: 'STRIKER' },
  { gt: 'Rw9', nat: 'SA', reg: 'MENA', age: 17, ovr: 96, pot: 98, tend: 'SUPPORT' },
  { gt: 'Kiileerrz', nat: 'SA', reg: 'MENA', age: 17, ovr: 95, pot: 98, tend: 'STRIKER' },
  { gt: 'Nwpo', nat: 'SA', reg: 'MENA', age: 17, ovr: 96, pot: 99, tend: 'MECHANICAL_CARRY' },
  { gt: 'TRK511', nat: 'SA', reg: 'MENA', age: 19, ovr: 94, pot: 96, tend: 'BALANCED' },
  { gt: 'yanxnz', nat: 'BR', reg: 'SAM', age: 19, ovr: 95, pot: 96, tend: 'STRIKER' },
  { gt: 'Lostt', nat: 'BR', reg: 'SAM', age: 18, ovr: 93, pot: 95, tend: 'MECHANICAL_CARRY' },
  { gt: 'drufinho', nat: 'BR', reg: 'SAM', age: 18, ovr: 91, pot: 94, tend: 'SUPPORT' },
  { gt: 'Joyo', nat: 'GB', reg: 'EU', age: 18, ovr: 94, pot: 96, tend: 'MECHANICAL_CARRY' }
];

const generatedNames = ['Alpha54', 'Radosin', 'Rise', 'Archie', 'Joreuz', 'AppJack', 'Chronic', 'Noly', 'Retals', 'Arsenal', 'AyyJayy', 'Mist', 'Sypical', 'Atomic', 'Chicago', 'JKnaps', 'GarrettG', 'Squishy', 'Justin', 'Ahmad', 'Khalid', 'Fever', 'Superlachie', 'Kamii', 'Amphis', 'Torsos', 'Reysbull', 'Crr', 'Dorito', 'Acronik', 'Itachi', 'Aztral', 'Kash', 'Eekso', 'RelatingWave', 'Metsanauris', 'Extra', 'Marc_by_8', 'Monkey', 'Rizzo', 'Kro', 'Sadjunior', 'Torment', 'Gimmick', 'ScrubKilla', 'FairyPeak', 'Kaydop', 'Turbopolsa', 'ViolentPanda', 'Deevo', 'Kuxir97', 'Markydooda', 'Paschy90', 'Sikii', 'Remkoe', 'Maestro', 'Greazy', 'Mognus', 'Al0t', 'Linus'];

const players = [];

// Helper to gen attributes
function genAttrs(ovr) {
  const base = ovr - 10;
  return {
    mechanical: randomInt(base, 99),
    aerial: randomInt(base, 99),
    groundControl: randomInt(base, 99),
    shooting: randomInt(base, 99),
    shotPower: randomInt(base, 99),
    shotAccuracy: randomInt(base, 99),
    passing: randomInt(base, 99),
    defense: randomInt(base, 99),
    goalkeeping: randomInt(base, 99),
    positioning: randomInt(base, 99),
    rotations: randomInt(base, 99),
    boostManagement: randomInt(base, 99),
    speed: randomInt(base, 99),
    recovery: randomInt(base, 99),
    fiftyFifty: randomInt(base, 99),
    demolitions: randomInt(base, 99),
    gameSense: randomInt(base, 99),
    consistency: randomInt(base, 99),
    clutch: randomInt(base, 99)
  };
}

function genTraits() {
  return {
    aggression: randomInt(1, 99),
    riskTolerance: randomInt(1, 99),
    teamOrientation: randomInt(1, 99),
    adaptability: randomInt(1, 99),
    pressureResistance: randomInt(1, 99),
    developmentRate: randomInt(1, 99),
    professionalism: randomInt(1, 99),
    confidence: randomInt(1, 99),
    tiltTendency: randomInt(1, 99)
  };
}

let pId = 1;

// Add top pros
topPros.forEach(p => {
  players.push({
    id: `player_${pId++}`,
    gamertag: p.gt,
    realName: p.gt + ' Name',
    nationality: p.nat,
    region: p.reg,
    age: p.age,
    teamId: null, // Will assign in seed
    preferredTendency: p.tend,
    overall: p.ovr,
    potential: p.pot,
    form: 50, morale: 80, fatigue: 0, consistency: randomInt(70, 99), chemistry: 50,
    reputation: randomInt(80, 99),
    careerEarnings: randomInt(50000, 500000),
    marketValue: randomInt(100000, 1000000),
    scoutKnowledge: 'FULL',
    attributes: genAttrs(p.ovr),
    traits: genTraits()
  });
});

// Generate remaining up to 80
generatedNames.forEach(name => {
  if (players.length >= 80) return;
  const ovr = randomInt(70, 92);
  players.push({
    id: `player_${pId++}`,
    gamertag: name,
    realName: name + ' Name',
    nationality: 'US',
    region: regions[randomInt(0, regions.length-1)],
    age: randomInt(15, 25),
    teamId: null,
    preferredTendency: tendencies[randomInt(0, tendencies.length-1)],
    overall: ovr,
    potential: randomInt(ovr, 99),
    form: 50, morale: 70, fatigue: 0, consistency: randomInt(40, 90), chemistry: 50,
    reputation: randomInt(20, 80),
    careerEarnings: randomInt(0, 100000),
    marketValue: randomInt(10000, 200000),
    scoutKnowledge: 'UNKNOWN',
    attributes: genAttrs(ovr),
    traits: genTraits()
  });
});

// Assign players to teams
let pIndex = 0;
teams.forEach(team => {
  for(let i=0; i<3; i++) {
    if(pIndex < players.length) {
      players[pIndex].teamId = team.id;
      players[pIndex].region = team.region; // align region
      pIndex++;
    }
  }
});

const competitions = [
  {
    id: "comp_1",
    name: "RLCS Major 1",
    region: "GLOBAL",
    type: "MAJOR",
    format: "SWISS_INTO_SINGLE_ELIM",
    prizePool: 250000,
    config: { seriesFormat: "BO5" }
  },
  {
    id: "comp_2",
    name: "EU Regional 1",
    region: "EU",
    type: "REGIONAL",
    format: "SWISS_INTO_SINGLE_ELIM",
    prizePool: 100000,
    config: { seriesFormat: "BO5" }
  },
  {
    id: "comp_3",
    name: "NA Regional 1",
    region: "NA",
    type: "REGIONAL",
    format: "SWISS_INTO_SINGLE_ELIM",
    prizePool: 100000,
    config: { seriesFormat: "BO5" }
  }
];

fs.writeFileSync(path.join(dataDir, 'teams.json'), JSON.stringify(teams, null, 2));
fs.writeFileSync(path.join(dataDir, 'players.json'), JSON.stringify(players, null, 2));
fs.writeFileSync(path.join(dataDir, 'competitions.json'), JSON.stringify(competitions, null, 2));

console.log('Generated data successfully.');
