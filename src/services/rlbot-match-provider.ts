import { MatchProvider, MatchConfig, MatchHandle, MatchStatus, MatchResult } from './match-provider';
import { RLBotDetector } from './rlbot-detector';
import { MatchConfigGenerator } from './match-config-generator';
import { MatchMonitor } from './match-monitor';
import * as child_process from 'child_process';
import * as path from 'path';

export class RLBotMatchProvider implements MatchProvider {
  name = 'RLBot Match Provider';
  private detector = new RLBotDetector();
  private configGen = new MatchConfigGenerator();
  private monitor = new MatchMonitor();
  private activeProcesses: Map<string, child_process.ChildProcess> = new Map();

  async isAvailable(): Promise<boolean> {
    const rlStatus = await this.detector.detectRocketLeague();
    const botStatus = await this.detector.detectRLBot();
    return rlStatus.found && botStatus.found;
  }

  async launchMatch(config: MatchConfig): Promise<MatchHandle> {
    const isAvail = await this.isAvailable();
    if (!isAvail) throw new Error('RLBot or Rocket League not found');

    const matchConfigPath = await this.configGen.generateMatchConfig(config, {});
    const id = `rlbot-${Date.now()}`;
    const handle: MatchHandle = { id, config, startTime: Date.now() };

    const rlbotPath = (await this.detector.detectRLBot()).path;
    
    // Launch RLBot process
    const proc = child_process.spawn(rlbotPath, ['start', '-c', matchConfigPath], {
      detached: true,
      stdio: 'ignore'
    });
    
    proc.unref();
    this.activeProcesses.set(id, proc);
    
    // Start monitoring the local output files or RLBot state server
    this.monitor.startMonitoring(handle);

    return handle;
  }

  async getMatchStatus(handle: MatchHandle): Promise<MatchStatus> {
    return this.monitor.getStatus(handle.id);
  }

  async getMatchResult(handle: MatchHandle): Promise<MatchResult | null> {
    return this.monitor.getResult(handle.id);
  }

  async cancelMatch(handle: MatchHandle): Promise<void> {
    const proc = this.activeProcesses.get(handle.id);
    if (proc) {
      proc.kill();
      this.activeProcesses.delete(handle.id);
    }
    this.monitor.cancelMonitoring(handle.id);
  }
}
