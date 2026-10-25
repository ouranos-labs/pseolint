import { describeAuditError, networkErrorView, type AuditErrorView } from "@/lib/audit-errors";

export type AuditSubmitPayload = {
  url: string;
  turnstileToken?: string;
  force?: boolean;
  render?: boolean;
  tool?: string;
  channel?: string;
};

export type AuditSubmitResult =
  | { ok: true; next: string; auditId: string; cached: boolean }
  | { ok: false; status: number; code: string | undefined; view: AuditErrorView };

/**
 * POST /api/audits and resolve to either where to go next or the error view
 * to render. Every audit form goes through here so a given rejection reads the
 * same on the homepage, the tool pages, the inline widget and the dashboard.
 */
export async function submitAudit(
  payload: AuditSubmitPayload,
  opts: { returnTo?: string } = {},
): Promise<AuditSubmitResult> {
  let res: Response;
  try {
    res = await fetch("/api/audits", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    return { ok: false, status: 0, code: "network", view: networkErrorView() };
  }
  const body: unknown = await res.json().catch(() => null);
  if (res.ok) {
    const b = (body ?? {}) as { auditId?: string; reportUrl?: string; cached?: boolean };
    // A cached/deduped answer points at an existing report: flag it so the
    // report page can say how old it is and that it may not be the caller's run.
    const next =
      b.cached && b.reportUrl ? `${b.reportUrl}?cached=1` : b.auditId ? `/a/${b.auditId}` : (b.reportUrl ?? "/");
    return { ok: true, next, auditId: b.auditId ?? "", cached: !!b.cached };
  }
  const code = body && typeof body === "object" && typeof (body as { code?: unknown }).code === "string"
    ? (body as { code: string }).code
    : undefined;
  return { ok: false, status: res.status, code, view: describeAuditError(res.status, body, { returnTo: opts.returnTo }) };
}
