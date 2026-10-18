import {describe,it,expect,vi} from 'vitest';
import path from 'node:path';
vi.mock('fs',()=>({existsSync:vi.fn()}));
vi.mock('child_process',()=>({execSync:vi.fn()}));
import * as fs from 'fs';
import * as process from 'child_process';
import {RLBotDetector} from '../src/services/rlbot-detector';
describe('complete kit Python detection',()=>{
  it('prefers the registered portable Python over another RLBot installation',async()=>{
    const root=path.resolve('scratch/another-user-runtime');
    const python=path.join(root,'python/python.exe');
    vi.mocked(fs.existsSync).mockImplementation(value=>String(value)===python);
    vi.mocked(process.execSync).mockReturnValue('1.68.0\n');
    const result=await new RLBotDetector(()=>root).detectRLBot();
    expect(result.pythonPath).toBe(python);
    expect(process.execSync).toHaveBeenCalledWith(expect.stringContaining(python),expect.objectContaining({windowsHide:true}));
  });
});
