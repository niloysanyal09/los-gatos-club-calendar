/**
 * Smoke test for calendar conflict detection and REPLACE / KEEP resolution.
 *
 * Calendar side effects are injected as fakes, so the whole flow is exercised
 * without touching anyone's real Google Calendar.
 *
 *   npm run test:conflict
 */
import { execFileSync } from "node:child_process";
import { rmSync } from "node:fs";
import path from "node:path";

const DB = path.join(process.cwd(), "prisma", "test-conflict.db");
process.env.DATABASE_URL = `file:${DB}`;

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  console.log(`${ok ? "  PASS" : "  FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

const AUG8 = new Date("2026-08-08T23:00:00.000Z"); // Sat Aug 8, 4pm PT

async function main() {
  rmSync(DB, { force: true });
  execFileSync("npx", ["prisma", "db", "push", "--skip-generate", "--accept-data-loss"], {
    env: { ...process.env, DATABASE_URL: `file:${DB}` },
    stdio: "pipe",
  });

  const { prisma } = await import("../src/lib/db");
  const { applyAction } = await import("../src/lib/feedback");
  const { resolveConflict, findActiveConflict, CONFLICT_TTL_MS } = await import(
    "../src/lib/conflicts"
  );
  const { parseConflictReply } = await import("../src/lib/messaging/parser");
  const { conflictPromptText, conflictResolvedText } = await import("../src/lib/messaging/format");
  type CalendarOps = import("../src/lib/conflicts").CalendarOps;

  const user = await prisma.user.create({
    data: { email: "conflict@example.com", phone: "+15550000000", channel: "imessage" },
  });

  // Fake calendar. `busy` drives what findConflicts reports; deletes and
  // inserts are recorded so the assertions can check what really happened.
  const deleted: string[] = [];
  const inserted: string[] = [];
  let busy: { id: string; title: string; start: Date; end: Date }[] = [];
  const ops: CalendarOps = {
    findConflicts: async (_u, start, end) =>
      busy.filter((b) => start < b.end && end > b.start),
    deleteCalendarEvent: async (_u, id) => {
      deleted.push(id);
      busy = busy.filter((b) => b.id !== id);
      return true;
    },
    createCalendarEvent: async (_u, e) => {
      inserted.push(e.title);
      return `gcal-${inserted.length}`;
    },
  };

  const makeCandidate = (title: string) =>
    prisma.candidateEvent.create({
      data: {
        userId: user.id,
        lane: "clubs",
        category: "tennis",
        title,
        startTime: AUG8,
        endTime: new Date(AUG8.getTime() + 2 * 3600_000),
        source: "demo",
        dedupeKey: `k-${title}`,
        url: "https://example.com/tickets",
        digestIndex: 1,
      },
    });

  // ---- Case 1: no conflict → books normally --------------------------
  console.log("\nCase 1 — no conflict");
  busy = [];
  const c1 = await makeCandidate("Margarita Mixer");
  const r1 = await applyAction(c1.id, "approved", ops);
  check("no conflict raised", r1.conflict === null);
  check("booked on calendar", r1.bookedOnCalendar === true);
  check("status is booked", r1.candidate.status === "booked");
  check("exactly one insert", inserted.length === 1, `inserts=${inserted.length}`);
  check("nothing deleted", deleted.length === 0);
  check("feedback recorded", (await prisma.feedbackEvent.count()) === 1);

  // ---- Case 2: conflict + REPLACE ------------------------------------
  console.log("\nCase 2 — conflict, user replies REPLACE");
  busy = [
    {
      id: "board-dinner",
      title: "Board dinner",
      start: new Date("2026-08-08T22:30:00.000Z"),
      end: new Date("2026-08-09T01:00:00.000Z"),
    },
  ];
  const c2 = await makeCandidate("Twilight Tennis");
  const r2 = await applyAction(c2.id, "approved", ops);
  check("conflict raised", !!r2.conflict);
  check("did NOT book", r2.bookedOnCalendar === false && inserted.length === 1);
  check("candidate left proposed", r2.candidate.status === "proposed");
  check(
    "no feedback learned while pending",
    (await prisma.feedbackEvent.count()) === 1,
    "an unanswered question must not train the profile"
  );

  const active = await findActiveConflict(user.id);
  check("pending conflict is findable", !!active);
  check("pending points at the right candidate", active?.candidate.id === c2.id);

  const prompt = conflictPromptText(c2.title, c2.startTime, r2.conflict!.conflicts);
  check("prompt names the clashing event", prompt.includes("Board dinner"));
  check("prompt offers both words", prompt.includes("REPLACE") && prompt.includes("KEEP"));
  console.log("  prompt →", prompt.replace(/\n/g, "\n           "));

  check("parses 'REPLACE'", parseConflictReply("REPLACE") === "replace");
  check("parses lowercase in a sentence", parseConflictReply("replace the jazz thing") === "replace");

  const out2 = await resolveConflict(active!.pending.id, "replace", ops);
  check("resolved as replace", out2?.resolution === "replace");
  check("old event deleted", deleted.includes("board-dinner"), `deleted=${JSON.stringify(deleted)}`);
  check("new event created", inserted.length === 2 && inserted[1] === "Twilight Tennis");
  check("candidate now booked", out2?.candidate.status === "booked");
  check("feedback now recorded", (await prisma.feedbackEvent.count()) === 2);
  check("conflict marked resolved", !(await findActiveConflict(user.id)));
  console.log(
    "  ack →",
    conflictResolvedText("replace", out2!.candidate.title, out2!.removed, true, out2!.candidate.url)
      .replace(/\n/g, "\n         ")
  );

  // ---- Case 3: conflict + KEEP ---------------------------------------
  console.log("\nCase 3 — conflict, user replies KEEP");
  busy = [
    {
      id: "school-run",
      title: "Rhea pickup",
      start: new Date("2026-08-08T23:30:00.000Z"),
      end: new Date("2026-08-09T00:30:00.000Z"),
    },
  ];
  const c3 = await makeCandidate("Save Ferris");
  const r3 = await applyAction(c3.id, "approved", ops);
  check("conflict raised", !!r3.conflict);
  const active3 = await findActiveConflict(user.id);
  check("parses 'KEEP'", parseConflictReply("KEEP") === "keep");

  const insertsBefore = inserted.length;
  const deletesBefore = deleted.length;
  const out3 = await resolveConflict(active3!.pending.id, "keep", ops);
  check("resolved as keep", out3?.resolution === "keep");
  check("candidate declined", out3?.candidate.status === "declined");
  check("no calendar change at all", inserted.length === insertsBefore && deleted.length === deletesBefore);
  check("existing event untouched", busy.some((b) => b.id === "school-run"));
  check("conflict cleared", !(await findActiveConflict(user.id)));
  console.log(
    "  ack →",
    conflictResolvedText("keep", out3!.candidate.title, [], false).replace(/\n/g, "\n         ")
  );

  // ---- Case 4: guards ------------------------------------------------
  console.log("\nCase 4 — guards");
  check("ambiguous reply falls through", parseConflictReply("replace or keep?") === null);
  check("unrelated reply falls through", parseConflictReply("book 1 and 3") === null);
  // Strict word boundaries: an inflected form is not a clear answer, so it
  // falls through rather than guessing at something that deletes an event.
  check("'keeping' is not treated as KEEP", parseConflictReply("keeping my options open") === null);
  check("no false match on 'replacement'", parseConflictReply("send a replacement") === null);

  const c4 = await makeCandidate("Expired Ask");
  busy = [{ id: "x", title: "X", start: AUG8, end: new Date(AUG8.getTime() + 3600_000) }];
  await applyAction(c4.id, "approved", ops);
  await prisma.pendingConflict.updateMany({
    where: { candidateId: c4.id },
    data: { expiresAt: new Date(Date.now() - 1000) },
  });
  check("expired question is not live", !(await findActiveConflict(user.id)));
  const swept = await prisma.pendingConflict.findFirst({ where: { candidateId: c4.id } });
  check("expired question is swept, not left dangling", swept?.resolution === "expired");
  check("TTL is 24h", CONFLICT_TTL_MS === 24 * 3600_000);

  await prisma.$disconnect();
  rmSync(DB, { force: true });
  console.log(failures === 0 ? "\nAll conflict cases passed.\n" : `\n${failures} check(s) failed.\n`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
