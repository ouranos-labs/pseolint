/**
 * Slack incoming-webhook dispatcher for monitoring alerts.
 * SSRF guard: only accepts hooks.slack.com URLs: keeps a webhook column
 * from being weaponized to probe internal services.
 */

const ALLOWED_PREFIX = "https://hooks.slack.com/services/";
const FETCH_TIMEOUT_MS = 8_000;

export function validateSlackWebhookUrl(url: string): { ok: true } | { ok: false; reason: string } {
  const trimmed = url.trim();
  if (!trimmed) return { ok: false, reason: "empty URL" };
  if (!trimmed.startsWith(ALLOWED_PREFIX)) {
    return { ok: false, reason: `must start with ${ALLOWED_PREFIX}` };
  }
  try {
    new URL(trimmed);
  } catch {
    return { ok: false, reason: "malformed URL" };
  }
  return { ok: true };
}

interface SlackAlertInput {
  webhookUrl: string;
  sourceUrl: string;
  previousRisk: number | null;
  currentRisk: number;
  newRuleIds: string[];
  reportSlug: string;
  appUrl: string;
}

export async function sendSlackAlert(input: SlackAlertInput): Promise<void> {
  const v = validateSlackWebhookUrl(input.webhookUrl);
  if (!v.ok) throw new Error(`invalid slack webhook: ${v.reason}`);

  const delta = input.currentRisk - (input.previousRisk ?? input.currentRisk);
  const directionEmoji = delta > 0 ? ":warning:" : ":white_check_mark:";
  const reportLink = `${input.appUrl}/r/${input.reportSlug}`;

  const ruleListBlocks = input.newRuleIds.length > 0
    ? [{
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*New rule firings*\n${input.newRuleIds.slice(0, 8).map((r) => "`" + r + "`").join(", ")}${input.newRuleIds.length > 8 ? ` _+${input.newRuleIds.length - 8} more_` : ""}`,
        },
      }]
    : [];

  const payload = {
    text: `pSEOLint alert · ${input.sourceUrl} risk ${input.previousRisk ?? "; "} → ${input.currentRisk}`,
    blocks: [
      { type: "header", text: { type: "plain_text", text: `${directionEmoji} pSEOLint alert` } },
      {
        type: "section",
        fields: [
          { type: "mrkdwn", text: `*Site*\n${input.sourceUrl}` },
          { type: "mrkdwn", text: `*Risk*\n${input.previousRisk ?? "; "} → *${input.currentRisk}* (Δ ${delta >= 0 ? "+" : ""}${delta})` },
        ],
      },
      ...ruleListBlocks,
      { type: "actions", elements: [{ type: "button", text: { type: "plain_text", text: "View report" }, url: reportLink, style: "primary" }] },
    ],
  };

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(input.webhookUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      throw new Error(`slack webhook http ${res.status}`);
    }
  } finally {
    clearTimeout(t);
  }
}
