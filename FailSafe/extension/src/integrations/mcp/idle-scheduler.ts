/**
 * IdleScheduler — canonical idle-disconnect scheduler for MCP stdio clients.
 *
 * Consolidated by B-INT-4 (plan-qor-b-int-4-mcp-client-host) from the two
 * previously-duplicated copies under `src/integrations/bicameral/` and
 * `src/integrations/open-design/`. The two copies were near-identical (the
 * Open Design copy's header acknowledged it as DUPLICATE-BY-DESIGN); this
 * module is the single source of truth.
 *
 * Owns timer lifecycle + race-safety (inflight counter so long-running calls
 * do NOT trigger spurious disconnects).
 */

export const DEFAULT_IDLE_DISCONNECT_MS = 900_000; // 15 minutes

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

  /** Call when a tool call BEGINS. Pauses the idle counter. */
  beginCall(): void {
    this.inflightCalls++;
  }

  /** Call when a tool call ENDS (success OR error). Updates the activity
   *  timestamp (so idle window starts fresh after the response, not request
   *  start) and resumes the idle counter. */
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
    if (this.inflightCalls > 0) {
      this.scheduleNext();
      return;
    }
    const elapsed = Date.now() - this.lastActivityAt;
    if (elapsed >= this.opts.idleMs) {
      this.opts.onIdle();
    } else {
      this.scheduleNext();
    }
  }
}
