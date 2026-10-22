export type CompetitionPresentation = {
  id: 'rlcs' | 'worlds' | 'ewc' | 'fifae';
  label: string;
  video: string;
  background: string;
  detailImage?: string;
};

// Specific competitions take precedence over the shared words "World Cup" and
// "World Championship". An invitational alone is not necessarily EWC.
export function competitionPresentation(fixture: {competitionName?: string; competitionType?: string}): CompetitionPresentation | null {
  const name = (fixture.competitionName || '').toUpperCase();
  const type = (fixture.competitionType || '').toUpperCase();
  if (/\bFIFA(?:[\s_-]*E\b|[\s_-]+EWC\b)/.test(name) || ['FIFAE', 'FIFA_EWC', 'FIFAE_WORLD_CUP'].includes(type)) {
    return {id: 'fifae', label: 'FIFAe World Cup', video: '/competitions/fifae.mp4', background: '/competitions/fifae.png', detailImage: '/competitions/fifae-trophy.jpg'};
  }
  if (/ESPORTS\s+WORLD\s+CUP|\bEWC\b/.test(name) || ['EWC', 'EWC_LCQ'].includes(type)) {
    return {id: 'ewc', label: 'Esports World Cup', video: '/competitions/ewc.mp4', background: '/competitions/ewc.png'};
  }
  // LCQs are part of the RLCS circuit, even when their name mentions Worlds.
  const circuit = ['QUALIFIER', 'REGIONAL', 'MAJOR', 'LCQ', 'KICKOFF'].includes(type);
  if (['WORLDS', 'WORLD_CHAMPIONSHIP'].includes(type) || (!circuit && /\bWORLDS\b|WORLD\s+CHAMPIONSHIP/.test(name))) {
    return {id: 'worlds', label: 'RLCS World Championship', video: '/competitions/worlds.mp4', background: '/competitions/worlds.jpg'};
  }
  if (circuit || /\bRLCS\b/.test(name)) {
    const major = type === 'MAJOR' || /\bMAJOR\b/.test(name);
    return {id: 'rlcs', label: major ? 'RLCS Major' : 'RLCS', video: '/competitions/rlcs.mp4', background: major ? '/competitions/rlcs-major.jpg' : '/brand/arena-background.png'};
  }
  return null;
}
