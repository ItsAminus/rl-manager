import React,{useState} from 'react';
import {publicAssetUrl} from '../utils/public-assets';
import './ArenaBackdrops.css';
export const ARENA_BACKDROPS=[
 {id:'clubhouse',name:'The clubhouse',file:'arena-background.png'},
 {id:'championship',name:'Championship night',file:'championship-arena.webp'},
 {id:'tunnel',name:'Into the arena',file:'arena-tunnel.webp'},
];
export function readBackdrop(){try{return ARENA_BACKDROPS.find(x=>x.id===localStorage.getItem('rlm:arena-backdrop'))||ARENA_BACKDROPS[0];}catch{return ARENA_BACKDROPS[0];}}
export function backdropUrl(file:string){return new URL(publicAssetUrl('/brand/'+file),window.location.href).href;}
export function ArenaBackdrops({onChange}:{onChange?:(file:string)=>void}){
 const [selected,setSelected]=useState(()=>readBackdrop().id);
 return <div className="arena-backdrops" aria-label="Menu background"><span>YOUR ARENA</span><div>{ARENA_BACKDROPS.map(scene=><button key={scene.id} aria-label={scene.name} aria-pressed={selected===scene.id} title={scene.name} onClick={()=>{try{localStorage.setItem('rlm:arena-backdrop',scene.id);}catch{}setSelected(scene.id);onChange?.(scene.file);}}><img src={publicAssetUrl('/brand/'+scene.file)} alt=""/><small>{scene.name}</small></button>)}</div></div>;
}
