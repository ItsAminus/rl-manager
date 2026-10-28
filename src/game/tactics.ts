export const MATCH_ROLES = ['First Man (Primary Striker / Disruptor)', 'Second Man (Playmaker / Midfield Infield)', 'Third Man / Anchor (Last Man Back / Goal Defense)'];
export const TACTIC_CHOICES: Record<string, string[]> = {
  overallStyle: ['Defensive', 'Balanced', 'Aggressive'], challengeFreq: ['Conservative', 'Balanced', 'Aggressive'],
  rotation: ['Structured', 'Balanced', 'Fluid'], boostPriority: ['Conservative', 'Balanced', 'Heavy'],
  demoFreq: ['Low', 'Normal', 'High'], passingStyle: ['Solo Focus', 'Balanced', 'Passing Focus'], pressure: ['Low', 'Medium', 'High'],
  supportDepth:['Close','Balanced','Deep'],outletWidth:['Narrow','Balanced','Wide'],demoTarget:['Star player','Nearest opponent','Last defender'],boostReserve:['0','15','30'],
};
export const DEFAULT_TACTICS = { supportDepth:'Balanced',outletWidth:'Balanced',demoTarget:'Star player',boostReserve:'0',overallStyle: 'Balanced', challengeFreq: 'Balanced', rotation: 'Structured', boostPriority: 'Balanced', demoFreq: 'Normal', passingStyle: 'Balanced', pressure: 'Medium', roles: Object.fromEntries(MATCH_ROLES.map((role, i) => [i, role])) };
export const playerMatchRole=(plan:any,playerId:string,index:number)=>plan.rolesByPlayer?.[playerId]??plan.roles?.[index]??MATCH_ROLES[index];
export function bindTactics(plan:any,players:any[]){
  const rolesByPlayer={...plan.rolesByPlayer};
  players.forEach((p,i)=>{rolesByPlayer[p.id]??=plan.roles?.[i]??MATCH_ROLES[i];});
  return {...plan,rolesByPlayer,roles:Object.fromEntries(players.map((p,i)=>[i,rolesByPlayer[p.id]]))};
}
export function tacticalFit(players: any[], plan: any = {}) {
  if (!players.length) return 50;
  const skills = (p: any, fields: string[]) => fields.reduce((sum, field) => sum + (p.attributes?.[field] ?? p[field] ?? p.overall), 0) / fields.length;
  return Math.round(players.reduce((sum, p, i) => {
    const fields = [plan.overallStyle === 'Aggressive' ? 'shooting' : plan.overallStyle === 'Defensive' ? 'defense' : 'gameSense',
      plan.challengeFreq === 'Aggressive' ? 'fiftyFifty' : 'positioning', plan.rotation === 'Fluid' ? 'recovery' : 'rotations',
      plan.boostPriority === 'Heavy' ? 'speed' : 'boostManagement', plan.demoFreq === 'High' ? 'demolitions' : 'positioning',
      plan.passingStyle === 'Solo Focus' ? 'groundControl' : 'passing', plan.pressure === 'High' ? 'speed' : 'gameSense',
      playerMatchRole(plan,p.id,i) === MATCH_ROLES[0] ? 'shooting' : playerMatchRole(plan,p.id,i) === MATCH_ROLES[2] ? 'defense' : 'passing'];
    return sum + skills(p, fields);
  }, 0) / players.length);
}
export function tacticalAdjustment(players: any[], plan: any) {
  if (!plan?.overallStyle || !players.length) return 0;
  const average = players.reduce((sum, p) => sum + p.overall, 0) / players.length;
  return Math.max(-3, Math.min(3, (tacticalFit(players, plan) - average) * .15));
}
