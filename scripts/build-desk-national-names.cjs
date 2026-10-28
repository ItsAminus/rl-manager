const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),players=JSON.parse(fs.readFileSync(path.join(root,'data/players.json'),'utf8'));
const known=new Set(players.map(p=>p.gamertag.toLowerCase()));
for(const team of JSON.parse(fs.readFileSync(path.join(root,'data/additional-professional-clubs.json'),'utf8')))for(const player of team.roster)if(!known.has(player.tag.toLowerCase()))players.push({nationality:player.nationality});
const associations={ENG:'England',GBENG:'England',SCO:'Scotland',GBSCT:'Scotland',WAL:'Wales',GBWLS:'Wales',NIR:'Northern Ireland',GBNIR:'Northern Ireland'};
const names=new Intl.DisplayNames(['en'],{type:'region'}),counts=new Map();
for(const player of players){const code=String(player.nationality||'').trim().toUpperCase();let name=associations[code];if(!name&&/^[A-Z]{2}$/.test(code)&&!['GB','UK','EU','UN','ZZ','XX'].includes(code)){try{const label=names.of(code);if(label!==code&&label!=='Unknown Region')name=label;}catch{}}
 if(name)counts.set(name,(counts.get(name)||0)+1);}
const nations=[...counts].filter(([,count])=>count>=3).map(([name])=>({id:'nation:'+name,name})).sort((a,b)=>a.name.localeCompare(b.name));
fs.writeFileSync(path.join(root,'data/desk-national-names.json'),JSON.stringify(nations,null,2)+'\n');console.log(JSON.stringify({eligibleNations:nations.length}));
