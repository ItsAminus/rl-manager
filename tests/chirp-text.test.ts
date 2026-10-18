import {afterEach,describe,expect,it,vi} from 'vitest';
import {LocalChirpText,type TextJob} from '../src/main/chirp-text';

const job:TextJob={id:'receipt',context:{author:'Fraud Watch EU',role:'Fan',draft:'',topic:'Receipts',intent:'Tease the manager about their pre-series boast.',
  thread:'We are NOT losing to this team again based on luck.',managerClub:'Gentle Mates',
  matchContext:{fixtureId:'fixture',status:'completed',competition:'Club series',format:'BO5',date:'2025-09-19',home:'Gentle Mates',away:'Manchester City',seriesScore:'2–3',
    games:[{game:5,blue:'Gentle Mates',orange:'Manchester City',score:'0–9'}],facts:['Gentle Mates led the series 2–0, then Manchester City completed a reverse sweep to win 3–2.'],incidents:[],statistics:[]}}};
afterEach(()=>vi.restoreAllMocks());
function worker(){const text=new LocalChirpText('unused');vi.spyOn(text as any,'start').mockResolvedValue('http://127.0.0.1:1');return text;}
describe('Local Chirp generation protocol',()=>{
  it('supplies verified evidence, manager outcome and author identity through native chat messages',async()=>{
    const fetch=vi.spyOn(globalThis,'fetch').mockResolvedValue({ok:true,json:async()=>({choices:[{message:{content:JSON.stringify({body:'that reverse sweep turned your boast into a receipt lol'})}}]})} as Response);
    const result=await worker().generate([job]);expect(result.receipt).toContain('reverse sweep');
    expect(fetch.mock.calls[0][0]).toBe('http://127.0.0.1:1/v1/chat/completions');
    const request=JSON.parse(String(fetch.mock.calls[0][1]?.body));
    expect(request.response_format).toEqual({type:'json_object'});expect(request.grammar).toBeUndefined();
    const context=JSON.parse(request.messages[1].content);
    expect(context).toMatchObject({author:'Fraud Watch EU',verifiedMatch:{winner:'Manchester City',loser:'Gentle Mates',managerTeam:'Gentle Mates',managerResult:'LOST'}});
    expect(context.verifiedMatch.recentGames[0]).toContain('0–9');
  });
  it('keeps numerical details in verified reports instead of accepting new generated statistics',async()=>{
    vi.spyOn(globalThis,'fetch').mockResolvedValue({ok:true,json:async()=>({choices:[{message:{content:'{"body":"you scored 9 goals, clearly not luck"}'}}]})} as Response);
    expect(await worker().generate([job])).toEqual({});
  });
  it('clears a dead worker connection so a subsequent background attempt can restart',async()=>{
    vi.spyOn(globalThis,'fetch').mockRejectedValue(new Error('connection reset'));
    const text=worker(),kill=vi.fn();(text as any).process={kill};(text as any).starting=Promise.resolve('http://127.0.0.1:1');
    await expect(text.generate([job])).rejects.toThrow('connection reset');
    expect(kill).toHaveBeenCalledOnce();expect((text as any).starting).toBeUndefined();expect((text as any).process).toBeUndefined();
  });
});
