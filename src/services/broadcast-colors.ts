// Broadcast design palettes inspired by each organisation's visual identity.
// These are presentation colours, not a claim about official brand-guide hexes.
const palettes:Record<string,string>={
  team_1:'#F4D42D',team_2:'#2277DC',team_3:'#DD2671',team_4:'#9B72D6',
  team_5:'#72BF44',team_6:'#4CB5E9',team_7:'#D83041',team_8:'#B79553',
  team_9:'#E6BE34',team_10:'#32A6DD',team_11:'#E33C43',team_12:'#67BC98',
  team_13:'#27A875',team_14:'#EA792F',team_15:'#8765C7',team_16:'#A0A9B5',
  team_17:'#2164AA',team_18:'#B4A16C',team_19:'#F2CD36',team_20:'#5AACC6',
};
export function broadcastColor(team:{id?:string;name?:string;broadcastColor?:string}):string{
  if(team.broadcastColor&&/^#[0-9a-f]{6}$/i.test(team.broadcastColor))return team.broadcastColor;
  if(team.id&&palettes[team.id])return palettes[team.id];
  const fallback=['#476FAB','#985BBB','#287D75','#B56042','#636CA2','#AB794B'];
  let hash=0;for(const char of team.id||team.name||'Team')hash=(hash*31+char.charCodeAt(0))>>>0;
  return fallback[hash%fallback.length];
}
