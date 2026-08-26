import { Html, Head, Body, Container, Section, Heading, Text, Button, Hr } from "@react-email/components";
import { utm } from "./utm";

export type OrchestratorCompleteEmailProps = {
  domain: string;
  verdict: "ready" | "caution" | "concerning" | "critical";
  manifestUrl: string;
  pagePatchCount: number;
  templatePatchCount: number;
  domainPatchCount: number;
  validPatchCount: number;
  totalPatchCount: number;
  spentUsd: number;
  /** Session USD cap this run was bounded by: shown alongside spend for context. */
  budgetUsd: number;
  durationSeconds: number;
  /**
   * Terminal status: "completed" sends the success template; "failed"
   * sends a failure template that points back to the session-progress
   * page so the user can see what went wrong.
   */
  terminalStatus?: "completed" | "failed" | "aborted";
  errorMessage?: string | null;
};

const verdictTone: Record<OrchestratorCompleteEmailProps["verdict"], string> = {
  ready: "#10b981",
  caution: "#f59e0b",
  concerning: "#f59e0b",
  critical: "#ef4444",
};

const verdictLabel: Record<OrchestratorCompleteEmailProps["verdict"], string> = {
  ready: "Ready",
  caution: "Caution",
  concerning: "Concerning",
  critical: "Critical",
};

export default function OrchestratorCompleteEmail(props: OrchestratorCompleteEmailProps) {
  const failed = props.terminalStatus === "failed";
  const tone = failed ? "#ef4444" : verdictTone[props.verdict];
  const dropped = props.totalPatchCount - props.validPatchCount;

  return (
    <Html>
      <Head />
      <Body style={{ fontFamily: "system-ui, sans-serif", backgroundColor: "#f9fafb", padding: "40px 0" }}>
        <Container style={{ maxWidth: 560, margin: "0 auto", backgroundColor: "#ffffff", padding: 32, borderRadius: 12, border: "1px solid #e5e7eb" }}>
          <Text style={{ margin: 0, color: "#6b7280", fontSize: 12, textTransform: "uppercase", letterSpacing: 1 }}>
            pseolint orchestrator
          </Text>
          <Heading style={{ margin: "8px 0 0", fontSize: 22, fontWeight: 600 }}>
            {failed ? `Session failed, ${props.domain}` : `Audit complete, ${props.domain}`}
          </Heading>

          {failed ? (
            <>
              <Section style={{ marginTop: 24, padding: "16px 18px", backgroundColor: "#fef2f2", borderRadius: 10, border: "1px solid #fecaca" }}>
                <Text style={{ margin: 0, color: "#991b1b", fontSize: 12, textTransform: "uppercase", letterSpacing: 0.5 }}>
                  Status
                </Text>
                <Text style={{ margin: "4px 0 0", fontSize: 18, fontWeight: 600, color: tone }}>
                  Failed before producing a manifest
                </Text>
                {props.errorMessage && (
                  <Text style={{ margin: "8px 0 0", fontFamily: "ui-monospace, monospace", fontSize: 12, color: "#7f1d1d" }}>
                    {props.errorMessage}
                  </Text>
                )}
              </Section>
              <Section style={{ marginTop: 16 }}>
                <Text style={{ margin: 0, color: "#374151", fontSize: 14, lineHeight: 1.6 }}>
                  The orchestrator started running but didn&apos;t finish: common causes are budget
                  cap reached, model rate limits, or transient provider errors. You were charged
                  ${props.spentUsd.toFixed(3)} for the LLM tokens consumed before failure.
                </Text>
              </Section>
            </>
          ) : (
            <>
              <Section style={{ marginTop: 24, padding: "16px 18px", backgroundColor: "#f3f4f6", borderRadius: 10 }}>
                <Text style={{ margin: 0, color: "#6b7280", fontSize: 12 }}>Verdict</Text>
                <Text style={{ margin: "4px 0 0", fontSize: 28, fontWeight: 600, color: tone }}>
                  {verdictLabel[props.verdict]}
                </Text>
              </Section>

              <Section style={{ marginTop: 16 }}>
                <Text style={{ margin: 0, color: "#374151", fontSize: 14, lineHeight: 1.6 }}>
                  The orchestrator produced a fix manifest with{" "}
                  <strong>
                    {props.pagePatchCount} page{props.pagePatchCount === 1 ? "" : "s"}
                  </strong>
                  ,{" "}
                  <strong>
                    {props.templatePatchCount} template{props.templatePatchCount === 1 ? "" : "s"}
                  </strong>
                  , and <strong>{props.domainPatchCount} domain-level</strong> patches.{" "}
                  {props.validPatchCount} of {props.totalPatchCount} passed validators
                  {dropped > 0 ? ` (${dropped} dropped)` : ""}.
                </Text>
              </Section>
            </>
          )}

          <Section style={{ marginTop: 16 }}>
            <Text style={{ margin: 0, color: "#6b7280", fontSize: 12 }}>
              Cost: ${props.spentUsd.toFixed(3)} of ${props.budgetUsd.toFixed(2)} cap · Duration: {props.durationSeconds.toFixed(0)}s
            </Text>
          </Section>

          <Section style={{ marginTop: 24, textAlign: "center" }}>
            <Button
              href={utm(props.manifestUrl, "orchestrator_complete")}
              style={{
                backgroundColor: "#111827",
                color: "#ffffff",
                padding: "12px 20px",
                borderRadius: 8,
                fontSize: 14,
                fontWeight: 500,
                textDecoration: "none",
                display: "inline-block",
              }}
            >
              {failed ? "View session details" : "View manifest"}
            </Button>
          </Section>

          <Hr style={{ margin: "32px 0 16px", borderColor: "#e5e7eb" }} />
          <Text style={{ margin: 0, color: "#9ca3af", fontSize: 11 }}>
            pseolint orchestrator · {failed ? "Session log is retained for debugging." : "This manifest is owner-private. Patches are LLM-proposed and validated against deterministic schemas before reaching this email."}
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
