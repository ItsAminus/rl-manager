import catalog from '../../data/garage-items.json';
export const GARAGE_ITEMS = catalog.groups;
export interface ClubBranding {
  name: string;
  shortName: string;
  primary: string;
  secondary: string;
  accent: string;
  slogan: string;
  sponsor: string;
  logoMode: 'official' | 'builder' | 'upload';
  shape: 'shield' | 'circle' | 'diamond';
  emblem: 'initials' | 'bolt' | 'star' | 'crown';
  logo: string | null;
  banner: string | null;
  bannerMode: 'builder' | 'upload';
  jerseyPattern: 'plain' | 'stripes' | 'diagonal';
  awayPrimary: string;
  awaySecondary: string;
  awayAccent: string;
}
export interface CarPreset {
  enabled: boolean;
  name: string;
  bodyId: number;
  wheelsId: number;
  boostId: number;
  finishId: number;
  decalId: number;
  trailId: number;
  goalExplosionId: number;
  paintId: number;
  useClubColors: boolean;
  blue: { primary: string; secondary: string };
  orange: { primary: string; secondary: string };
}
export function defaultBranding(team: any): ClubBranding {
  return {
    name: team.name,
    shortName: team.shortName || team.name.slice(0, 4).toUpperCase(),
    primary: team.broadcastColor || '#8BBF9F',
    secondary: '#121B24',
    accent: '#F3F5F7',
    slogan: 'Built for the next championship.',
    sponsor: '',
    logoMode: 'official',
    shape: 'shield',
    emblem: 'initials',
    logo: null,
    banner: null,
    bannerMode: 'builder',
    jerseyPattern: 'diagonal',
    awayPrimary: '#F3F5F7',
    awaySecondary: '#121B24',
    awayAccent: '#121B24',
  };
}
export function defaultCarPreset(): CarPreset {
  return {
    enabled: false,
    name: 'Match preset',
    bodyId: 23,
    wheelsId: 386,
    boostId: 63,
    finishId: 270,
    decalId: 0,
    trailId: 1948,
    goalExplosionId: 1903,
    paintId: 0,
    useClubColors: false,
    blue: { primary: '#236FE5', secondary: '#F3F5F7' },
    orange: { primary: '#EB992D', secondary: '#121B24' },
  };
}
export function matchLoadout(preset: CarPreset, team: number, brand: ClubBranding) {
  if (!preset.enabled) return undefined;
  const color = preset.useClubColors
    ? { primary: brand.primary, secondary: brand.accent }
    : team === 0
      ? preset.blue
      : preset.orange;
  return {
    car_id: preset.bodyId,
    wheels_id: preset.wheelsId,
    boost_id: preset.boostId,
    paint_finish_id: preset.finishId,
    custom_finish_id: preset.finishId,
    decal_id: preset.decalId,
    trails_id: preset.trailId,
    goal_explosion_id: preset.goalExplosionId,
    car_paint_id: preset.paintId,
    primary: color.primary,
    secondary: color.secondary,
  };
}
