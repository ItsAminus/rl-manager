export interface CustomOrganization {
 name:string;shortName:string;logo:string|null;
 players:{gamertag:string;overall:number;age:number}[];
}
export function validateCustomOrganization(input:any){
 const text=(s:any,max:number,label:string)=>{if(typeof s!=='string'||!s.trim()||s.trim().length>max||/[\x00-\x1f]/.test(s))throw Error(`Enter a valid ${label} (1–${max} characters).`);return s.trim();};
 if(!input||!Array.isArray(input.players)||input.players.length!==3)throw Error('Create exactly three starting players.');
 const name=text(input.name,50,'organization name'),shortName=text(input.shortName,6,'team abbreviation').toUpperCase();
 const players=input.players.map((p:any)=>{const gamertag=text(p.gamertag,24,'player name');if(!Number.isInteger(p.overall)||p.overall<1||p.overall>99)throw Error('Player ratings must be whole numbers from 1 to 99.');if(!Number.isInteger(p.age)||p.age<15||p.age>45)throw Error('Player ages must be from 15 to 45.');return {gamertag,overall:p.overall,age:p.age};});
 if(new Set(players.map((p:any)=>p.gamertag.toLowerCase())).size!==3)throw Error('Give each player a different name.');
 return {name,shortName,players,logo:input.logo??null} as CustomOrganization;
}
