import registry from '../../data/team-broadcast-logos.json';
const crests=registry as Record<string,{logo:string}>;

// Use the same ID-specific local crest as the in-game timer. Unconfirmed
// qualifier teams have initials badges rather than borrowed organisation logos.
export function teamCrest(teamId:string):string|null {
  return crests[teamId]?.logo||null;
}
