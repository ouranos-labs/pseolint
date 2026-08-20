import { appendFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import type { SessionEvent } from "./types.js";

export type EventSink = (event: SessionEvent) => void | Promise<void>;

/**
 * Per-session event recorder. Three concerns:
 *   1. In-memory buffer (returned in SessionResult so callers can replay).
 *   2. Optional NDJSON file writer for durable replay (orchestrator session log).
 *   3. Optional callback fanout: the web app passes a callback that pushes
 *      to SSE / R2 in production.
 *
 * Errors writing the file are swallowed; we never want a log-write failure
 * to abort an in-flight orchestrator session.
 */
export class SessionLog {
  private readonly buffer: SessionEvent[] = [];
  private fileInitialized = false;

  constructor(
    private readonly opts: {
      ndjsonPath?: string;
      onEvent?: EventSink;
    } = {},
  ) {}

  async emit(event: SessionEvent): Promise<void> {
    this.buffer.push(event);

    if (this.opts.onEvent) {
      try {
        await this.opts.onEvent(event);
      } catch {
        // Sink failures are non-fatal: never let an SSE/R2 hiccup take
        // down the session. The buffer is still authoritative.
      }
    }

    if (this.opts.ndjsonPath) {
      try {
        if (!this.fileInitialized) {
          await mkdir(dirname(this.opts.ndjsonPath), { recursive: true });
          this.fileInitialized = true;
        }
        await appendFile(this.opts.ndjsonPath, JSON.stringify(event) + "\n", "utf8");
      } catch {
        // Same: log-file errors don't kill the session.
      }
    }
  }

  events(): SessionEvent[] {
    return [...this.buffer];
  }
}
