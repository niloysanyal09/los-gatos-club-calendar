"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CONJOINT_ROUNDS } from "@/lib/conjoint";

type Pick = { round: number; choice: "a" | "b" | "skip" };

export default function TasteGame() {
  const router = useRouter();
  const [round, setRound] = useState(0);
  const [picks, setPicks] = useState<Pick[]>([]);
  const [saving, setSaving] = useState(false);
  const total = CONJOINT_ROUNDS.length;
  const done = round >= total;

  async function choose(choice: "a" | "b" | "skip") {
    const next = [...picks, { round, choice }];
    setPicks(next);
    if (round + 1 < total) {
      setRound(round + 1);
      return;
    }
    setRound(total);
    setSaving(true);
    await fetch("/api/conjoint", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ picks: next }),
    });
    // Kick off the welcome text + first discovery, then hand off to SMS
    await fetch("/api/welcome", { method: "POST" });
    setSaving(false);
    router.push("/onboarding/done");
  }

  if (done) {
    return (
      <div className="card" style={{ textAlign: "center", padding: 40 }}>
        <div style={{ fontSize: 40 }}>🧠</div>
        <p style={{ marginTop: 12 }}>
          {saving ? "Teaching Jarvis your taste…" : "Got it! Building your picks…"}
        </p>
      </div>
    );
  }

  const r = CONJOINT_ROUNDS[round];
  return (
    <div>
      <div className="meta" style={{ marginBottom: 12, color: "var(--muted)" }}>
        Round {round + 1} of {total}
        <span style={{ display: "inline-block", marginLeft: 12, width: 160, height: 6, background: "var(--panel-2)", borderRadius: 3, verticalAlign: "middle" }}>
          <span style={{ display: "block", width: `${(round / total) * 100}%`, height: 6, background: "var(--accent)", borderRadius: 3 }} />
        </span>
      </div>
      <div className="row" style={{ alignItems: "stretch" }}>
        {(["a", "b"] as const).map((side) => {
          const opt = r[side];
          return (
            <div
              key={side}
              className="card"
              style={{ flex: 1, minWidth: 260, cursor: "pointer", textAlign: "center", padding: 28 }}
              onClick={() => choose(side)}
            >
              <div style={{ fontSize: 44 }}>{opt.emoji}</div>
              <div className="title" style={{ margin: "12px 0 6px" }}>{opt.title}</div>
              <div className="meta">{opt.detail}</div>
            </div>
          );
        })}
      </div>
      <div style={{ textAlign: "center", marginTop: 14 }}>
        <button className="btn-ghost" onClick={() => choose("skip")}>
          Honestly, neither 🤷
        </button>
      </div>
    </div>
  );
}
