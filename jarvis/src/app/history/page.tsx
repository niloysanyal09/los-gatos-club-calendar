import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function HistoryPage() {
  const user = await getSessionUser();
  if (!user) redirect("/onboarding");

  const decided = await prisma.candidateEvent.findMany({
    where: { userId: user.id, status: { in: ["booked", "approved", "declined", "snoozed"] } },
    orderBy: { startTime: "asc" },
  });
  const booked = decided.filter((c) => c.status === "booked" || c.status === "approved");
  const passed = decided.filter((c) => c.status === "declined");
  const maybes = decided.filter((c) => c.status === "snoozed");

  const fmt = (d: Date) =>
    d.toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

  return (
    <div>
      <h1>History</h1>
      <p className="sub">Everything Jarvis has booked or learned from.</p>

      <h2>Booked ({booked.length})</h2>
      {booked.length === 0 && <p className="sub">Nothing booked yet.</p>}
      {booked.map((c) => (
        <div key={c.id} className="card row spread">
          <div>
            <div className="title">{c.title}</div>
            <div className="meta">{fmt(c.startTime)}{c.venueName ? ` · ${c.venueName}` : ""}</div>
          </div>
          <span className="badge booked">
            {c.googleEventId ? "on Google Calendar" : "saved locally"}
          </span>
        </div>
      ))}

      <h2>Maybe later ({maybes.length})</h2>
      {maybes.map((c) => (
        <div key={c.id} className="card">
          <div className="title">{c.title}</div>
          <div className="meta">{fmt(c.startTime)}</div>
        </div>
      ))}

      <h2>Passed ({passed.length})</h2>
      {passed.map((c) => (
        <div key={c.id} className="card">
          <div className="title" style={{ color: "var(--muted)" }}>{c.title}</div>
          <div className="meta">{fmt(c.startTime)} · Jarvis learns from every pass</div>
        </div>
      ))}
    </div>
  );
}
