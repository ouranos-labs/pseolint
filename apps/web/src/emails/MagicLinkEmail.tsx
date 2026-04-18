import { Html, Head, Body, Container, Section, Heading, Text, Button, Hr } from "@react-email/components";

export default function MagicLinkEmail({ url }: { url: string }) {
  return (
    <Html>
      <Head />
      <Body style={{ fontFamily: "system-ui, sans-serif", backgroundColor: "#f9fafb", padding: "40px 0" }}>
        <Container style={{ maxWidth: 560, margin: "0 auto", backgroundColor: "#ffffff", padding: 32, borderRadius: 12, border: "1px solid #e5e7eb" }}>
          <Heading style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>Sign in to pseolint</Heading>
          <Text style={{ color: "#4b5563", marginTop: 16 }}>Click the button below to sign in. This link expires in 15 minutes.</Text>
          <Section style={{ marginTop: 24 }}>
            <Button href={url} style={{ backgroundColor: "#18181b", color: "#ffffff", padding: "10px 18px", borderRadius: 6, textDecoration: "none", fontWeight: 500 }}>
              Sign in
            </Button>
          </Section>
          <Hr style={{ borderColor: "#e5e7eb", marginTop: 32 }} />
          <Text style={{ color: "#9ca3af", fontSize: 12 }}>If you didn't request this, you can safely ignore this email.</Text>
        </Container>
      </Body>
    </Html>
  );
}
