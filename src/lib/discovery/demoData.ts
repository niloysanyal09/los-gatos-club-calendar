import { RawEvent } from "./types";

/**
 * Seed events used when no ANTHROPIC_API_KEY is configured.
 * These are REAL venues, series, and broadcasts near Menlo Park (verified
 * July 24, 2026) with live links to the actual sites for booking/details.
 * They are a static snapshot — once a live key is added, the daily web-agent
 * lanes replace this with fresh discovery, and past-dated items expire
 * automatically.
 */
function pt(y: number, m: number, d: number, hour: number, min = 0, durationHrs = 2) {
  // Pacific Daylight Time offset; fine for a summer-2026 seed snapshot
  const start = new Date(`${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}T${String(hour).padStart(2, "0")}:${String(min).padStart(2, "0")}:00-07:00`);
  const end = new Date(start.getTime() + durationHrs * 3600_000);
  return { startTime: start.toISOString(), endTime: end.toISOString() };
}

export function demoEvents(): RawEvent[] {
  return [
    // — Clubs & sessions (real local venues with public schedules) —
    {
      lane: "clubs",
      category: "yoga",
      title: "Evening Vinyasa Flow — Avalon Yoga",
      description: "Long-running Palo Alto studio; drop-ins welcome, full schedule online.",
      venueName: "Avalon Yoga & Wellness Center",
      venueAddress: "370 California Ave, Palo Alto, CA",
      distanceMiles: 3.6,
      cost: "Drop-in; see schedule",
      url: "https://www.avalonyoga.com",
      source: "demo",
      ...pt(2026, 7, 27, 18, 0, 1),
    },
    {
      lane: "clubs",
      category: "swimming",
      title: "Menlo Masters — coached swim workout, Burgess Pool",
      description: "Menlo Swim & Sport's adult masters program; all levels, coached lanes.",
      venueName: "Burgess Pool, Menlo Park",
      venueAddress: "501 Laurel St, Menlo Park, CA",
      distanceMiles: 1.0,
      cost: "Drop-in available",
      url: "https://www.menloswim.com",
      source: "demo",
      ...pt(2026, 7, 28, 6, 30, 1),
    },
    {
      lane: "clubs",
      category: "tennis",
      title: "Adult tennis programs — City of Menlo Park (Nealon Park)",
      description: "City-run adult clinics and open play on the Nealon Park courts; register online.",
      venueName: "Nealon Park",
      venueAddress: "800 Middle Ave, Menlo Park, CA",
      distanceMiles: 0.9,
      cost: "See registration",
      url: "https://menlopark.gov/Government/Departments/Library-and-Community-Services/Recreation",
      source: "demo",
      ...pt(2026, 7, 29, 18, 0, 1.5),
    },

    // — Private clubs (real clubs; public event pages linked — member
    //    calendars behind login are a pilot feature via ICS feeds) —
    {
      lane: "clubs",
      category: "tennis",
      title: "Margarita Mixer — doubles tournament, Ladera Oaks",
      description:
        "From the club's public events calendar: doubles tennis tournament + social. Summer event; date estimated — confirm with club at the link.",
      venueName: "Ladera Oaks Swim & Tennis Club",
      venueAddress: "3249 Alpine Rd, Portola Valley, CA",
      distanceMiles: 3.9,
      cost: "Members & guests",
      url: "https://www.laderaoaks.com/events",
      source: "demo",
      ...pt(2026, 8, 8, 16, 0, 3),
    },
    {
      lane: "clubs",
      category: "swimming",
      title: "Labor Day Luau — Ladera Oaks end-of-summer party",
      description:
        "From the club's public events calendar: tropical-themed poolside party. Labor Day anchor (Sep 7); confirm with club at the link.",
      venueName: "Ladera Oaks Swim & Tennis Club",
      venueAddress: "3249 Alpine Rd, Portola Valley, CA",
      distanceMiles: 3.9,
      cost: "Members & guests",
      url: "https://www.laderaoaks.com/events",
      source: "demo",
      ...pt(2026, 9, 7, 12, 0, 4),
    },

    // — Movies (real theatre, live showtimes at the link) —
    {
      lane: "movies",
      category: "indie films",
      title: "Evening film at Landmark Aquarius (indie/arthouse)",
      description: "Two-screen Landmark cinema on Emerson St — current films and exact showtimes at the link.",
      venueName: "Landmark Aquarius Theatre",
      venueAddress: "430 Emerson St, Palo Alto, CA",
      distanceMiles: 3.2,
      cost: "~$15; book at link",
      url: "https://www.fandango.com/landmark-aquarius-theatre-aadda/theater-page",
      source: "demo",
      ...pt(2026, 7, 25, 19, 0, 2.5),
    },

    // — Local events (verified series/shows) —
    {
      lane: "events",
      category: "live music",
      title: "Fourth Fridays — free downtown music series (opening night)",
      description: "New monthly series: multiple stages on Santa Cruz Ave, 6–9 pm. The Members on the Plaza Stage.",
      venueName: "Downtown Menlo Park",
      venueAddress: "Santa Cruz Ave, Menlo Park, CA",
      distanceMiles: 0.8,
      cost: "Free",
      url: "https://www.rwcpulse.com/ae/news-events/2026/07/23/go-fourth-downtown-menlo-fund-launches-new-monthly-music-series/",
      source: "demo",
      ...pt(2026, 7, 24, 18, 0, 3),
    },
    {
      lane: "events",
      category: "live music",
      title: "Summer Concert Series at Fremont Park",
      description: "Free Wednesday-evening concert in the park, 6:30–8 pm.",
      venueName: "Fremont Park, Menlo Park",
      venueAddress: "University Dr & Santa Cruz Ave, Menlo Park, CA",
      distanceMiles: 0.7,
      cost: "Free",
      url: "https://paloalto.macaronikid.com/events/5c8fe75bfbf009471f46cbea/summer-concert-series-at-fremont-park-in-menlo-park",
      source: "demo",
      ...pt(2026, 7, 29, 18, 30, 1.5),
    },
    {
      lane: "events",
      category: "live music",
      title: "Music on the Square — Courthouse Square, Redwood City",
      description: "Free Friday-night concert series on the square.",
      venueName: "Courthouse Square",
      venueAddress: "2200 Broadway St, Redwood City, CA",
      distanceMiles: 4.9,
      cost: "Free",
      url: "https://www.redwoodcity.org/departments/parks-recreation-and-community-services/events-1/music-on-the-square",
      source: "demo",
      ...pt(2026, 7, 31, 18, 0, 2.5),
    },
    {
      lane: "events",
      category: "rock concerts",
      title: "Save Ferris live at The Guild Theatre",
      description: "Ska-punk favorites at Menlo Park's own Guild Theatre — tickets at the link.",
      venueName: "The Guild Theatre",
      venueAddress: "949 El Camino Real, Menlo Park, CA",
      distanceMiles: 0.9,
      cost: "Ticketed; see link",
      url: "https://www.guildtheatre.com",
      source: "demo",
      ...pt(2026, 8, 1, 20, 0, 3),
    },

    // — On TV (real broadcasts) —
    {
      lane: "tv-sports",
      category: "cycling",
      title: "Tour de France — Final Stage into Paris (TV)",
      description: "The 2026 Tour concludes on the Champs-Élysées. Live on NBC/Peacock.",
      venueName: "NBC / Peacock",
      cost: "Peacock subscription",
      url: "https://www.nbcsports.com/cycling",
      source: "demo",
      ...pt(2026, 7, 26, 6, 30, 4),
    },
    {
      lane: "tv-sports",
      category: "cricket",
      title: "International cricket on Willow TV (today's fixtures at link)",
      description:
        "Willow carries most international & franchise cricket in the US. Watch via the Willow app, Sling, DirecTV, or Spectrum — live schedule at the link.",
      venueName: "Willow TV",
      cost: "Willow subscription / TV package",
      url: "https://www.willow.tv/schedule",
      source: "demo",
      ...pt(2026, 7, 25, 6, 0, 4),
    },
    {
      lane: "tv-sports",
      category: "baseball",
      title: "SF Giants on NBC Sports Bay Area (evening game)",
      description: "Catch the Giants from home — full TV schedule and matchups at the link.",
      venueName: "NBC Sports Bay Area",
      cost: "Cable / streaming",
      url: "https://www.mlb.com/giants/schedule/tv",
      source: "demo",
      ...pt(2026, 7, 25, 18, 5, 3),
    },
  ];
}
