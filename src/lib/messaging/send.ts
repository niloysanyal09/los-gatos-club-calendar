import { execFile } from "child_process";
import { promisify } from "util";

const exec = promisify(execFile);

/**
 * Channel adapters. POC: iMessage via the Mac's Messages app (free, no
 * carrier registration). Pilot: swap in Twilio behind the same signature —
 * nothing upstream changes.
 */
export async function sendMessage(
  channel: string,
  to: string,
  body: string
): Promise<{ ok: boolean; error?: string }> {
  if (channel === "imessage") return sendViaIMessage(to, body);
  if (channel === "sms") return sendViaTwilio(to, body);
  return { ok: false, error: `channel "${channel}" not deliverable` };
}

async function sendViaIMessage(to: string, body: string) {
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

async function sendViaTwilio(_to: string, _body: string) {
  // Pilot implementation: POST to Twilio Messages API with
  // TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_FROM_NUMBER.
  return { ok: false, error: "Twilio not configured (pilot feature)" };
}
