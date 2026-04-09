export class ActivityTracker {
  private activeCommands = 0;

  beginCommand(): () => void {
    this.activeCommands += 1;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.activeCommands = Math.max(0, this.activeCommands - 1);
    };
  }

  hasActiveCommands(): boolean {
    return this.activeCommands > 0;
  }

  get count(): number {
    return this.activeCommands;
  }
}
