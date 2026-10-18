import {describe,expect,it} from 'vitest';
import {publicAssetUrl} from '../src/renderer/utils/public-assets';

describe('shared public media',()=>{
  it('resolves production photos beside the bundle and development media through Vite',()=>{
    expect(new URL(publicAssetUrl('/player-headshots/zen.webp',true),'file:///game/dist/index.html').pathname).toBe('/game/public/player-headshots/zen.webp');
    expect(publicAssetUrl('/broadcast-crests/vitality.png',false,'/')).toBe('/broadcast-crests/vitality.png');
    expect(publicAssetUrl('/chirp-media/banner.jpg',false,'/preview/')).toBe('/preview/chirp-media/banner.jpg');
  });
  it('preserves career-created logos and external source images',()=>{
    for(const url of ['data:image/png;base64,AA==','https://example.org/photo.png',''])expect(publicAssetUrl(url,true)).toBe(url);
  });
});
