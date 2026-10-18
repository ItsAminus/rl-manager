import type { AppDatabase } from './database';
import {
  defaultBranding,
  defaultCarPreset,
  GARAGE_ITEMS,
  matchLoadout,
  type ClubBranding,
  type CarPreset,
} from '../game/club-design';
import { broadcastColor } from '../services/broadcast-colors';
const json = (s: string) => {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
};
const text = (s: unknown, max: number, required = false) => {
  if (typeof s !== 'string' || s.length > max || /[\x00-\x1f]/.test(s) || (required && !s.trim()))
    throw Error('Enter valid club text.');
  return s.trim();
};
const color = (s: unknown) => {
  if (typeof s !== 'string' || !/^#[0-9a-f]{6}$/i.test(s)) throw Error('Choose a valid colour.');
  return s.toUpperCase();
};
const choice = (s: any, values: any[]) => {
  if (!values.includes(s)) throw Error('Choose a supported design option.');
  return s;
};
export function validClubPng(value: unknown): string | null {
  if (value === null || value === '') return null;
  if (
    typeof value !== 'string' ||
    value.length > 2800000 ||
    !/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(value)
  )
    throw Error('Use a PNG image smaller than 2 MB.');
  const bytes = Buffer.from(value.split(',')[1], 'base64');
  if (
    bytes.length < 33 ||
    !bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ||
    bytes.toString('ascii', 12, 16) !== 'IHDR'
  )
    throw Error('The image is not a valid PNG.');
  const width = bytes.readUInt32BE(16),
    height = bytes.readUInt32BE(20);
  if (!width || !height || width > 2048 || height > 2048)
    throw Error('Images must be no larger than 2048 pixels.');
  return value;
}
export class ClubStudio {
  constructor(private db: AppDatabase) {}
  private career(id: string) {
    const c = this.db.prepare('SELECT * FROM careers WHERE id=?').get(id);
    if (!c) throw Error('Career not found.');
    return c;
  }
  branding(id: string): ClubBranding {
    const c = this.career(id),
      team = this.db.prepare('SELECT * FROM teams WHERE id=?').get(c.teamId);
    return {
      ...defaultBranding({ ...team, broadcastColor: broadcastColor(team) }),
      ...json(this.db.prepare('SELECT data FROM club_designs WHERE careerId=?').get(id)?.data),
    };
  }
  decorate(team: any, id: string | null) {
    if (!team || !id) return team;
    const row = this.db
      .prepare('SELECT teamId,data FROM club_designs WHERE careerId=? AND teamId=?')
      .get(id, team.id);
    return row
      ? { ...team, branding: json(row.data), broadcastColor: json(row.data)?.primary }
      : team;
  }
  saveBranding(id: string, input: ClubBranding) {
    const c = this.career(id);
    if (!input) throw Error('Design not supplied.');
    const brand: ClubBranding = {
      name: text(input.name, 50, true),
      shortName: text(input.shortName, 6, true),
      primary: color(input.primary),
      secondary: color(input.secondary),
      accent: color(input.accent),
      awayPrimary: color(input.awayPrimary),
      awaySecondary: color(input.awaySecondary),
      awayAccent: color(input.awayAccent),
      slogan: text(input.slogan, 80),
      sponsor: text(input.sponsor, 30),
      logoMode: choice(input.logoMode, ['official', 'builder', 'upload']),
      bannerMode: choice(input.bannerMode, ['builder', 'upload']),
      shape: choice(input.shape, ['shield', 'circle', 'diamond']),
      emblem: choice(input.emblem, ['initials', 'bolt', 'star', 'crown']),
      jerseyPattern: choice(input.jerseyPattern, ['plain', 'stripes', 'diagonal']),
      logo: validClubPng(input.logo),
      banner: validClubPng(input.banner),
    };
    if (brand.logoMode !== 'official' && !brand.logo)
      throw Error('Create or upload your crest before saving.');
    if (brand.logoMode === 'official') brand.logo = null;
    if (brand.bannerMode === 'upload' && !brand.banner)
      throw Error('Choose your banner image before saving.');
    this.db.transaction(() => {
      const old = this.db.prepare('SELECT * FROM club_designs WHERE careerId=?').get(id),
        team = this.db.prepare('SELECT * FROM teams WHERE id=?').get(c.teamId);
      this.db
        .prepare(
          'INSERT OR REPLACE INTO club_designs(careerId,teamId,data,originalName,originalShortName) VALUES(?,?,?,?,?)'
        )
        .run(
          id,
          c.teamId,
          JSON.stringify(brand),
          old?.originalName || team.name,
          old?.originalShortName ?? team.shortName
        );
      this.db
        .prepare('UPDATE teams SET name=?,shortName=? WHERE id=?')
        .run(brand.name, brand.shortName, c.teamId);
    })();
    return { success: true, branding: brand };
  }
  resetBranding(id: string) {
    const c = this.career(id),
      old = this.db.prepare('SELECT * FROM club_designs WHERE careerId=?').get(id);
    this.db.transaction(() => {
      if (old)
        this.db
          .prepare('UPDATE teams SET name=?,shortName=? WHERE id=?')
          .run(old.originalName, old.originalShortName, c.teamId);
      this.db.prepare('DELETE FROM club_designs WHERE careerId=?').run(id);
    })();
    return { success: true, branding: this.branding(id) };
  }
  preset(id: string, player: string): CarPreset {
    return (
      json(
        this.db
          .prepare('SELECT data FROM squad_car_presets WHERE careerId=? AND playerId=?')
          .get(id, player)?.data
      ) || defaultCarPreset()
    );
  }
  garage(id: string) {
    const c = this.career(id);
    return {
      success: true,
      branding: this.branding(id),
      players: this.db
        .prepare('SELECT id,gamertag,overall FROM players WHERE teamId=? ORDER BY overall DESC')
        .all(c.teamId)
        .map((p) => ({ ...p, preset: this.preset(id, p.id) })),
      items: GARAGE_ITEMS,
    };
  }
  savePreset(id: string, player: string, input: CarPreset) {
    const c = this.career(id);
    if (!this.db.prepare('SELECT id FROM players WHERE id=? AND teamId=?').get(player, c.teamId))
      throw Error('Only your current squad can use this garage.');
    if (!input) throw Error('Preset not supplied.');
    const item = (group: keyof typeof GARAGE_ITEMS, value: number) => {
      if (!Number.isInteger(value) || !GARAGE_ITEMS[group].some((x: any) => x.id === value))
        throw Error('Choose a supported car item.');
      return value;
    };
    const p: CarPreset = {
      enabled: !!input.enabled,
      name: text(input.name, 32, true),
      bodyId: item('bodies', input.bodyId),
      wheelsId: item('wheels', input.wheelsId),
      boostId: item('boosts', input.boostId),
      finishId: item('finishes', input.finishId),
      decalId: item('decals', input.decalId),
      trailId: item('trails', input.trailId),
      goalExplosionId: item('explosions', input.goalExplosionId),
      paintId: choice(input.paintId, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]),
      useClubColors: !!input.useClubColors,
      blue: { primary: color(input.blue?.primary), secondary: color(input.blue?.secondary) },
      orange: { primary: color(input.orange?.primary), secondary: color(input.orange?.secondary) },
    };
    const decal = GARAGE_ITEMS.decals.find((x) => x.id === p.decalId);
    if (decal?.bodyId && decal.bodyId !== p.bodyId)
      throw Error('That decal belongs to a different car body.');
    this.db
      .prepare('INSERT OR REPLACE INTO squad_car_presets(careerId,playerId,data) VALUES(?,?,?)')
      .run(id, player, JSON.stringify(p));
    return { success: true, preset: p };
  }
  resetPreset(id: string, player: string) {
    const c = this.career(id);
    if (!this.db.prepare('SELECT id FROM players WHERE id=? AND teamId=?').get(player, c.teamId))
      throw Error('Player not in your squad.');
    this.db
      .prepare('DELETE FROM squad_car_presets WHERE careerId=? AND playerId=?')
      .run(id, player);
    return { success: true, preset: defaultCarPreset() };
  }
  coordinate(id: string) {
    const c = this.career(id);
    this.db.transaction(() => {
      for (const p of this.db.prepare('SELECT id FROM players WHERE teamId=?').all(c.teamId))
        this.savePreset(id, p.id, { ...this.preset(id, p.id), enabled: true, useClubColors: true });
    })();
    return this.garage(id);
  }
  copyPreset(id: string, preset: CarPreset) {
    const c = this.career(id);
    this.db.transaction(() => {
      for (const p of this.db.prepare('SELECT id FROM players WHERE teamId=?').all(c.teamId))
        this.savePreset(id, p.id, preset);
    })();
    return this.garage(id);
  }
  loadout(id: string, p: any, side: number) {
    const c = this.career(id);
    return p.teamId === c.teamId
      ? matchLoadout(this.preset(id, p.id), side, this.branding(id))
      : undefined;
  }
}
