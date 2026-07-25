/**
 * Smoke test for the Google sign-in account merge.
 *
 * Runs resolveGoogleUser (the real function the OAuth callback calls) against a
 * throwaway sqlite file, so the two funnel paths can be checked without
 * clicking through a live Google consent screen.
 *
 *   npm run test:oauth
 */
import { execFileSync } from "node:child_process";
import { rmSync } from "node:fs";
import path from "node:path";

const DB = path.join(process.cwd(), "prisma", "test-oauth-merge.db");
process.env.DATABASE_URL = `file:${DB}`;

let failures = 0;

function check(label: string, ok: boolean, detail = "") {
  console.log(`${ok ? "  PASS" : "  FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

async function main() {
  rmSync(DB, { force: true });
  execFileSync("npx", ["prisma", "db", "push", "--skip-generate", "--accept-data-loss"], {
    env: { ...process.env, DATABASE_URL: `file:${DB}` },
    stdio: "pipe",
  });

  // Imported after DATABASE_URL is pointed at the scratch file so the Prisma
  // client in src/lib/db picks it up.
  const { prisma } = await import("../src/lib/db");
  const { resolveGoogleUser } = await import("../src/lib/google/link");

  // ---- Path A: first-time sign-in -------------------------------------
  console.log("\nPath A — first-time sign-in (no account for this email yet)");
  const shellA = await prisma.user.create({ data: {} });
  const resolvedA = await resolveGoogleUser(shellA.id, "newcomer@example.com");
  check("keeps the shell user", resolvedA === shellA.id, `resolved=${resolvedA}`);
  check("shell row still exists", !!(await prisma.user.findUnique({ where: { id: shellA.id } })));

  // The callback then stamps identity + tokens onto the resolved row.
  await prisma.user.update({
    where: { id: resolvedA },
    data: { name: "New Comer", email: "newcomer@example.com", calendarLinked: true },
  });
  const afterA = await prisma.user.findUnique({ where: { id: resolvedA } });
  check("email written to the shell", afterA?.email === "newcomer@example.com");
  check("total users == 1", (await prisma.user.count()) === 1);

  // ---- Path B: returning user, empty shell ----------------------------
  console.log("\nPath B — returning user, shell is empty (ad-click funnel)");
  const shellB = await prisma.user.create({ data: {} });
  check("two rows before merge", (await prisma.user.count()) === 2);
  const resolvedB = await resolveGoogleUser(shellB.id, "newcomer@example.com");
  check("adopts the existing account", resolvedB === resolvedA, `resolved=${resolvedB}`);
  check("empty shell was deleted", !(await prisma.user.findUnique({ where: { id: shellB.id } })));
  check("back to 1 user, no duplicate", (await prisma.user.count()) === 1);

  // ---- Path C: returning user whose shell has a PreferenceProfile -----
  // This is the OnboardForm path: /api/onboard creates user + profile, then
  // redirects to /api/auth/google. The old code hit a foreign key violation
  // here and swallowed it, leaking an orphan.
  console.log("\nPath C — returning user, shell carries onboarding answers");
  const shellC = await prisma.user.create({
    data: { address: "925 Siskiyou Dr, Menlo Park, CA", lat: 37.4, lng: -122.2 },
  });
  await prisma.preferenceProfile.create({
    data: { userId: shellC.id, statedInterests: JSON.stringify(["tennis"]) },
  });
  const resolvedC = await resolveGoogleUser(shellC.id, "newcomer@example.com");
  check("session moves to the existing account", resolvedC === resolvedA, `resolved=${resolvedC}`);
  check(
    "onboarding answers were not silently destroyed",
    !!(await prisma.user.findUnique({ where: { id: shellC.id } }))
  );
  check(
    "profile survived",
    !!(await prisma.preferenceProfile.findUnique({ where: { userId: shellC.id } }))
  );

  // ---- Path D: no email came back from Google -------------------------
  console.log("\nPath D — userinfo lookup failed, no email");
  const shellD = await prisma.user.create({ data: {} });
  const resolvedD = await resolveGoogleUser(shellD.id, undefined);
  check("falls back to the shell user", resolvedD === shellD.id);

  // ---- Path E: signing in again while already on the right account ----
  console.log("\nPath E — re-linking Google on the account you are already in");
  const resolvedE = await resolveGoogleUser(resolvedA, "newcomer@example.com");
  check("no-op, same id back", resolvedE === resolvedA);
  check("account not deleted", !!(await prisma.user.findUnique({ where: { id: resolvedA } })));

  await prisma.$disconnect();
  rmSync(DB, { force: true });

  console.log(failures === 0 ? "\nAll merge paths passed.\n" : `\n${failures} check(s) failed.\n`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
