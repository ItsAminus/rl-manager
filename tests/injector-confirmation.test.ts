import {describe,it,expect,vi} from 'vitest';
import {InjectorConfirmation} from '../src/services/injector-confirmation';
const id='a'.repeat(32);
describe('match-scoped injector confirmation',()=>{
  it('sends one exact acknowledgement and rejects double clicks',async()=>{
    const prompt=new InjectorConfirmation(),send=vi.fn(async()=>{});
    expect(prompt.request(1,'fixture',id,send)).toBe(true);
    await prompt.confirm(1,'fixture',id);
    expect(send).toHaveBeenCalledWith(JSON.stringify({event:'CONFIRM_BAKKESMOD',requestId:id})+'\n');
    await expect(prompt.confirm(1,'fixture',id)).rejects.toThrow('no longer active');
    expect(send).toHaveBeenCalledTimes(1);
  });
  it('rejects other fixtures, stale bridge processes and stale request IDs',async()=>{
    const prompt=new InjectorConfirmation(),send=vi.fn(async()=>{});
    prompt.request(2,'current',id,send);
    for(const [token,fixture,request] of [[1,'current',id],[2,'old',id],[2,'current','b'.repeat(32)]] as const)
      await expect(prompt.confirm(token,fixture,request)).rejects.toThrow();
    prompt.clear(1);await prompt.confirm(2,'current',id);
    expect(send).toHaveBeenCalledTimes(1);
  });
  it('clears on bridge exit and allows retry when delivery fails',async()=>{
    const prompt=new InjectorConfirmation(),send=vi.fn().mockRejectedValueOnce(Error('pipe closed')).mockResolvedValue(undefined);
    prompt.request(1,'fixture',id,send);
    await expect(prompt.confirm(1,'fixture',id)).rejects.toThrow('pipe closed');
    await prompt.confirm(1,'fixture',id);
    prompt.request(1,'fixture',id,send);prompt.clear(1);
    await expect(prompt.confirm(1,'fixture',id)).rejects.toThrow();
    expect(prompt.request(2,'fixture','invalid',send)).toBe(false);
  });
});
