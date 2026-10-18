export type CareerMode = 'Manager Career' | 'Path To Glory';
export const isPath = (c: any) => c?.mode === 'Path To Glory';
export function careerMode(db: any, id: string): CareerMode {
  return db.prepare('SELECT mode FROM career_modes WHERE careerId=?').get(id)?.mode ===
    'Path To Glory'
    ? 'Path To Glory'
    : 'Manager Career';
}
