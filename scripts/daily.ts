/**
 * The daily heartbeat — Jarvis's "seamless backend". Runs every morning via
 * launchd (see scripts/install-daily-job.sh) or manually with `npm run daily`.
 *
 * Incremental by design — each pass only deals with what changed since
 * yesterday:
 *   1. Calendar changes: Jarvis-booked events the user deleted become
 *      negative preference signals; conflicts are re-checked against the
 *      current calendar.
 *   2. Preference changes: approvals/passes since yesterday already updated
 *      the profile; today's ranking uses the fresh weights.
 *   3. External changes: discovery dedupes against everything already seen,
 *      so only genuinely new events enter the pipeline.
 *   4. The SMS digest sends ONLY picks never texted before.
 */
import "./loadEnv";
import { prisma } from "../src/lib/db";
import { runDiscovery } from "../src/lib/discovery";
import { applyFeedback } from "../src/lib/preferences/learner";
import { findDeletedBookings } from "../src/lib/google/calendar";
import { sendDigest } from "../src/lib/messaging";

async function processUser(user: { id: string; name: string | null; phone: string | null; channel: string; calendarLinked: boolean }) {
  const tag = user.name ?? user.id;

  // 1. Learn from calendar deletions since the last run
  if (user.calendarLinked) {
    const booked = await prisma.candidateEvent.findMany({
      where: { userId: user.id, status: "booked", googleEventId: { not: null }, startTime: { gt: new Date() } },
    });
    if (booked.length) {
      const deleted = await findDeletedBookings(user.id, booked.map((b) => b.googleEventId!)).catch(() => []);
      for (const gid of deleted) {
        const c = booked.find((b) => b.googleEventId === gid)!;
        await applyFeedback(user.id, c, "declined");
        await prisma.candidateEvent.update({ where: { id: c.id }, data: { status: "removed" } });
        console.log(`  ${tag}: learned from removed booking "${c.title}"`);
      }
    }
  }

  // 2. Expire proposals whose start time has passed (never re-texted)
  await prisma.candidateEvent.updateMany({
    where: { userId: user.id, status: "proposed", startTime: { lt: new Date() } },
    data: { status: "expired" },
  });

  // 3. Discover what's new out in the world (dedupes internally), re-rank, re-check conflicts
  const summary = await runDiscovery(user.id);
  console.log(`  ${tag}: +${summary.added} new events (${summary.mode} mode)`, summary.laneCounts);

  // 4. Text only what's new
  if (user.phone && user.channel !== "web") {
    const sent = await sendDigest(user.id, { onlyNew: true });
    console.log(
      sent.ok
        ? `  ${tag}: texted ${"count" in sent ? sent.count : "?"} new picks`
        : `  ${tag}: no text sent (${sent.error})`
    );
  }
}

async function main() {
  const users = await prisma.user.findMany({ where: { profile: { isNot: null } } });
  if (!users.length) {
    console.log("No onboarded users yet — visit the web app to onboard first.");
    return;
  }
  console.log(`Daily run — ${new Date().toLocaleString()} — ${users.length} user(s)`);
  for (const user of users) {
    await processUser(user).catch((e) => console.error(`  ${user.name ?? user.id}: failed —`, e.message));
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
