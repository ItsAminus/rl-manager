import {describe, expect, it} from 'vitest';
import fs from 'node:fs';
import {competitionPresentation} from '../src/renderer/utils/competition-presentation';
import {publicAssetUrl} from '../src/renderer/utils/public-assets';

describe('competition matchday media', () => {
  it.each([
    ['RLCS 2026 Boston Major', 'MAJOR', 'rlcs', '/competitions/rlcs-major.jpg'],
    ['RLCS 2026 Paris Major', 'MAJOR', 'rlcs', '/competitions/rlcs-major.jpg'],
    ['RLCS 2026 World Championship', 'WORLDS', 'worlds', '/competitions/worlds.jpg'],
    ['Esports World Cup 2026', 'INVITATIONAL', 'ewc', '/competitions/ewc.png'],
    ['FIFAe World Cup featuring Rocket League', 'INVITATIONAL', 'fifae', '/competitions/fifae.png'],
    ['FIFA EWC', '', 'fifae', '/competitions/fifae.png'],
    ['RLCS Europe Open 1', 'REGIONAL', 'rlcs', '/brand/arena-background.png'],
    ['RLCS Worlds Last Chance Qualifier', 'LCQ', 'rlcs', '/brand/arena-background.png'],
    ['Esports World Cup Last Chance Qualifier', 'EWC_LCQ', 'ewc', '/competitions/ewc.png'],
  ])('selects the correct video and backdrop for %s', (competitionName, competitionType, id, background) => {
    const result = competitionPresentation({competitionName, competitionType});
    expect(result?.id).toBe(id);
    expect(result?.background).toBe(background);
  });

  it('does not turn unrelated invitationals, academy matches or unknown fixtures into EWC', () => {
    for (const fixture of [{competitionName: 'Community Invitational', competitionType: 'INVITATIONAL'}, {competitionType: 'PATH'}, {}]) {
      expect(competitionPresentation(fixture)).toBeNull();
    }
  });

  it('ships all selected media and resolves video URLs outside dist in production', () => {
    for (const name of ['RLCS Major', 'World Championship', 'Esports World Cup', 'FIFAe World Cup']) {
      const presentation = competitionPresentation({competitionName: name})!;
      for (const asset of [presentation.video, presentation.background, presentation.detailImage].filter(Boolean) as string[]) {
        expect(fs.statSync('public' + asset).size).toBeGreaterThan(0);
        expect(new URL(publicAssetUrl(asset, true), 'file:///game/dist/index.html').pathname).toBe('/game/public' + asset);
      }
      // Verify an MP4 container rather than a missing-file HTML response.
      const file = fs.openSync('public' + presentation.video, 'r');
      try { const header = Buffer.alloc(12); fs.readSync(file, header, 0, 12, 0); expect(header.toString('ascii', 4, 8)).toBe('ftyp'); }
      finally { fs.closeSync(file); }
    }
  });
});
