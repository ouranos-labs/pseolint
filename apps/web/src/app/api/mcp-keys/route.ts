import { NextResponse } from "next/server";
import { z } from "zod";
import { getOptionalSession } from "@/lib/session";
import { createMcpKey, listMcpKeys, revokeMcpKey } from "@/lib/mcp-keys";

export const runtime = "nodejs";

const createSchema = z.object({ name: z.string().min(1).max(100).default("MCP key") });
const deleteSchema = z.object({ id: z.string().min(1) });

async function requireUserId(): Promise<string | null> {
  const session = await getOptionalSession();
  return session?.user?.id ?? null;
}

export async function GET(): Promise<Response> {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ keys: await listMcpKeys(userId) });
}

export async function POST(req: Request): Promise<Response> {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = createSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const { token, prefix } = await createMcpKey(userId, parsed.data.name);
  return NextResponse.json({ token, prefix }, { status: 201 });
}

export async function DELETE(req: Request): Promise<Response> {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = deleteSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "id is required" }, { status: 400 });

  await revokeMcpKey(userId, parsed.data.id);
  return NextResponse.json({ ok: true });
}
