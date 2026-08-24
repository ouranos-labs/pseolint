import type { audits } from "@/db/schema";

/** The `audits.source` values this resolver may produce. */
type AuditSource = typeof audits.$inferInsert["source"];

/**
 * Maps a client-supplied channel hint to a stored `audits.source`.
 *
 * The hint arrives as `?from=` on the landing page and is echoed into the POST
 * body, so it is attacker-controlled: anything unrecognised resolves to "user"
 * rather than being written through. That matters because this column is meant
 * to answer "which acquisition channel is worth investing in", and a column
 * anyone can write arbitrary strings into cannot answer it.
 *
 * Only channels that can actually produce an audit row are listed. The CLI, the
 * GitHub Action and the remote MCP server run the engine locally and persist
 * nothing, so they can refer traffic here but never appear as a source.
 */
const CHANNEL_BY_HINT: Record<string, AuditSource> = {
  // The extension's plain "audit this" hand-off.
  extension: "extension",
  // The SERP overlay is part of the extension; ?from=serp predates this and
  // also drives the competitive-context banner, so both map to one channel.
  serp: "extension",
};

export function resolveAuditChannel(hint: string | null | undefined): AuditSource {
  if (!hint) return "user";
  return CHANNEL_BY_HINT[hint.toLowerCase()] ?? "user";
}
