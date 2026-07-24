"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

// The ad-click funnel needs only phone + address — the taste game handles
// interests. Power users can expand "Fine-tune" for chips, clubs, and teams.
const SUGGESTED_INTERESTS = [
  "tennis", "running", "yoga", "hiking", "live jazz", "classical music",
  "rock concerts", "stand-up comedy", "sci-fi movies", "indie films",
  "food festivals", "wine tasting", "tech meetups", "book clubs",
  "art exhibits", "theater", "meditation", "cycling",
];
const SUGGESTED_CLUBS = [
  "Ladera Oaks Swim & Tennis Club",
  "Sharon Heights Golf & Country Club",
  "Menlo Circus Club",
  "Alpine Hills Tennis & Swimming Club",
  "Menlo Country Club",
];
const SUGGESTED_SPORTS = [
  "49ers", "Warriors", "Giants", "Stanford football", "ATP tennis",
  "Premier League", "F1", "NBA", "NFL", "cricket",
];

export default function OnboardForm({
  initialName = "",
  initialEmail = "",
  calendarLinked = false,
}: {
  initialName?: string;
  initialEmail?: string;
  calendarLinked?: boolean;
}) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [email, setEmail] = useState(initialEmail);
  const [phone, setPhone] = useState("");
  const [channel, setChannel] = useState("imessage");
  const [address, setAddress] = useState("");
  const [radius, setRadius] = useState(10);
  const [interests, setInterests] = useState<string[]>([]);
  const [teams, setTeams] = useState<string[]>([]);
  const [clubs, setClubs] = useState<string[]>([]);
  const [customClubs, setCustomClubs] = useState("");
  const [custom, setCustom] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const toggle = (
    _list: string[],
    set: React.Dispatch<React.SetStateAction<string[]>>,
    v: string
  ) =>
    set((prev) => (prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v]));

  async function submit(linkGoogle: boolean) {
    setError("");
    if (!phone || !address) {
      setError("Your mobile number and address are all Jarvis needs.");
      return;
    }
    setBusy(true);
    const res = await fetch("/api/onboard", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name, email, phone, channel, address,
        radiusMiles: radius,
        interests: [
          ...interests,
          ...custom.split(",").map((s) => s.trim()).filter(Boolean),
        ],
        sportsTeams: teams,
        memberClubs: [
          ...clubs,
          ...customClubs.split(",").map((s) => s.trim()).filter(Boolean),
        ],
      }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) { setError(data.error ?? "Something went wrong."); return; }
    if (linkGoogle && data.googleConfigured) {
      window.location.href = "/api/auth/google";
    } else {
      router.push("/onboarding/tastes");
    }
  }

  return (
    <div className="card" style={{ padding: 24 }}>
      {!calendarLinked && (
        <>
          <label>Your name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" />
          <label>Gmail address</label>
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@gmail.com" />
        </>
      )}

      <label>Mobile number — Jarvis texts you your picks</label>
      <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+1 650 555 0100" />

      <label>Home address — events are found near here</label>
      <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="street, city, state" />

      <details style={{ marginTop: 20 }}>
        <summary style={{ cursor: "pointer", color: "var(--muted)", fontSize: 14 }}>
          Fine-tune (optional) — the taste game on the next screen covers this for most people
        </summary>

        <label>Search radius: {radius} miles</label>
        <input type="range" min={2} max={30} value={radius} onChange={(e) => setRadius(+e.target.value)} />

        <label>Interests</label>
        <div className="chips">
          {SUGGESTED_INTERESTS.map((i) => (
            <span key={i} className={`chip ${interests.includes(i) ? "on" : ""}`} onClick={() => toggle(interests, setInterests, i)}>
              {i}
            </span>
          ))}
        </div>
        <input style={{ marginTop: 8 }} value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="anything else, comma-separated" />

        <label>Sports & teams you watch on TV</label>
        <div className="chips">
          {SUGGESTED_SPORTS.map((t) => (
            <span key={t} className={`chip ${teams.includes(t) ? "on" : ""}`} onClick={() => toggle(teams, setTeams, t)}>
              {t}
            </span>
          ))}
        </div>

        <label>Private clubs you belong to (Jarvis reads their event calendars)</label>
        <div className="chips">
          {SUGGESTED_CLUBS.map((c) => (
            <span key={c} className={`chip ${clubs.includes(c) ? "on" : ""}`} onClick={() => toggle(clubs, setClubs, c)}>
              {c}
            </span>
          ))}
        </div>
        <input style={{ marginTop: 8 }} value={customClubs} onChange={(e) => setCustomClubs(e.target.value)} placeholder="other clubs, comma-separated" />

        <label>Text channel</label>
        <div className="chips">
          {[
            ["imessage", "iMessage (POC, from this Mac)"],
            ["sms", "SMS via Twilio (pilot)"],
            ["web", "No texts — web only"],
          ].map(([v, label]) => (
            <span key={v} className={`chip ${channel === v ? "on" : ""}`} onClick={() => setChannel(v)}>
              {label}
            </span>
          ))}
        </div>
      </details>

      {error && <p style={{ color: "var(--bad)", marginTop: 16 }}>{error}</p>}

      <div className="row" style={{ marginTop: 24 }}>
        {calendarLinked ? (
          <button className="btn-primary" disabled={busy} onClick={() => submit(false)}>
            {busy ? "Saving…" : "Continue →"}
          </button>
        ) : (
          <>
            <button className="btn-primary" disabled={busy} onClick={() => submit(true)}>
              {busy ? "Saving…" : "Save & connect Google Calendar"}
            </button>
            <button className="btn-ghost" disabled={busy} onClick={() => submit(false)}>
              Skip calendar for now
            </button>
          </>
        )}
      </div>
    </div>
  );
}
