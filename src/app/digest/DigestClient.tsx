"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

interface Item {
  id: string;
  title: string;
  description: string | null;
  venueName: string | null;
  venueAddress: string | null;
  distanceMiles: number | null;
  startTime: string;
  cost: string | null;
  url: string | null;
  score: number | null;
  rationale: string | null;
  conflict: boolean;
  source: string;
}

export default function DigestClient({
  lanes,
  hasProposals,
  canText,
}: {
  lanes: { lane: string; label: string; items: Item[] }[];
  hasProposals: boolean;
  canText: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [decided, setDecided] = useState<Record<string, string>>({});

  async function runDiscovery() {
    setBusy(true);
    setMsg("Discovering events near you… this can take a couple of minutes in live mode.");
    const res = await fetch("/api/discover", { method: "POST" });
    const data = await res.json();
    setBusy(false);
    setMsg(
      res.ok
        ? `Found ${data.found} events (${data.added} new) in ${data.mode} mode.`
        : data.error ?? "Discovery failed."
    );
    router.refresh();
  }

  async function sendDigest() {
    setBusy(true);
    setMsg("Sending your digest…");
    const res = await fetch("/api/digest/send", { method: "POST" });
    const data = await res.json();
    setBusy(false);
    setMsg(res.ok ? `Texted you ${data.count} picks. Reply to the text to book!` : data.error ?? "Send failed.");
  }

  async function decide(id: string, action: "approved" | "declined" | "snoozed") {
    setDecided((d) => ({ ...d, [id]: "…" }));
    const res = await fetch("/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ candidateId: id, action }),
    });
    const data = await res.json();
    const label = !res.ok
      ? "error"
      : action === "approved"
        ? data.bookedOnCalendar ? "Booked on Google Calendar ✓" : "Saved ✓ (link calendar to sync)"
        : action === "declined" ? "Passed" : "Maybe later";
    setDecided((d) => ({ ...d, [id]: label }));
  }

  return (
    <div>
      <div className="row" style={{ marginBottom: 20 }}>
        <button className="btn-primary" onClick={runDiscovery} disabled={busy}>
          {busy ? "Working…" : "Run discovery"}
        </button>
        {hasProposals && canText && (
          <button onClick={sendDigest} disabled={busy}>Text me this digest</button>
        )}
      </div>
      {msg && <div className="notice">{msg}</div>}

      {!hasProposals && !busy && (
        <div className="card">
          <p className="meta">
            No picks yet. Hit <strong>Run discovery</strong> to scan clubs, movies,
            local events, and TV sports near you.
          </p>
        </div>
      )}

      {lanes.map((l) => (
        <section key={l.lane}>
          <h2>{l.label}</h2>
          {l.items.map((c) => (
            <div key={c.id} className="card">
              <div className="row spread">
                <div style={{ flex: 1, minWidth: 240 }}>
                  <div className="row">
                    <span
                      className={`score ${(c.score ?? 0) >= 75 ? "hi" : (c.score ?? 0) >= 55 ? "mid" : "lo"}`}
                    >
                      {c.score ?? "–"}
                    </span>
                    <div>
                      <div className="title">{c.title}</div>
                      <div className="meta">
                        {new Date(c.startTime).toLocaleString("en-US", {
                          weekday: "short", month: "short", day: "numeric",
                          hour: "numeric", minute: "2-digit",
                        })}
                        {c.venueName && <> · {c.venueName}</>}
                        {c.distanceMiles != null && <> · {c.distanceMiles.toFixed(1)} mi</>}
                        {c.cost && <> · {c.cost}</>}
                      </div>
                    </div>
                  </div>
                  {c.rationale && <p className="why">“{c.rationale}”</p>}
                  <div className="row" style={{ marginTop: 8 }}>
                    {c.conflict && <span className="badge conflict">⚠ calendar conflict</span>}
                    {c.source === "demo" && <span className="badge demo">seeded — real event</span>}
                    {c.url && (
                      <a href={c.url} target="_blank" rel="noreferrer" className="badge">
                        details ↗
                      </a>
                    )}
                  </div>
                </div>
                <div className="row">
                  {decided[c.id] ? (
                    <span className="badge booked">{decided[c.id]}</span>
                  ) : (
                    <>
                      <button className="btn-good" onClick={() => decide(c.id, "approved")}>Book it</button>
                      <button className="btn-ghost" onClick={() => decide(c.id, "snoozed")}>Maybe</button>
                      <button className="btn-ghost btn-danger" onClick={() => decide(c.id, "declined")}>Pass</button>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}
