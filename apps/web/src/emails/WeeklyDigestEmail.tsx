import { Html, Head, Body, Container, Heading, Text, Link, Hr } from "@react-email/components";

export interface DigestItem {
  domainHost: string;
  ruleId: string;
  message: string;
  affectedPages: number;
  detailUrl: string;
}

export default function WeeklyDigestEmail({ items, appUrl }: { items: DigestItem[]; appUrl: string }) {
  return (
    <Html>
      <Head />
      <Body style={{ fontFamily: "system-ui, sans-serif", padding: 24 }}>
        <Container>
          <Heading as="h2">Top 3 fixes this week</Heading>
          {items.map((it, i) => (
            <div key={i} style={{ marginTop: 16 }}>
              <Text style={{ margin: 0, fontWeight: 600 }}>{it.domainHost} · {it.ruleId}</Text>
              <Text style={{ margin: "4px 0", color: "#555" }}>{it.message}</Text>
              <Text style={{ margin: "4px 0", fontSize: 13 }}>Affects {it.affectedPages} pages.</Text>
              <Link href={it.detailUrl}>Open in dashboard</Link>
            </div>
          ))}
          <Hr />
          <Text style={{ fontSize: 12, color: "#888" }}>
            Manage delivery at <Link href={`${appUrl}/dashboard/settings`}>dashboard settings</Link>.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
