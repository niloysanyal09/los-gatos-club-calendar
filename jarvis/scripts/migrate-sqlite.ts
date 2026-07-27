/**
 * One-time migration: copy all data from the old SQLite file (prisma/dev.db)
 * into the Postgres database that DATABASE_URL now points at.
 *
 *   npx tsx scripts/migrate-sqlite.ts
 */
import "./loadEnv";
import { execFileSync } from "child_process";
import { prisma } from "../src/lib/db";

const DB = "prisma/dev.db";

function rows(table: string): Record<string, unknown>[] {
  const out = execFileSync("sqlite3", ["-json", DB, `SELECT * FROM ${table};`], {
    encoding: "utf8",
  });
  return out.trim() ? JSON.parse(out) : [];
}

const d = (v: unknown) => (v == null ? null : new Date(Number(v)));
const b = (v: unknown) => !!v;

async function main() {
  const users = rows("User");
  for (const u of users) {
    await prisma.user.upsert({
      where: { id: u.id as string },
      update: {},
      create: {
        id: u.id as string,
        email: (u.email as string) ?? null,
        name: (u.name as string) ?? null,
        phone: (u.phone as string) ?? null,
        channel: (u.channel as string) ?? "web",
        address: (u.address as string) ?? null,
        lat: (u.lat as number) ?? null,
        lng: (u.lng as number) ?? null,
        radiusMiles: (u.radiusMiles as number) ?? 10,
        googleAccessToken: (u.googleAccessToken as string) ?? null,
        googleRefreshToken: (u.googleRefreshToken as string) ?? null,
        googleTokenExpiry: d(u.googleTokenExpiry),
        calendarLinked: b(u.calendarLinked),
        createdAt: d(u.createdAt) ?? new Date(),
      },
    });
  }
  console.log(`users: ${users.length}`);

  for (const p of rows("PreferenceProfile")) {
    await prisma.preferenceProfile.upsert({
      where: { id: p.id as string },
      update: {},
      create: {
        id: p.id as string,
        userId: p.userId as string,
        statedInterests: (p.statedInterests as string) ?? "[]",
        sportsTeams: (p.sportsTeams as string) ?? "[]",
        memberClubs: (p.memberClubs as string) ?? "[]",
        autoBookRules: (p.autoBookRules as string) ?? "[]",
        learned: p.learned as string,
      },
    });
  }
  console.log("profiles: done");

  const candidates = rows("CandidateEvent");
  for (const c of candidates) {
    await prisma.candidateEvent
      .create({
        data: {
          id: c.id as string,
          userId: c.userId as string,
          lane: c.lane as string,
          category: (c.category as string) ?? null,
          title: c.title as string,
          description: (c.description as string) ?? null,
          venueName: (c.venueName as string) ?? null,
          venueAddress: (c.venueAddress as string) ?? null,
          distanceMiles: (c.distanceMiles as number) ?? null,
          startTime: d(c.startTime)!,
          endTime: d(c.endTime),
          cost: (c.cost as string) ?? null,
          url: (c.url as string) ?? null,
          source: c.source as string,
          score: (c.score as number) ?? null,
          rationale: (c.rationale as string) ?? null,
          conflict: b(c.conflict),
          status: c.status as string,
          googleEventId: (c.googleEventId as string) ?? null,
          digestIndex: (c.digestIndex as number) ?? null,
          digestedAt: d(c.digestedAt),
          dedupeKey: c.dedupeKey as string,
          createdAt: d(c.createdAt) ?? new Date(),
        },
      })
      .catch(() => {}); // dupes on re-run are fine
  }
  console.log(`candidates: ${candidates.length}`);

  for (const f of rows("FeedbackEvent")) {
    await prisma.feedbackEvent
      .create({
        data: {
          id: f.id as string,
          userId: f.userId as string,
          candidateId: f.candidateId as string,
          lane: f.lane as string,
          category: (f.category as string) ?? null,
          title: f.title as string,
          action: f.action as string,
          createdAt: d(f.createdAt) ?? new Date(),
        },
      })
      .catch(() => {});
  }
  for (const s of rows("SpendLog")) {
    await prisma.spendLog
      .create({
        data: {
          id: s.id as string,
          inputTokens: s.inputTokens as number,
          outputTokens: s.outputTokens as number,
          searches: s.searches as number,
          cacheRead: (s.cacheRead as number) ?? 0,
          cacheWrite: (s.cacheWrite as number) ?? 0,
          estCostUsd: s.estCostUsd as number,
          createdAt: d(s.createdAt) ?? new Date(),
        },
      })
      .catch(() => {});
  }
  console.log("feedback + spend: done");

  const check = await prisma.user.findFirst({ where: { email: { not: null } } });
  console.log(`verify: ${check?.name} linked=${check?.calendarLinked} phone=${check?.phone}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
