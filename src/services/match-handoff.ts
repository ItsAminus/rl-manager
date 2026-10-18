/** A game is available to save only after commentary and bridge cleanup finish. */
export class MatchHandoff {
  private serial = 0;
  private active: number | null = null;
  private result: any = null;
  get busy() {
    return this.active !== null;
  }
  start() {
    if (this.active !== null)
      throw new Error(
        'The previous game is still finishing its commentary and cleanup. Please wait.'
      );
    this.active = ++this.serial;
    this.result = null;
    return this.active;
  }
  owns(token: number) {
    return this.active === token;
  }
  stage(token: number, result: any) {
    if (this.owns(token)) this.result = result;
  }
  close(token: number, fallback?: any) {
    if (!this.owns(token)) return undefined;
    const result = this.result || fallback;
    this.active = null;
    this.result = null;
    return result;
  }
}
