export const SERIES_MAPS = [
  {name:'Mannfield (Dusk)',code:'Mannfield_Dusk',upk:'eurostadium_dusk_p'},
  {name:'Forbidden Temple',code:'ForbiddenTemple',upk:'CHN_Stadium_P'},
  {name:'Futura Garden (Night)',code:'UF_Night_P',upk:'UF_Night_P'},
  {name:'Utopia Coliseum (Dusk)',code:'UtopiaColiseum_Dusk',upk:'UtopiaStadium_Dusk_P'},
  {name:'Sovereign Heights',code:'SovereignHeights',upk:'Street_P'},
  {name:'Neo Tokyo',code:'NeoTokyo',upk:'NeoTokyo_Standard_P'},
  {name:'Champions Field',code:'ChampionsField',upk:'cs_p'},
] as const;
export function seriesMap(gameNumber:number,bestOf:number){
  if(!Number.isInteger(gameNumber)||gameNumber<1||gameNumber>bestOf)throw new Error('Game number is outside this series.');
  if(![1,3,5,7,9].includes(bestOf))throw new Error('Unsupported series format.');
  return SERIES_MAPS[Math.min(gameNumber-1,6)];
}
