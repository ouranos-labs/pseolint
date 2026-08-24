import { Html, Head, Body, Container, Section, Heading, Text, Button, Hr } from "@react-email/components";

export type MonitoringAlertEmailProps = {
  host: string;
  sourceUrl: string;
  previousRisk: number | null;
  currentRisk: number;
  newFindings: { ruleId: string; severity: string; message: string }[];
  reportUrl: string;
  dashboardUrl: string;
};

export default function MonitoringAlertEmail(props: MonitoringAlertEmailProps) {
  const delta = props.previousRisk == null ? null : props.currentRisk - props.previousRisk;
  const deltaSign = delta == null ? "" : delta > 0 ? "+" : "";
  const worseNow = delta != null && delta > 0;
  const riskTone = props.currentRisk <= 40 ? "#10b981" : props.currentRisk <= 69 ? "#f59e0b" : "#ef4444";

  return (
    <Html>
      <Head />
      <Body style={{ fontFamily: "system-ui, sans-serif", backgroundColor: "#f9fafb", padding: "40px 0" }}>
        <Container style={{ maxWidth: 560, margin: "0 auto", backgroundColor: "#ffffff", padding: 32, borderRadius: 12, border: "1px solid #e5e7eb" }}>
          <Text style={{ margin: 0, color: "#6b7280", fontSize: 12, textTransform: "uppercase", letterSpacing: 1 }}>pseolint monitoring</Text>
          <Heading style={{ margin: "8px 0 0", fontSize: 22, fontWeight: 600 }}>
            {worseNow ? "Risk worsened" : delta === 0 ? "New rule fired" : "Risk changed"}, {props.host}
          </Heading>

          <Section style={{ marginTop: 24, padding: "16px 18px", backgroundColor: "#f3f4f6", borderRadius: 10 }}>
            <Text style={{ margin: 0, color: "#6b7280", fontSize: 12 }}>Risk</Text>
            <Text style={{ margin: "4px 0 0", fontSize: 32, fontWeight: 600, color: riskTone }}>
              {props.currentRisk}
              {delta != null && (
                <span style={{ fontSize: 14, color: worseNow ? "#ef4444" : "#10b981", marginLeft: 10 }}>
                  {deltaSign}{delta} from {props.previousRisk}
                </span>
              )}
            </Text>
          </Section>

          {props.newFindings.length > 0 && (
            <>
              <Text style={{ marginTop: 24, marginBottom: 8, fontWeight: 600 }}>New rules firing this run</Text>
              {props.newFindings.slice(0, 3).map((f) => (
                <Section key={f.ruleId} style={{ borderLeft: `3px solid ${sevColor(f.severity)}`, paddingLeft: 12, marginTop: 8 }}>
                  <Text style={{ margin: 0, fontFamily: "monospace", fontSize: 12, color: "#6b7280" }}>
                    {f.ruleId} · {f.severity}
                  </Text>
                  <Text style={{ margin: "2px 0 0", color: "#111827", fontSize: 14 }}>{f.message}</Text>
                </Section>
              ))}
            </>
          )}

          <Section style={{ marginTop: 28 }}>
            <Button href={props.reportUrl} style={{ backgroundColor: "#18181b", color: "#ffffff", padding: "10px 18px", borderRadius: 6, textDecoration: "none", fontWeight: 500 }}>
              View full report
            </Button>
          </Section>

          <Hr style={{ borderColor: "#e5e7eb", marginTop: 32 }} />
          <Text style={{ color: "#9ca3af", fontSize: 12 }}>
            Monitored domain: <a href={props.sourceUrl} style={{ color: "#6b7280" }}>{props.sourceUrl}</a>.
            Manage cadence or pause alerts in your <a href={props.dashboardUrl} style={{ color: "#6b7280" }}>dashboard</a>.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

function sevColor(sev: string): string {
  if (sev === "critical" || sev === "error") return "#ef4444";
  if (sev === "warning") return "#f59e0b";
  return "#3b82f6";
}
