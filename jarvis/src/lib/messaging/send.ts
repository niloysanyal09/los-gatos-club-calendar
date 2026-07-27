import { execFile } from "child_process";
import { promisify } from "util";
import { prisma } from "../db";

const exec = promisify(execFile);

/**
 * Channel adapters.
 *
 * iMessage can only be sent from the Mac (Messages.app). When this process IS
 * the Mac (JARVIS_IMESSAGE_GATEWAY=local — set in the Mac's .env, never on
 * Vercel), we send directly via osascript. Anywhere else (the hosted app),
 * messages are queued in OutboundMessage and the Mac's bridge daemon drains
 * the queue within seconds. Pilot: a Twilio adapter replaces both paths.
 */
const isLocalGateway = () => process.env.JARVIS_IMESSAGE_GATEWAY === "local";

export async function sendMessage(
  channel: string,
  to: string,
  body: string
): Promise<{ ok: boolean; queued?: boolean; error?: string }> {
  if (channel === "imessage") {
    if (isLocalGateway()) return sendViaIMessage(to, body);
    await prisma.outboundMessage.create({ data: { channel, to, body } });
    return { ok: true, queued: true };
  }
  if (channel === "sms") return sendViaTwilio(to, body);
  return { ok: false, error: `channel "${channel}" not deliverable` };
}

export async function sendViaIMessage(to: string, body: string) {
  const script = `
    on run {targetPhone, msgBody}
      tell application "Messages"
        set targetService to 1st service whose service type = iMessage
        set targetBuddy to buddy targetPhone of targetService
        send msgBody to targetBuddy
      end tell
    end run`;
  try {
    await exec("osascript", ["-e", script, to, body]);
    return { ok: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("iMessage send failed:", msg);
    return { ok: false, error: msg };
  }
}

/** Drain queued outbound messages (runs on the Mac, from the bridge/daily job). */
export async function drainOutbox(): Promise<number> {
  const queued = await prisma.outboundMessage.findMany({
    where: { status: "queued", attempts: { lt: 3 } },
    orderBy: { createdAt: "asc" },
    take: 20,
  });
  let sent = 0;
  for (const m of queued) {
    const res = await sendViaIMessage(m.to, m.body);
    await prisma.outboundMessage.update({
      where: { id: m.id },
      data: res.ok
        ? { status: "sent", sentAt: new Date() }
        : { attempts: m.attempts + 1, status: m.attempts + 1 >= 3 ? "failed" : "queued" },
    });
    if (res.ok) sent++;
  }
  return sent;
}

async function sendViaTwilio(_to: string, _body: string) {
  // Pilot implementation: POST to Twilio Messages API with
  // TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_FROM_NUMBER.
  return { ok: false, error: "Twilio not configured (pilot feature)" };
}
