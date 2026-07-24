import Link from "next/link";
import { redirect } from "next/navigation";
import { anthropicConfigured } from "@/lib/anthropic";
import { googleConfigured } from "@/lib/google/oauth";
import { parseLearned } from "@/lib/preferences/learner";
import { getSessionUser } from "@/lib/session";

export const dynamic = "force-dynamic";

function Status({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className="card row spread">
      <span>{label}</span>
      <span className="badge" style={{ color: ok ? "var(--good)" : "var(--warn)" }}>
        {ok ? "configured" : "not configured"}
      </span>
    </div>
  );
}

export default async function SettingsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/onboarding");
  const interests: string[] = JSON.parse(user.profile?.statedInterests ?? "[]");
  const teams: string[] = JSON.parse(user.profile?.sportsTeams ?? "[]");
  const learned = parseLearned(user.profile?.learned ?? "{}");
  const affinities = Object.entries(learned.categoryAffinity).sort((a, b) => b[1] - a[1]);

  return (
    <div>
      <h1>Settings</h1>
      <p className="sub">{user.name ?? "You"} · {user.address} · {user.radiusMiles} mi radius</p>

      <h2>Profile</h2>
      <div className="card">
        <div className="meta">Stated interests</div>
        <div className="chips">{interests.map((i) => <span key={i} className="chip on">{i}</span>)}</div>
        <div className="meta" style={{ marginTop: 12 }}>Sports on TV</div>
        <div className="chips">{teams.map((t) => <span key={t} className="chip on">{t}</span>)}</div>
        <div style={{ marginTop: 14 }}>
          <Link href="/onboarding" className="btn btn-ghost">Edit profile</Link>
        </div>
      </div>

      <h2>What Jarvis has learned</h2>
      <div className="card">
        {affinities.length === 0 ? (
          <p className="meta">Nothing yet — approve or pass on picks and this fills in.</p>
        ) : (
          <div className="chips">
            {affinities.map(([k, v]) => (
              <span key={k} className="chip" style={{ color: v > 0 ? "var(--good)" : v < 0 ? "var(--bad)" : undefined }}>
                {k.replace("lane:", "")} {v > 0 ? "+" : ""}{v.toFixed(1)}
              </span>
            ))}
          </div>
        )}
      </div>

      <h2>Connections</h2>
      <div className="card row spread">
        <span>Google Calendar</span>
        {user.calendarLinked ? (
          <span className="badge booked">linked</span>
        ) : googleConfigured() ? (
          <a href="/api/auth/google" className="btn btn-primary">Link now</a>
        ) : (
          <span className="badge">add GOOGLE_CLIENT_ID / SECRET to .env</span>
        )}
      </div>
      <Status ok={anthropicConfigured()} label="Anthropic API (live discovery + ranking)" />
      <Status ok={!!process.env.TICKETMASTER_API_KEY} label="Ticketmaster (concerts & big events)" />
      <div className="card row spread">
        <span>Text channel</span>
        <span className="badge">
          {user.channel === "web" ? "web only" : `${user.channel} → ${user.phone ?? "no number"}`}
        </span>
      </div>

      <h2>Payments</h2>
      <div className="card row spread">
        <span>Payment portal (book paid tickets from a text)</span>
        <span className="badge">pilot feature — coming soon</span>
      </div>

      <h2>Setup</h2>
      <div className="notice">
        Keys live in <code>.env</code> at the project root — see <code>.env.example</code> for
        where to get each one. Restart the dev server after editing. Jarvis&apos;s
        main interface is SMS: the daily 8 AM job texts what&apos;s new, and you
        reply to book. These web pages are for setup and debugging.
      </div>
    </div>
  );
}
