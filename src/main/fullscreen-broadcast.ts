import {nativeImage} from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {validClubPng} from './club-studio';

// BakkesMod reads small local PNGs once; WebP is not supported by its canvas loader.
export const HUD_IMAGE_SIZES=[36,40,44,48,52,54,60,64,66,72,78,80,88,96,104,108,112,120,132,144,156,160,192];
export function fullscreenBroadcast(context:any, options?:{folder?:string;assetRoots?:string[];convert?:(source:string)=>Buffer;resize?:(source:string,pixels:number)=>Buffer}) {
  if(!context)return null;
  const folder=options?.folder||path.join(process.env.APPDATA||'','bakkesmod','bakkesmod','data','rl-manager');
  const roots=options?.assetRoots||[path.join(process.resourcesPath||'','app.asar.unpacked/public'),path.resolve(__dirname,'../dist'),path.resolve(__dirname,'../public')];
  const convert=options?.convert||((source:string)=>nativeImage.createFromPath(source).resize({width:256,quality:'best'}).toPNG());
  // Bake smooth downsampling once for the current eight match assets. The game
  // canvas point-samples scaled textures, so bigger files alone do not fix it.
  const resize=options?.resize||(options?.convert?undefined:((source:string,pixels:number)=>{
    const input=nativeImage.createFromPath(source),size=input.getSize();
    if(input.isEmpty())return Buffer.alloc(0);
    return input.resize({width:Math.max(1,Math.round(pixels*size.width/Math.max(size.width,size.height))),height:Math.max(1,Math.round(pixels*size.height/Math.max(size.width,size.height))),quality:'best'}).toPNG();
  }));
  const copy={...context};
  fs.mkdirSync(path.join(folder,'images'),{recursive:true});
  const image=(url:unknown):string=>{
    if(typeof url==='string'&&url.startsWith('data:image/png;base64,')){
      try{
        validClubPng(url);
        const target=path.join(folder,'images','club-'+createHash('sha256').update(url).digest('hex').slice(0,24)+'.png');
        if(!fs.existsSync(target))fs.writeFileSync(target,Buffer.from(url.split(',')[1],'base64'));
        if(resize)for(const pixels of HUD_IMAGE_SIZES){const variant=target+`.px-${pixels}.png`;if(!fs.existsSync(variant)){const bytes=resize(target,pixels);if(bytes.length)fs.writeFileSync(variant,bytes);}}
        return target;
      }catch(error){console.warn('[Broadcast] Custom crest unavailable:',error);return '';}
    }
    if(typeof url!=='string'||!url.startsWith('/')||url.includes('..'))return '';
    const filename=createHash('sha256').update(url).digest('hex').slice(0,12)+'-'+path.basename(url).replace(/[^a-z0-9_.-]/ig,'_')+'.png';
    const locate=(relative:string)=>roots.map(root=>path.resolve(root,relative)).find(file=>roots.some(root=>file.startsWith(path.resolve(root)+path.sep))&&fs.existsSync(file)&&fs.statSync(file).isFile());
    const ready=locate('broadcast-png/'+filename);
    const source=ready||locate(url.slice(1));
    if(!source)return '';
    const target=path.join(folder,'images',filename);
    try {
      if(!fs.existsSync(target)||fs.statSync(target).mtimeMs<fs.statSync(source).mtimeMs){if(ready)fs.copyFileSync(source,target);else{const bytes=convert(source);if(!bytes.length)return '';fs.writeFileSync(target,bytes);}}
      if(resize){
        const original=locate(url.slice(1))||source;
        for(const pixels of HUD_IMAGE_SIZES){
          const variant=target+`.px-${pixels}.png`;
          if(!fs.existsSync(variant)||fs.statSync(variant).mtimeMs<fs.statSync(original).mtimeMs){
            let bytes=resize(original,pixels);
            // Some original WebP/SVG sources are unsupported by Electron. The
            // prepared PNG remains usable and must still get smooth variants.
            if(!bytes.length&&original!==source)bytes=resize(source,pixels);
            if(bytes.length)fs.writeFileSync(variant,bytes);
          }
        }
      }
      return target;
    }
    catch(error){console.warn('[Broadcast] Image unavailable:',url,error);return '';}
  };
  for(const side of ['blue','orange']) {
    const team=context[side];
    copy[side]={...team,logo:image(team.logo),players:team.players.map((p:any)=>({...p,photo:image(p.photo),title:p.title||''}))};
  }
  return {...copy,nativeStatePath:path.join(folder,'state.json')};
}
