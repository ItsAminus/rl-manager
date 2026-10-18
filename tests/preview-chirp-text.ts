// Deterministic text fixture for the separate hidden UI review. Real local
// inference quality is checked by test-chirp-threads.mjs, not this fixture.
export class LocalChirpText {
  constructor(..._args:any[]){}
  async generate(jobs:any[]){return Object.fromEntries(jobs.map(j=>[j.id,j.context.draft||`UI-only fixture ${j.id} addressed to this particular comment by ${j.context.author}.`]));}
  close(){} pause(_active:boolean){}
}
