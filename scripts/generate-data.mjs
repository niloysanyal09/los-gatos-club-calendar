import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const PYTHON = process.env.PYTHON_BIN || "/Users/niloysanyal/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3";
const DATE_FROM = "2026-07-24";
const DATE_TO = "2026-07-31";
const BAY_API = "https://bayclubs-classes-czdrbdfgdef2h5ef.westus-01.azurewebsites.net/api";

const anchor = {
  label: "Blossom Hill Road, Los Gatos",
  address: "798-1 Blossom Hill Rd Los Gatos, CA 95032",
  latitude: 37.2359,
  longitude: -121.9621,
  radiusMiles: 10,
};

const venues = [
  {
    id: "bay-courtside",
    name: "Bay Club Courtside",
    address: "14675 S Winchester Boulevard, Los Gatos, CA 95032",
    latitude: 37.256016,
    longitude: -121.966391,
    website: "https://www.bayclubs.com/clubs/courtside",
    sourceKind: "structured-api",
    pullStatus: "pulled",
    sourceUrl: "https://www.bayclubs.com/clubs/courtside",
    note: "Bay Club's page hydrates its class calendar from a public JSON endpoint.",
    baySlug: "courtside",
  },
  {
    id: "bay-santa-clara",
    name: "Bay Club Santa Clara",
    address: "3250 Central Expressway, Santa Clara, CA 95051",
    latitude: 37.376751,
    longitude: -121.986283,
    website: "https://www.bayclubs.com/clubs/santaclara",
    sourceKind: "structured-api",
    pullStatus: "pulled",
    sourceUrl: "https://www.bayclubs.com/clubs/santaclara",
    note: "Included because its mapped coordinates land inside the 10-mile approximation.",
    baySlug: "santaclara",
  },
  {
    id: "bay-boulder-ridge",
    name: "Boulder Ridge Golf Club",
    address: "1000 Old Quarry Rd, San Jose, CA 95123",
    latitude: 37.233713,
    longitude: -121.860531,
    website: "https://www.bayclubs.com/clubs/boulderridge",
    sourceKind: "structured-api",
    pullStatus: "pulled",
    sourceUrl: "https://www.bayclubs.com/clubs/boulderridge",
    note: "Bay Club class API returned no classes for the sampled week.",
    baySlug: "boulderridge",
  },
  {
    id: "lgsrc",
    name: "Los Gatos Swim and Racquet Club",
    address: "14700 Oka Road, Los Gatos, CA 95032",
    latitude: 37.2455,
    longitude: -121.9555,
    website: "https://lgsrc.com/",
    sourceKind: "pdf-table",
    pullStatus: "pulled",
    sourceUrl: "https://lgsrc.com/group-ex-schedule-july/",
    note: "Current July 2026 group exercise schedule is published as a public PDF table.",
    pdfUrl: "https://lgsrc.com/wp-content/uploads/2026/06/July-GX-Schedule-2026-Website-1.pdf",
  },
  {
    id: "sjsrc",
    name: "San Jose Swim and Racquet Club",
    address: "1170 Pedro Street, San Jose, CA 95126",
    latitude: 37.3109,
    longitude: -121.9152,
    website: "https://www.sjsrc.com/",
    sourceKind: "public-calendar",
    pullStatus: "pulled",
    sourceUrl: "https://www.sjsrc.com/calendars/fitness-calendar/",
    note: "Fitness and tennis pages expose public Google Calendar IDs; recurring events are expanded locally.",
    googleCalendars: [
      { id: "sjsrc.com_f8gib0gr3us740u1489rn8no7o@group.calendar.google.com", label: "Fitness" },
      { id: "evqhb0bgfpg0crk8mrs629p5vo@group.calendar.google.com", label: "Junior Tennis" },
      { id: "bgdjbrfjbhpruddc39skg5sfs8@group.calendar.google.com", label: "Adult Tennis and Pickleball" },
    ],
  },
  {
    id: "apjcc",
    name: "Addison-Penzak JCC Los Gatos",
    address: "14855 Oka Road, Los Gatos, CA 95032",
    latitude: 37.2464,
    longitude: -121.9539,
    website: "https://apjcc.org/",
    sourceKind: "public-calendar",
    pullStatus: "partial",
    sourceUrl: "https://apjcc.org/fitness1/schedules/",
    note: "Aquatics has a public calendar. Group fitness is visible as an image schedule and is flagged for OCR/manual QC.",
    googleCalendars: [
      { id: "a6gbjej93g4smtj89pdj1mufcc@group.calendar.google.com", label: "Aquatics" },
    ],
    imageScheduleUrl: "https://apjcc.org/wp-content/uploads/2026/07/GroupFitness_11x17-9.png",
  },
  {
    id: "the-club-lg",
    name: "The Club at Los Gatos",
    address: "285 E Main Street, Los Gatos, CA 95030",
    latitude: 37.2225,
    longitude: -121.9794,
    website: "https://www.theclublg.com/",
    sourceKind: "source-page",
    pullStatus: "partial",
    sourceUrl: "https://www.theclublg.com/class-schedule",
    note: "Public class page exists, but the first-pass HTML did not expose reliable dated rows.",
  },
  {
    id: "la-rinconada",
    name: "La Rinconada Country Club",
    address: "14595 Clearview Drive, Los Gatos, CA 95032",
    latitude: 37.2259,
    longitude: -121.9827,
    website: "https://larinconadacc.com/",
    sourceKind: "member-gated",
    pullStatus: "no-public-feed",
    sourceUrl: "https://larinconadacc.com/",
    note: "Public site describes amenities, but member activity calendars are not exposed in first-pass HTML.",
  },
  {
    id: "saratoga-cc",
    name: "Saratoga Country Club",
    address: "21990 Prospect Road, Saratoga, CA 95070",
    latitude: 37.2911,
    longitude: -122.0616,
    website: "https://www.saratogacc.com/",
    sourceKind: "member-gated",
    pullStatus: "no-public-feed",
    sourceUrl: "https://www.saratogacc.com/",
    note: "Public site mentions active club programming; detailed calendar appears member-gated.",
  },
  {
    id: "almaden-valley-athletic",
    name: "Almaden Valley Athletic Club",
    address: "5400 Camden Ave, San Jose, CA 95124",
    latitude: 37.2426,
    longitude: -121.9032,
    website: "https://www.avac.us/Club/Scripts/Home/home.asp",
    sourceKind: "source-page",
    pullStatus: "partial",
    sourceUrl: "https://www.avac.us/club/scripts/section/section.asp?NS=GF",
    note: "Public nav exposes group class sections, but current dated schedule needs a dedicated MembersFirst adapter.",
  },
  {
    id: "almaden-swim-racquet",
    name: "Almaden Swim and Racquet Club",
    address: "6604 Northridge Dr, San Jose, CA 95120",
    latitude: 37.2172,
    longitude: -121.8595,
    website: "https://www.asrc.org/",
    sourceKind: "source-page",
    pullStatus: "partial",
    sourceUrl: "https://www.asrc.org/",
    note: "Calendar shell is public, but first-pass HTML points to a third-party club platform requiring a separate adapter.",
  },
  {
    id: "almaden-gcc",
    name: "Almaden Golf and Country Club",
    address: "6663 Hampton Drive, San Jose, CA 95120",
    latitude: 37.2142,
    longitude: -121.8649,
    website: "https://www.almadengcc.org/",
    sourceKind: "member-gated",
    pullStatus: "no-public-feed",
    sourceUrl: "https://www.almadengcc.org/",
    note: "Public site exposes club information but no open activity calendar in first-pass HTML.",
  },
];

function distanceMiles(a, b) {
  const toRad = (value) => (value * Math.PI) / 180;
  const radius = 3958.8;
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * radius * Math.asin(Math.sqrt(h));
}

function normalizeTitle(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .replace(/: BOOKING REQUIRED/i, "")
    .trim();
}

function inferCategory(title, fallback = "Activity") {
  const low = title.toLowerCase();
  if (/pickle|tennis|racquet|squash|court/.test(low)) return "Racquet Sports";
  if (/swim|water|aqua|pool|lane/.test(low)) return "Aquatics";
  if (/yoga|yin|restorative|flow/.test(low)) return "Yoga";
  if (/pilates|barre/.test(low)) return "Pilates";
  if (/cycle|cycling|ride/.test(low)) return "Cycling";
  if (/zumba|dance|hip hop|beats/.test(low)) return "Dance";
  if (/strength|sculpt|combat|conditioning|boot|bodypump|functional|tough/.test(low)) return "Strength";
  if (/book|social|family|party|fair|night/.test(low)) return "Social";
  return fallback || "Activity";
}

function scoreActivity(activity) {
  const haystack = `${activity.title} ${activity.category} ${activity.description || ""}`.toLowerCase();
  let score = 1;
  for (const token of ["pickleball", "tennis", "yoga", "pilates", "swim", "aqua", "cycle", "strength", "zumba", "family", "social"]) {
    if (haystack.includes(token)) score += 2;
  }
  if (activity.sourceKind === "structured-api") score += 1;
  if (activity.confidence === "high") score += 1;
  return score;
}

function localDateParts(value) {
  const match = value.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2}))?/);
  if (!match) return null;
  return {
    date: `${match[1]}-${match[2]}-${match[3]}`,
    time: match[4] ? `${match[4]}:${match[5]}` : "00:00",
  };
}

function addDays(date, days) {
  const copy = new Date(date.getTime());
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy;
}

function dateString(date) {
  return date.toISOString().slice(0, 10);
}

function compareDate(a, b) {
  return a.localeCompare(b);
}

function unfoldIcs(text) {
  return text.replace(/\r?\n[ \t]/g, "");
}

function unescapeIcs(value) {
  return String(value || "")
    .replace(/\\n/g, " ")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\")
    .replace(/\s+/g, " ")
    .trim();
}

function readIcsProp(block, name) {
  const line = block.split(/\r?\n/).find((candidate) => candidate.startsWith(`${name}:`) || candidate.startsWith(`${name};`));
  if (!line) return "";
  return line.slice(line.indexOf(":") + 1);
}

function parseDuration(startRaw, endRaw) {
  const start = localDateParts(startRaw);
  const end = localDateParts(endRaw);
  if (!start || !end) return 60;
  const [sh, sm] = start.time.split(":").map(Number);
  const [eh, em] = end.time.split(":").map(Number);
  const minutes = eh * 60 + em - (sh * 60 + sm);
  return minutes > 0 ? minutes : 60;
}

function addMinutes(time, minutes) {
  const [hour, minute] = time.split(":").map(Number);
  const total = hour * 60 + minute + minutes;
  return `${String(Math.floor(total / 60) % 24).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

function byDayToNumber(value) {
  return { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 }[value];
}

function expandIcsEvent(block, dateFrom, dateTo) {
  const startRaw = readIcsProp(block, "DTSTART");
  const endRaw = readIcsProp(block, "DTEND");
  const start = localDateParts(startRaw);
  if (!start) return [];

  const summary = unescapeIcs(readIcsProp(block, "SUMMARY"));
  const description = unescapeIcs(readIcsProp(block, "DESCRIPTION"));
  const location = unescapeIcs(readIcsProp(block, "LOCATION"));
  const uid = unescapeIcs(readIcsProp(block, "UID")) || `${summary}-${startRaw}`;
  const rrule = readIcsProp(block, "RRULE");
  const duration = parseDuration(startRaw, endRaw);
  const firstDate = new Date(`${start.date}T00:00:00Z`);
  const toDate = new Date(`${dateTo}T00:00:00Z`);
  const occurrences = [];

  if (!rrule) {
    if (compareDate(start.date, dateFrom) >= 0 && compareDate(start.date, dateTo) <= 0) {
      occurrences.push({ uid, title: summary, date: start.date, startTime: start.time, endTime: addMinutes(start.time, duration), location, description });
    }
    return occurrences;
  }

  const ruleParts = Object.fromEntries(rrule.split(";").map((part) => {
    const [key, value] = part.split("=");
    return [key, value];
  }));
  const until = ruleParts.UNTIL ? localDateParts(ruleParts.UNTIL)?.date : null;
  const untilDate = until ? new Date(`${until}T00:00:00Z`) : toDate;
  const count = ruleParts.COUNT ? Number(ruleParts.COUNT) : null;
  const frequency = ruleParts.FREQ;
  const byDays = (ruleParts.BYDAY || "").split(",").filter(Boolean);

  if (frequency === "DAILY") {
    let emitted = 0;
    for (let day = firstDate; day <= toDate && day <= untilDate; day = addDays(day, 1)) {
      emitted += 1;
      if (count && emitted > count) break;
      const ds = dateString(day);
      if (compareDate(ds, dateFrom) >= 0 && compareDate(ds, dateTo) <= 0) {
        occurrences.push({ uid, title: summary, date: ds, startTime: start.time, endTime: addMinutes(start.time, duration), location, description });
      }
    }
    return occurrences;
  }

  if (frequency === "WEEKLY") {
    const targetDays = byDays.length ? byDays.map(byDayToNumber).filter((value) => value !== undefined) : [firstDate.getUTCDay()];
    let emitted = 0;
    for (let day = firstDate; day <= toDate && day <= untilDate; day = addDays(day, 1)) {
      if (!targetDays.includes(day.getUTCDay())) continue;
      if (day < firstDate) continue;
      emitted += 1;
      if (count && emitted > count) break;
      const ds = dateString(day);
      if (compareDate(ds, dateFrom) >= 0 && compareDate(ds, dateTo) <= 0) {
        occurrences.push({ uid, title: summary, date: ds, startTime: start.time, endTime: addMinutes(start.time, duration), location, description });
      }
    }
  }

  return occurrences;
}

function linkForGoogleCalendar(calendarId) {
  return `https://calendar.google.com/calendar/u/0/embed?src=${encodeURIComponent(calendarId)}&ctz=America/Los_Angeles`;
}

async function pullBayClub(venue) {
  const url = `${BAY_API}/getClasses?club=${venue.baySlug}&dateFrom=${DATE_FROM}&dateTo=${DATE_TO}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Bay Club ${venue.baySlug} returned ${response.status}`);
  const payload = await response.json();
  return (payload.items || []).map((item) => {
    const title = normalizeTitle(item.title);
    const activity = {
      id: `bay-${venue.baySlug}-${item.classDate}-${item.id}`,
      title,
      venueId: venue.id,
      venueName: venue.name,
      date: item.classDate,
      startTime: item.startTime,
      endTime: item.endTime,
      category: inferCategory(title, item.category),
      instructor: normalizeTitle(item.instructor),
      location: normalizeTitle(item.location),
      status: item.status,
      sourceUrl: `https://www.bayclubs.com/classes?c2=${venue.baySlug}&d=${item.classDate}`,
      clubUrl: venue.website,
      sourceKind: "structured-api",
      confidence: "high",
      description: `${item.category || "Class"} from Bay Club class API.`,
    };
    return { ...activity, interestingScore: scoreActivity(activity) };
  });
}

async function pullGoogleCalendar(venue) {
  const activities = [];
  for (const calendar of venue.googleCalendars || []) {
    const icsUrl = `https://calendar.google.com/calendar/ical/${encodeURIComponent(calendar.id)}/public/basic.ics`;
    const response = await fetch(icsUrl);
    if (!response.ok) continue;
    const text = unfoldIcs(await response.text());
    const blocks = text.split("BEGIN:VEVENT").slice(1).map((block) => `BEGIN:VEVENT${block.split("END:VEVENT")[0]}END:VEVENT`);
    for (const block of blocks) {
      for (const occurrence of expandIcsEvent(block, DATE_FROM, DATE_TO)) {
        const title = normalizeTitle(occurrence.title);
        if (!title) continue;
        const activity = {
          id: `${venue.id}-${calendar.label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${occurrence.date}-${occurrence.startTime}-${occurrence.uid}`.replace(/[^a-zA-Z0-9:-]+/g, "-").slice(0, 180),
          title,
          venueId: venue.id,
          venueName: venue.name,
          date: occurrence.date,
          startTime: occurrence.startTime,
          endTime: occurrence.endTime,
          category: inferCategory(`${title} ${calendar.label}`, calendar.label),
          instructor: "",
          location: occurrence.location,
          status: "confirmed",
          description: occurrence.description || calendar.label,
          sourceUrl: linkForGoogleCalendar(calendar.id),
          clubUrl: venue.website,
          sourceKind: "public-calendar",
          confidence: "high",
        };
        activities.push({ ...activity, interestingScore: scoreActivity(activity) });
      }
    }
  }
  return activities;
}

function pullLgsrcPdf(venue) {
  const output = execFileSync(PYTHON, [
    resolve(root, "scripts/extract-lgsrc-pdf.py"),
    "--url",
    venue.pdfUrl,
    "--date-from",
    DATE_FROM,
    "--date-to",
    DATE_TO,
  ], { encoding: "utf8", maxBuffer: 1024 * 1024 * 10 });
  return JSON.parse(output).map((item) => {
    const activity = {
      ...item,
      venueId: venue.id,
      venueName: venue.name,
      sourceUrl: venue.pdfUrl,
      clubUrl: venue.website,
      sourceKind: "pdf-table",
      confidence: "medium",
      status: "published",
    };
    return { ...activity, interestingScore: scoreActivity(activity) };
  });
}

async function main() {
  const nearbyVenues = venues
    .map((venue) => ({ ...venue, distanceMiles: Number(distanceMiles(anchor, venue).toFixed(1)) }))
    .filter((venue) => venue.distanceMiles <= anchor.radiusMiles)
    .sort((a, b) => a.distanceMiles - b.distanceMiles || a.name.localeCompare(b.name));

  const activities = [];
  for (const venue of nearbyVenues) {
    try {
      if (venue.baySlug) activities.push(...await pullBayClub(venue));
      if (venue.pdfUrl) activities.push(...pullLgsrcPdf(venue));
      if (venue.googleCalendars) activities.push(...await pullGoogleCalendar(venue));
    } catch (error) {
      venue.pullStatus = venue.pullStatus === "pulled" ? "partial" : venue.pullStatus;
      venue.note = `${venue.note} Pull warning: ${error.message}`;
    }
  }

  const deduped = Array.from(new Map(activities.map((activity) => [activity.id, activity])).values())
    .filter((activity) => compareDate(activity.date, DATE_FROM) >= 0 && compareDate(activity.date, DATE_TO) <= 0)
    .sort((a, b) => `${a.date} ${a.startTime} ${a.venueName}`.localeCompare(`${b.date} ${b.startTime} ${b.venueName}`));

  const venuesWithCounts = nearbyVenues.map((venue) => ({
    id: venue.id,
    name: venue.name,
    address: venue.address,
    distanceMiles: venue.distanceMiles,
    latitude: venue.latitude,
    longitude: venue.longitude,
    website: venue.website,
    sourceKind: venue.sourceKind,
    pullStatus: venue.pullStatus,
    sourceUrl: venue.sourceUrl,
    note: venue.note,
    activityCount: deduped.filter((activity) => activity.venueId === venue.id).length,
  }));

  const sourceNotes = venuesWithCounts.map((venue) => ({
    venueId: venue.id,
    title: venue.name,
    url: venue.sourceUrl,
    status: venue.pullStatus,
    detail: venue.note,
  }));

  const data = {
    generatedAt: new Date().toISOString(),
    dateFrom: DATE_FROM,
    dateTo: DATE_TO,
    anchor,
    venues: venuesWithCounts,
    activities: deduped,
    sourceNotes,
  };

  mkdirSync(resolve(root, "public/data"), { recursive: true });
  mkdirSync(resolve(root, "app/data"), { recursive: true });
  writeFileSync(resolve(root, "public/data/activities.json"), `${JSON.stringify(data, null, 2)}\n`);
  writeFileSync(
    resolve(root, "app/data/generated.ts"),
    `import type { GeneratedData } from "./types";\n\nexport const generatedData = ${JSON.stringify(data, null, 2)} satisfies GeneratedData;\n`
  );
  console.log(`Generated ${deduped.length} activities across ${venuesWithCounts.length} nearby venues.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
