const hash=(value:string)=>{let n=2166136261;for(const c of value)n=Math.imul(n^c.charCodeAt(0),16777619);return n>>>0;};
const fanVoices=[
  'loyal supporter; short, warm, sometimes caps when excited; push back on unfair criticism',
  'rival supporter; sarcastic, lowercase, competitive trash talk about the game',
  'dry meme poster; deadpan jokes, short sentences, occasional skull emoji',
  'skeptical fan; blunt opinions, rhetorical questions, avoid sounding like a pundit',
  'enthusiastic fan; conversational, a little chaotic, celebrate players and good plays',
  'debate-loving fan; disagree with specifics, ask pointed questions, sometimes admit a good point',
];
export function chirpVoice(account:{id:string;kind:string;displayName?:string;teamId?:string}) {
  if(account.kind==='Fan')return fanVoices[hash(account.id)%fanVoices.length];
  if(account.kind==='Club')return 'club social admin; confident, concise, celebrate your own team; playful rivalry banter, never pretend speculation is a completed transfer';
  if(account.kind==='Media')return account.id==='rosterwire'?'transfer reporter; separate confirmed career moves from rumours and opinion; invite replies':'match desk; punchy headlines and pointed questions about verified results';
  if(account.kind==='Analyst')return account.id==='gibbs'?'clear, patient analyst; one concrete explanation; conversational rather than a coaching lecture':'opinionated analyst; challenge easy narratives, explain one specific reason, invite disagreement';
  if(account.kind==='Former pro')return 'former player watching with friends; dry humour, short takes, defend players when the pile-on goes too far';
  if(account.kind==='Creator')return 'creator; playful and conversational; jokes about Rocket League, occasional self-deprecation, no generic motivational wrap-up';
  if(account.kind==='Player')return ['reserved competitor; brief, understated, occasional dry humour','confident competitor; direct, a little cocky, talks about the next match','friendly teammate; casual replies, celebrate teammates, avoid PR slogans','deadpan competitor; short replies, no unnecessary emojis','expressive competitor; lively, admits frustrations, competitive banter'][hash(account.id)%5];
  return 'results desk; accurate, concise, preserve the supplied match facts';
}

export function fanResponse(style:number, club:string, message:string) {
  const excerpt=message.trim().slice(0,100);
  const lines=[
    `backing ${club}. just give us something to celebrate and we're there`,
    `big talk 😭 let's see the next game first`,
    `the replies are already doing too much. let the team play`,
    `"${excerpt}" — fair, but can we actually see it on the pitch this time?`,
    `nah i'm with the coach on this one. every loss doesn't need a roster rebuild`,
    `supporting this team is a full time job at this point 💀`,
    `love that you're actually talking to the fans instead of disappearing after a loss`,
    `some of you change your favourite team after every series lmao`,
    `i respect the confidence. bookmarking this for match day though`,
    `couldn't disagree more but at least the timeline isn't boring today`,
    `the talent is there. the last player shouldn't have to defend everything alone`,
    `people wanted an honest answer and now they're mad about the honest answer. classic`,
  ];
  return lines[style%lines.length];
}

// Compare phrasing rather than punctuation, emoji or a swapped number. Short
// stock reactions are exact matches; longer comments also compare word triples.
export function similarChirp(a:string,b:string){
  const words=(s:string)=>s.toLowerCase().replace(/\b\d+\b/g,'#').match(/[a-z0-9#]+/g)||[];
  const x=words(a),y=words(b);if(x.join(' ')===y.join(' '))return true;
  if(Math.min(x.length,y.length)<5)return false;
  const grams=(w:string[])=>new Set(w.slice(2).map((_,i)=>w.slice(i,i+3).join(' ')));
  const left=grams(x),right=grams(y),common=[...left].filter(w=>right.has(w)).length;
  return common/Math.min(left.size,right.size)>=.72;
}
