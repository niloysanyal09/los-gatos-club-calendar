import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { anthropicConfigured } from "@/lib/anthropic";
import { getSessionUser } from "@/lib/session";
import DigestClient from "./DigestClient";

export const dynamic = "force-dynamic";

const LANE_LABEL: Record<string, string> = {
  clubs: "Clubs & sessions",
  movies: "Movies",
  events: "Local events",
  "tv-sports": "On TV",
};

export default async function DigestPage() {
  const user = await getSessionUser();
  if (!user) redirect("/onboarding");

  const proposals = await prisma.candidateEvent.findMany({
    where: { userId: user.id, status: "proposed", startTime: { gt: new Date() } },
    orderBy: [{ score: "desc" }, { startTime: "asc" }],
  });

  const lanes = ["clubs", "movies", "events", "tv-sports"]
    .map((lane) => ({
      lane,
      label: LANE_LABEL[lane],
      items: proposals.filter((p) => p.lane === lane),
    }))
    .filter((l) => l.items.length > 0);

  return (
    <div>
      <div className="row spread">
        <div>
          <h1>This week&apos;s picks</h1>
          <p className="sub">
            Ranked for you{user.address ? ` · within ${user.radiusMiles} mi of home` : ""}
            {!user.calendarLinked && " · calendar not linked yet"}
          </p>
        </div>
      </div>

      {!anthropicConfigured() && (
        <div className="notice">
          <strong>Seeded mode.</strong> These are real local events and venues
          (snapshot from web research) with live booking links — but the list
          won&apos;t refresh itself. Add <code>ANTHROPIC_API_KEY</code> to{" "}
          <code>.env</code> to turn on daily live discovery.
        </div>
      )}

      <DigestClient
        hasProposals={proposals.length > 0}
        canText={!!user.phone && user.channel !== "web"}
        lanes={lanes.map((l) => ({
          ...l,
          items: l.items.map((c) => ({
            id: c.id,
            title: c.title,
            description: c.description,
            venueName: c.venueName,
            venueAddress: c.venueAddress,
            distanceMiles: c.distanceMiles,
            startTime: c.startTime.toISOString(),
            cost: c.cost,
            url: c.url,
            score: c.score,
            rationale: c.rationale,
            conflict: c.conflict,
            source: c.source,
          })),
        }))}
      />
    </div>
  );
}
