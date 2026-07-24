/**
 * iMessage reply bridge (POC only — Twilio replaces this in the pilot).
 *
 * Polls the Mac's Messages database for new inbound texts from registered
 * users and forwards them to the app's inbound webhook, which parses the
 * reply, books approved events, and texts back a confirmation.
 *
 * Requirements:
 *   - The dev server running (npm run dev)
 *   - Full Disk Access granted to the terminal/node running this script
 *     (System Settings → Privacy & Security → Full Disk Access), because
 *     Messages history lives in ~/Library/Messages/chat.db
 *
 *   npx tsx scripts/imessage-bridge.ts
 */
import "./loadEnv";
import { execFile } from "child_process";
import { promisify } from "util";
import { prisma } from "../src/lib/db";

const exec = promisify(execFile);
const CHAT_DB = `${process.env.HOME}/Library/Messages/chat.db`;
const APP = process.env.APP_URL ?? "http://localhost:3000";
const POLL_MS = 5000;

// Apple stores dates as nanoseconds since 2001-01-01
const APPLE_EPOCH_MS = Date.UTC(2001, 0, 1);
let sinceApple = (Date.now() - APPLE_EPOCH_MS) * 1_000_000;

async function query(sql: string): Promise<string[][]> {
  const { stdout } = await exec("sqlite3", ["-readonly", "-separator", "", CHAT_DB, sql]);
  return stdout.split("\n").filter(Boolean).map((l) => l.split(""));
}

// Tapback types in chat.db: 2000 ❤️ · 2001 👍 · 2002 👎 · 2003 😂 · 2004 ‼️ · 2005 ❓
const TAPBACK_CMD: Record<string, string> = {
  "2000": "book",
  "2001": "book",
  "2002": "no",
  "2004": "maybe",
  "2005": "maybe",
};

async function relay(from: string, text: string) {
  console.log(`← ${from}: ${text}`);
  const res = await fetch(`${APP}/api/sms/inbound`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ from, text }),
  });
  const data = await res.json().catch(() => ({}));
  console.log(`→ handled: ${JSON.stringify(data.results ?? data.error ?? data)}`);
}

async function poll(phones: Map<string, string>, selfPhone: string) {
  // 1. Plain incoming texts (works when the sender isn't this Mac's account)
  const rows = await query(
    `SELECT h.id, m.text, m.date FROM message m
     JOIN handle h ON m.handle_id = h.ROWID
     WHERE m.is_from_me = 0 AND m.text IS NOT NULL AND m.date > ${sinceApple}
     ORDER BY m.date ASC LIMIT 50;`
  );
  for (const [handle, text, date] of rows) {
    sinceApple = Math.max(sinceApple, Number(date));
    const digits = handle.replace(/[^\d]/g, "").slice(-10);
    if (!phones.has(digits)) continue;
    await relay(handle, text);
  }

  // 2. Tapbacks (👍/👎/‼️ on a numbered pick) — unambiguous even in the
  //    self-chat POC, because Jarvis never sends reactions.
  const taps = await query(
    `SELECT m.associated_message_type, m.associated_message_guid, m.date FROM message m
     WHERE m.associated_message_type BETWEEN 2000 AND 2005 AND m.date > ${sinceApple}
     ORDER BY m.date ASC LIMIT 50;`
  );
  for (const [type, assocGuid, date] of taps) {
    sinceApple = Math.max(sinceApple, Number(date));
    const cmd = TAPBACK_CMD[type];
    if (!cmd || !assocGuid) continue;
    // Guid arrives as "p:0/<GUID>" or "bp:<GUID>" — strip the prefix
    const guid = assocGuid.replace(/^p:\d+\//, "").replace(/^bp:/, "");
    const target = await query(
      `SELECT text FROM message WHERE guid = '${guid.replace(/'/g, "''")}' LIMIT 1;`
    );
    const targetText = target[0]?.[0] ?? "";
    const pickNum = targetText.match(/^\s*(\d+)\./)?.[1];
    if (!pickNum) continue; // reaction to something other than a pick
    await relay(selfPhone, `${cmd} ${pickNum}`);
  }
}

async function main() {
  const users = await prisma.user.findMany({ where: { phone: { not: null } } });
  const phones = new Map(users.map((u) => [u.phone!.replace(/[^\d]/g, "").slice(-10), u.id]));
  if (!phones.size) {
    console.log("No users with a phone number yet. Onboard first at " + APP);
    return;
  }
  try {
    await query("SELECT 1;");
  } catch {
    console.error(
      "Cannot read Messages database. Grant Full Disk Access to your terminal " +
        "(System Settings → Privacy & Security → Full Disk Access), then rerun."
    );
    process.exit(1);
  }
  const selfPhone = users[0].phone!;
  console.log(
    `Bridge running — watching replies and Tapbacks (👍 book · 👎 pass · ‼️ maybe) from ${phones.size} user(s). Ctrl-C to stop.`
  );
  setInterval(
    () => poll(phones, selfPhone).catch((e) => console.error("poll error:", e.message)),
    POLL_MS
  );
}

main();
