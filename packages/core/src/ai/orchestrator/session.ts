import { randomUUID } from "node:crypto";
import { BudgetTracker } from "./budget.js";
import type { FixManifest } from "./finish-tool.js";
import { SessionLog, type EventSink } from "./log.js";
import { DEFAULT_BUDGET, type BudgetCaps, type SessionEvent } from "./types.js";

export interface SessionStateOptions {
  domain: string;
  userId: string;
  providerId: string;
  modelId: string;
  budget?: Partial<BudgetCaps>;
  ndjsonPath?: string;
  onEvent?: EventSink;
}

/**
 * Bundles the per-session pieces (budget + log + identity) so the runner has
 * a single object to thread through `streamText` callbacks. Keeps the runner
 * itself focused on the AI-SDK glue.
 */
export class SessionState {
  readonly id: string;
  readonly domain: string;
  readonly userId: string;
  readonly budget: BudgetTracker;
  readonly log: SessionLog;
  readonly caps: BudgetCaps;

  private finished = false;
  private finishedManifest: FixManifest | null = null;

  constructor(opts: SessionStateOptions) {
    this.id = randomUUID();
    this.domain = opts.domain;
    this.userId = opts.userId;
    this.caps = { ...DEFAULT_BUDGET, ...opts.budget };
    this.budget = new BudgetTracker(this.caps, opts.providerId, opts.modelId);
    this.log = new SessionLog({
      ndjsonPath: opts.ndjsonPath,
      onEvent: opts.onEvent,
    });
  }

  async start(): Promise<void> {
    this.budget.start();
    await this.log.emit({
      kind: "session_started",
      sessionId: this.id,
      domain: this.domain,
      startedAt: new Date().toISOString(),
    });
  }

  /**
   * Mark `finish_audit` was called and capture its manifest. The runner
   * reads this to detect completion. `manifest` may be null only in the
   * pathological case where the AI SDK fired a finish_audit tool_result
   * event but the matching tool_call's input couldn't be located: keep
   * the session as "finished" so the loop terminates, but the result will
   * carry a null manifest and the caller can detect the partial state.
   */
  markFinished(manifest: FixManifest | null): void {
    this.finished = true;
    this.finishedManifest = manifest;
  }

  isFinished(): boolean {
    return this.finished;
  }

  getManifest(): FixManifest | null {
    return this.finishedManifest;
  }

  async emit(event: SessionEvent): Promise<void> {
    await this.log.emit(event);
  }

  events(): SessionEvent[] {
    return this.log.events();
  }
}
