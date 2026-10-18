export const TRAINING_CATEGORIES = ['Mechanics', 'Shooting', 'Aerial', 'Defense', 'Positioning', 'Team Play', 'Boost Management', 'Recovery', 'Mental / Pressure', 'Rest'];
export const DEFAULT_TRAINING = TRAINING_CATEGORIES.slice(0, 5).concat(['Mental / Pressure', 'Rest'])
  .map((category, day) => ({ day, category, intensity: day === 6 ? 'Low' : 'Normal' }));
export const TRAINING_ATTRIBUTES: Record<string, string[]> = {
  Mechanics: ['mechanical', 'groundControl'], Shooting: ['shooting', 'shotAccuracy'],
  Aerial: ['aerial', 'recovery'], Defense: ['defense', 'goalkeeping'],
  Positioning: ['positioning', 'rotations'], 'Team Play': ['passing', 'rotations'],
  'Boost Management': ['boostManagement'], Recovery: ['recovery', 'speed'],
  'Mental / Pressure': ['gameSense', 'clutch'], Rest: [],
};
export function addDays(date: string, days: number) {
  const d = new Date(date + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
export function transferWindow(date: string, calendar?:{start:string;end:string}[]) {
  const year = Number(date.slice(0, 4));
  const windows = calendar||[{ start: `${year}-01-01`, end: `${year}-01-31` },
    { start: `${year}-09-01`, end: `${year}-10-31` }];
  const active = windows.find(w => date >= w.start && date <= w.end);
  const next = windows.find(w => w.start > date)?.start || `${year + 1}-${calendar?'09-01':'01-01'}`;
  return { open: !!active, closes: active?.end || null, nextOpens: next,
    label: active ? `Window open until ${active.end}` : `Window closed · Opens ${next}` };
}
export function wageDemands(player: { overall: number; reputation: number }) {
  const base = player.overall >= 95 ? 24000 : player.overall >= 90 ? 16000 : player.overall >= 85 ? 10500 : player.overall >= 80 ? 6800 : 4200;
  const salary = Math.round(base * (1 + (player.reputation || 50) / 200));
  return { salary, bonus: Math.round(salary * 2.5) };
}
// Both the negotiation room and registration use the same acceptance rule.
export function contractOfferScore(offer: { salary: number; bonus: number }, demands: { salary: number; bonus: number }) {
  return offer.salary / demands.salary * .75 + Math.min(offer.bonus / demands.bonus, 1.05) * .25;
}
export function socialImpact(sentiment: 'positive' | 'negative', traits: any = {}) {
  const resistance = Math.max(0, Math.min(100, traits.pressureResistance ?? 50));
  const tilt = Math.max(0, Math.min(100, traits.tiltTendency ?? 50));
  return sentiment === 'positive' ? { morale: 2, confidence: 3 }
    : { morale: -Math.max(1, Math.round(4 * (1 - resistance / 150))),
        confidence: -Math.max(1, Math.round(5 * (1 - resistance / 120) * (.5 + tilt / 100))) };
}
export function canControlFixture(career: any, fixture: any, entered: boolean) {
  if (!career || !fixture) throw new Error('Load a career and select a real fixture.');
  if (![fixture.homeTeamId, fixture.awayTeamId].includes(career.teamId)) throw new Error('You can only manage your own team.');
  if (!entered) throw new Error('Your team has not qualified for this event.');
  if (fixture.scheduledDate > career.currentDate) throw new Error(`This series starts on ${fixture.scheduledDate}. Advance the calendar first.`);
  if (!['scheduled', 'in_progress'].includes(fixture.status)) throw new Error('This series is already complete.');
}
