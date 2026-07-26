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
process.env.JARVIS_IMESSAGE_GATEWAY = "local"; // this process IS the Mac gateway
import { execFile } from "child_process";
import { promisify } from "util";
import { prisma } from "../src/lib/db";
import { drainOutbox } from "../src/lib/messaging/send";

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

/**
 * Newer macOS often leaves message.text NULL and stores the content in the
 * attributedBody blob (NSKeyedArchiver). Extract the string: after the
 * "NSString" marker comes 0x2B ('+'), then a length byte (or 0x81 + uint16),
 * then the UTF-8 text.
 */
function decodeAttributedBody(hex: string): string {
  try {
    const buf = Buffer.from(hex, "hex");
    const marker = buf.indexOf(Buffer.from("NSString"));
    if (marker < 0) return "";
    const plus = buf.indexOf(0x2b, marker);
    if (plus < 0) return "";
    let len = buf[plus + 1];
    let start = plus + 2;
    if (len === 0x81) {
      len = buf.readUInt16LE(plus + 2);
      start = plus + 4;
    }
    return buf.subarray(start, start + len).toString("utf8");
  } catch {
    return "";
  }
}

// Bodies Jarvis itself sent recently — so the self-chat scan never mistakes
// our own messages for user replies.
const sentByJarvis = new Set<string>();

// Texts already relayed in the last 2 minutes — the self chat surfaces each
// message twice (sent + received copy), so identical repeats are dropped.
const recentlyRelayed = new Map<string, number>();
function alreadyRelayed(text: string): boolean {
  const now = Date.now();
  for (const [k, t] of recentlyRelayed) if (now - t > 120_000) recentlyRelayed.delete(k);
  if (recentlyRelayed.has(text)) return true;
  recentlyRelayed.set(text, now);
  return false;
}

async function jarvisSentRecently(text: string): Promise<boolean> {
  if (sentByJarvis.has(text)) return true;
  const row = await prisma.outboundMessage.findFirst({
    where: { body: text, sentAt: { gt: new Date(Date.now() - 3 * 3600_000) } },
  });
  return !!row;
}

async function poll(phones: Map<string, string>, selfPhone: string) {
  // 0. Send anything the hosted app queued (welcome texts, digests) —
  //    remembering the bodies so the self-chat scan can skip them
  try {
    const queued = await prisma.outboundMessage.findMany({
      where: { status: "queued" },
      select: { body: true },
    });
    queued.forEach((q) => sentByJarvis.add(q.body));
    const drained = await drainOutbox();
    if (drained) console.log(`→ sent ${drained} queued message(s) from the hosted app`);
  } catch (e) {
    console.error("outbox drain error:", (e as Error).message);
  }

  // 1a. Incoming texts from other numbers (e.g. Sanjeev) — the normal case
  const rows = await query(
    `SELECT h.id, m.text, hex(m.attributedBody), m.date FROM message m
     JOIN handle h ON m.handle_id = h.ROWID
     WHERE m.is_from_me = 0 AND (m.text IS NOT NULL OR m.attributedBody IS NOT NULL)
       AND m.associated_message_type = 0 AND m.date > ${sinceApple}
     ORDER BY m.date ASC LIMIT 50;`
  );
  for (const [handle, rawText, bodyHex, date] of rows) {
    sinceApple = Math.max(sinceApple, Number(date));
    const text = rawText || decodeAttributedBody(bodyHex);
    if (!text) continue;
    const digits = handle.replace(/[^\d]/g, "").slice(-10);
    if (!phones.has(digits)) continue;
    // Never re-ingest Jarvis's own output (the self chat mirrors sends as
    // received copies) and never relay the same text twice.
    if (await jarvisSentRecently(text)) continue;
    if (alreadyRelayed(text)) continue;
    await relay(handle, text);
  }

  // 1b. Self-chat replies (texting Jarvis from this Mac's own number, the
  //     solo-tester setup): those arrive as is_from_me=1 in the Notes-to-self
  //     thread, so scope to that chat and skip anything Jarvis itself sent.
  const selfDigits = selfPhone.replace(/[^\d]/g, "").slice(-10);
  const selfRows = await query(
    `SELECT m.text, hex(m.attributedBody), m.date FROM message m
     JOIN chat_message_join cmj ON cmj.message_id = m.ROWID
     JOIN chat c ON c.ROWID = cmj.chat_id
     WHERE m.is_from_me = 1 AND (m.text IS NOT NULL OR m.attributedBody IS NOT NULL)
       AND m.date > ${sinceApple}
       AND m.associated_message_type = 0
       AND replace(replace(replace(c.chat_identifier,'+',''),'-',''),' ','') LIKE '%${selfDigits}'
     ORDER BY m.date ASC LIMIT 50;`
  );
  for (const [rawText, bodyHex, date] of selfRows) {
    sinceApple = Math.max(sinceApple, Number(date));
    const text = rawText || decodeAttributedBody(bodyHex);
    if (!text) continue;
    if (await jarvisSentRecently(text)) continue;
    if (alreadyRelayed(text)) continue;
    await relay(selfPhone, text);
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

async function loadPhones(): Promise<Map<string, string>> {
  const users = await prisma.user.findMany({ where: { phone: { not: null } } });
  return new Map(users.map((u) => [u.phone!.replace(/[^\d]/g, "").slice(-10), u.id]));
}

async function main() {
  let phones = await loadPhones();
  try {
    await query("SELECT 1;");
  } catch {
    console.error(
      "Cannot read Messages database. Grant Full Disk Access to your terminal " +
        "(System Settings → Privacy & Security → Full Disk Access), then rerun."
    );
    process.exit(1);
  }
  const selfPhone = process.env.JARVIS_SELF_PHONE ?? [...phones.keys()][0] ?? "";
  console.log(
    `Bridge running — gateway for ${phones.size} user(s); replies, chat, and Tapbacks (👍 book · 👎 pass · ‼️ maybe) all flow through here. Ctrl-C to stop.`
  );
  let tick = 0;
  setInterval(() => {
    void (async () => {
      // Pick up newly onboarded users (e.g. Sanjeev) without a restart
      if (tick++ % 6 === 0) phones = await loadPhones().catch(() => phones);
      await poll(phones, selfPhone);
    })().catch((e) => console.error("poll error:", (e as Error).message));
  }, POLL_MS);
}

main();
