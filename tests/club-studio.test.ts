import { beforeAll, beforeEach, expect, it } from 'vitest';
import initSqlJs from 'sql.js';
import { sqlAdapter } from './sql-fixture';
import { runMigration } from '../src/database/migrations/001_initial_schema';
import { ClubStudio } from '../src/main/club-studio';
import { defaultCarPreset } from '../src/game/club-design';
import { broadcastTeam } from '../src/services/broadcast-assets';
const png =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aNfoAAAAASUVORK5CYII=';
let SQL: any, db: any, studio: ClubStudio;
beforeAll(async () => {
  SQL = await initSqlJs();
});
beforeEach(() => {
  db = sqlAdapter(new SQL.Database());
  runMigration(db);
  db.exec(
    "INSERT INTO careers(id,managerName,teamId) VALUES('a','Coach A','us'),('b','Coach B','them'); INSERT INTO teams(id,name,shortName) VALUES('us','Original Club','ORG'),('them','Rival Club','RIV'); INSERT INTO players(id,gamertag,teamId,overall) VALUES('zen','zen','us',99),('nass','nass','us',98),('other','Opponent','them',90)"
  );
  studio = new ClubStudio(db);
});
it('saves complete branding, restores it after database reload and exposes it to the HUD', () => {
  const brand = {
    ...studio.branding('a'),
    name: 'New Club',
    shortName: 'NEW',
    primary: '#ff6600',
    logoMode: 'upload' as const,
    logo: png,
    banner: png,
  };
  studio.saveBranding('a', brand);
  const loaded = sqlAdapter(new SQL.Database(db.exportBinary())),
    s = new ClubStudio(loaded);
  expect(s.branding('a').primary).toBe('#FF6600');
  expect(s.branding('a').banner).toBe(png);
  const team = s.decorate(loaded.prepare("SELECT * FROM teams WHERE id='us'").get(), 'a'),
    hud = broadcastTeam(team, []);
  expect(hud.name).toBe('New Club');
  expect(hud.logo).toBe(png);
  expect(hud.logoKind).toBe('custom');
  expect(hud.brandColor).toBe('#FF6600');
  expect(
    s.decorate(loaded.prepare("SELECT * FROM teams WHERE id='us'").get(), 'b').branding
  ).toBeUndefined();
  expect(
    s.decorate(loaded.prepare("SELECT * FROM teams WHERE id='them'").get(), 'a').branding
  ).toBeUndefined();
  s.resetBranding('a');
  expect(s.branding('a').name).toBe('Original Club');
  expect(
    s.decorate(loaded.prepare("SELECT * FROM teams WHERE id='us'").get(), 'a').branding
  ).toBeUndefined();
});
it('does not accept executable assets, invalid colours or unsupported cosmetic items', () => {
  expect(() =>
    studio.saveBranding('a', {
      ...studio.branding('a'),
      logo: 'data:image/svg+xml,<svg onload="bad()"/>',
    })
  ).toThrow(/PNG/);
  expect(() => studio.saveBranding('a', { ...studio.branding('a'), primary: 'red;bad' })).toThrow(
    /colour/
  );
  expect(() => studio.savePreset('a', 'zen', { ...defaultCarPreset(), bodyId: 999999 })).toThrow(
    /supported/
  );
  expect(() => studio.savePreset('a', 'other', defaultCarPreset())).toThrow(/squad/);
  expect(db.prepare('SELECT COUNT(*) n FROM club_designs').get().n).toBe(0);
});
it('keeps different pros and careers separate, and rechecks ownership at match launch', () => {
  studio.savePreset('a', 'zen', { ...defaultCarPreset(), enabled: true, bodyId: 4284 });
  studio.savePreset('a', 'nass', { ...defaultCarPreset(), enabled: true, bodyId: 23 });
  expect(studio.loadout('a', { id: 'zen', teamId: 'us' }, 0)?.car_id).toBe(4284);
  expect(studio.loadout('a', { id: 'nass', teamId: 'us' }, 0)?.car_id).toBe(23);
  expect(studio.preset('b', 'zen').enabled).toBe(false);
  expect(studio.loadout('a', { id: 'zen', teamId: 'them' }, 0)).toBeUndefined();
  expect(studio.loadout('a', { id: 'zen', teamId: 'us' }, 1)?.primary).toBe('#EB992D');
});
it('coordinates the whole squad while preserving their different bodies and tracking future club colours', () => {
  studio.savePreset('a', 'zen', { ...defaultCarPreset(), enabled: true, bodyId: 4284 });
  studio.coordinate('a');
  expect(studio.preset('a', 'zen').bodyId).toBe(4284);
  expect(studio.preset('a', 'nass').bodyId).toBe(23);
  studio.saveBranding('a', { ...studio.branding('a'), primary: '#aa2200' });
  expect(studio.loadout('a', { id: 'zen', teamId: 'us' }, 0)?.primary).toBe('#AA2200');
  expect(studio.preset('a', 'other').enabled).toBe(false);
});
it('copies and resets presets without altering player skill or role data', () => {
  studio.copyPreset('a', { ...defaultCarPreset(), enabled: true, bodyId: 4284 });
  expect(studio.preset('a', 'nass').bodyId).toBe(4284);
  studio.resetPreset('a', 'zen');
  expect(studio.preset('a', 'zen').enabled).toBe(false);
  expect(db.prepare("SELECT overall FROM players WHERE id='zen'").get().overall).toBe(99);
});
