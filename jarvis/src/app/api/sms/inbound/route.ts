import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { handleInbound } from "@/lib/messaging";

// A first text may launch the full discovery pass when the scheduled digest
// was missed. Keep the webhook alive long enough to finish that work.
export const maxDuration = 300;

/**
 * Inbound message webhook.
 * Accepts JSON {"from": "+1650...", "text": "1, 3"} (used by the iMessage
 * bridge script) or Twilio's form-encoded webhook (From / Body).
 */
export async function POST(req: NextRequest) {
  let from = "";
  let text = "";
  const contentType = req.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const body = await req.json();
    from = body.from ?? "";
    text = body.text ?? "";
  } else {
    const form = await req.formData();
    from = String(form.get("From") ?? "");
    text = String(form.get("Body") ?? "");
  }
  if (!from || !text) return NextResponse.json({ error: "missing from/text" }, { status: 400 });

  const normalized = from.replace(/[^\d+]/g, "");
  const users = await prisma.user.findMany({ where: { phone: { not: null } } });
  const user = users.find(
    (u) => u.phone && u.phone.replace(/[^\d+]/g, "").endsWith(normalized.slice(-10))
  );
  if (!user) return NextResponse.json({ error: "unknown sender" }, { status: 404 });

  const result = await handleInbound(user.id, text);
  return NextResponse.json({ ok: true, ...result });
}
