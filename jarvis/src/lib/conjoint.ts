/**
 * "This or That?" — a lightweight real-life conjoint test run at onboarding.
 * Each option is a realistic event bundle tagged with categories and
 * attributes. Every pick nudges affinity weights, so ranking is personalized
 * from day one, before any booking history exists.
 */

export interface ConjointOption {
  emoji: string;
  title: string;
  detail: string; // when · price · distance
  tags: string[]; // category + attribute tags scored into the profile
}

export interface ConjointRound {
  a: ConjointOption;
  b: ConjointOption;
}

export const CONJOINT_ROUNDS: ConjointRound[] = [
  {
    a: { emoji: "🎷", title: "Friday-night jazz at a small club", detail: "Fri 8pm · $30 · 15 min away", tags: ["jazz", "live music", "attr:evening", "attr:paid", "attr:chill", "attr:social"] },
    b: { emoji: "🏃", title: "Saturday sunrise trail run with a group", detail: "Sat 7am · Free · 10 min away", tags: ["running", "fitness", "attr:morning", "attr:free", "attr:active", "attr:social"] },
  },
  {
    a: { emoji: "🎬", title: "Opening-weekend sci-fi blockbuster, IMAX", detail: "Sat 7pm · $19 · 12 min away", tags: ["sci-fi movies", "movies", "attr:evening", "attr:paid", "attr:chill"] },
    b: { emoji: "🍷", title: "Wine tasting with a local winemaker", detail: "Sat 5pm · $45 · 20 min away", tags: ["wine tasting", "food", "attr:evening", "attr:paid", "attr:social"] },
  },
  {
    a: { emoji: "🎾", title: "Drop-in doubles night at the tennis club", detail: "Wed 6:30pm · $25 · 8 min away", tags: ["tennis", "fitness", "attr:evening", "attr:paid", "attr:active", "attr:social"] },
    b: { emoji: "🧘", title: "Candlelight restorative yoga", detail: "Wed 7pm · $28 · 10 min away", tags: ["yoga", "wellness", "attr:evening", "attr:paid", "attr:chill"] },
  },
  {
    a: { emoji: "🎤", title: "Stand-up comedy showcase downtown", detail: "Thu 8pm · $22 · 15 min away", tags: ["stand-up comedy", "attr:evening", "attr:paid", "attr:social", "attr:chill"] },
    b: { emoji: "📚", title: "Author talk + signing at the bookshop", detail: "Thu 7pm · Free · 5 min away", tags: ["book clubs", "talks", "attr:evening", "attr:free", "attr:chill"] },
  },
  {
    a: { emoji: "🏈", title: "Watch the big game on the couch", detail: "Sun 1pm · Free · your living room", tags: ["tv sports", "attr:home", "attr:free", "attr:chill"] },
    b: { emoji: "🥾", title: "Guided coastal hike + picnic", detail: "Sun 10am · Free · 25 min away", tags: ["hiking", "fitness", "attr:morning", "attr:free", "attr:active", "attr:outdoor"] },
  },
  {
    a: { emoji: "🎻", title: "Symphony night: Beethoven's 7th", detail: "Sat 7:30pm · $60 · 20 min away", tags: ["classical music", "attr:evening", "attr:paid", "attr:chill", "attr:dressy"] },
    b: { emoji: "🎸", title: "Indie rock show at a dive venue", detail: "Sat 9pm · $25 · 18 min away", tags: ["rock concerts", "live music", "attr:evening", "attr:paid", "attr:social"] },
  },
  {
    a: { emoji: "🧑‍🍳", title: "Hands-on pasta-making class", detail: "Sun 4pm · $75 · 12 min away", tags: ["food", "classes", "attr:paid", "attr:active", "attr:social"] },
    b: { emoji: "🖼️", title: "New exhibit opening at the art museum", detail: "Sun 2pm · $15 · 15 min away", tags: ["art exhibits", "attr:paid", "attr:chill"] },
  },
  {
    a: { emoji: "🤝", title: "AI founders meetup + drinks", detail: "Tue 6pm · Free · 10 min away", tags: ["tech meetups", "networking", "attr:evening", "attr:free", "attr:social"] },
    b: { emoji: "🧠", title: "Guided meditation + sound bath", detail: "Tue 7pm · $20 · 8 min away", tags: ["meditation", "wellness", "attr:evening", "attr:paid", "attr:chill"] },
  },
];

/** Convert picks into affinity deltas. winner tags +1.2, loser tags -0.4, skipped rounds ignored. */
export function conjointDeltas(
  picks: { round: number; choice: "a" | "b" | "skip" }[]
): Record<string, number> {
  const deltas: Record<string, number> = {};
  const add = (tag: string, d: number) => {
    deltas[tag] = (deltas[tag] ?? 0) + d;
  };
  for (const p of picks) {
    const round = CONJOINT_ROUNDS[p.round];
    if (!round || p.choice === "skip") continue;
    const winner = p.choice === "a" ? round.a : round.b;
    const loser = p.choice === "a" ? round.b : round.a;
    winner.tags.forEach((t) => add(t, 1.2));
    loser.tags.forEach((t) => add(t, -0.4));
  }
  return deltas;
}
