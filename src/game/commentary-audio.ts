export function commentatorVolume(value:unknown):number {
 return typeof value==='number'&&Number.isFinite(value)?Math.max(0,Math.min(1,value)):1;
}
