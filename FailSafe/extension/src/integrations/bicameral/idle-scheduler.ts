// B-BIC-9: idle-disconnect scheduler for the Bicameral MCP client.
// Owns timer lifecycle + race-safety (inflight counter so long-running calls
// do NOT trigger spurious disconnects). Decoupled into its own module to
// keep BicameralMcpClient.ts under the Section 4 razor.

export interface IdleSchedulerOptions {
  /** Idle ms before triggering the disconnect callback. 0 disables. */
  idleMs: number;
  /** Invoked when the idle window elapses with no in-flight calls. */
  onIdle: () => void;
}

export class IdleScheduler {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private lastActivityAt = 0;
  private inflightCalls = 0;
  private disposed = false;

  constructor(private readonly opts: IdleSchedulerOptions) {}

  /** Call when a Bicameral tool call BEGINS. Pauses the idle counter. */
  beginCall(): void {
    this.inflightCalls++;
  }

  /** Call when a Bicameral tool call ENDS (success OR error). Updates the
   *  activity timestamp (so idle window starts fresh after the response, not
   *  request start) and resumes the idle counter. */
  endCall(): void {
    if (this.inflightCalls > 0) this.inflightCalls--;
    this.lastActivityAt = Date.now();
    this.scheduleNext();
  }

  /** Cancel any pending idle fire. Use on transport close + explicit disconnect. */
  cancel(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  dispose(): void {
    this.cancel();
    this.disposed = true;
  }

  private scheduleNext(): void {
    if (this.disposed) return;
    if (this.opts.idleMs <= 0) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.checkIdle(), this.opts.idleMs);
  }

  private checkIdle(): void {
    this.timer = null;
    if (this.disposed) return;
    // Skip if a call started after the timer was scheduled.
    if (this.inflightCalls > 0) {
      // Reschedule from now; we'll re-check after the current call resolves.
      this.scheduleNext();
      return;
    }
    const elapsed = Date.now() - this.lastActivityAt;
    if (elapsed >= this.opts.idleMs) {
      this.opts.onIdle();
    } else {
      // Race-safe re-schedule.
      this.scheduleNext();
    }
  }
}
