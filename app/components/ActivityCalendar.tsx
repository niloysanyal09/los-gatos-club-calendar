"use client";

import { useMemo, useState } from "react";
import type { Activity, GeneratedData, QcReport, Venue } from "../data/types";

type Props = {
  data: GeneratedData;
  qcReport: QcReport;
};

const statusLabels: Record<string, string> = {
  pulled: "Pulled",
  partial: "Partial",
  blocked: "Blocked",
  "no-public-feed": "No open feed",
};

const sourceLabels: Record<string, string> = {
  "structured-api": "API",
  "public-calendar": "Calendar",
  "pdf-table": "PDF",
  "image-schedule": "Image",
  "source-page": "Page",
  "member-gated": "Gated",
};

function formatDay(date: string) {
  const value = new Date(`${date}T12:00:00`);
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(value);
}

function formatTime(value?: string) {
  if (!value) return "";
  const [hour, minute] = value.split(":").map(Number);
  const suffix = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${String(minute).padStart(2, "0")} ${suffix}`;
}

function dateRange(from: string, to: string) {
  const dates: string[] = [];
  const cursor = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  while (cursor <= end) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

function countBy<T extends string>(values: T[]) {
  return values.reduce<Record<T, number>>((acc, value) => {
    acc[value] = (acc[value] || 0) + 1;
    return acc;
  }, {} as Record<T, number>);
}

function mapPosition(venue: Venue, venues: Venue[], anchor: GeneratedData["anchor"]) {
  const longitudes = [...venues.map((item) => item.longitude), anchor.longitude];
  const latitudes = [...venues.map((item) => item.latitude), anchor.latitude];
  const minLng = Math.min(...longitudes);
  const maxLng = Math.max(...longitudes);
  const minLat = Math.min(...latitudes);
  const maxLat = Math.max(...latitudes);
  const x = ((venue.longitude - minLng) / Math.max(0.001, maxLng - minLng)) * 82 + 9;
  const y = (1 - (venue.latitude - minLat) / Math.max(0.001, maxLat - minLat)) * 78 + 11;
  return { left: `${x}%`, top: `${y}%` };
}

function anchorPosition(venues: Venue[], anchor: GeneratedData["anchor"]) {
  const longitudes = [...venues.map((item) => item.longitude), anchor.longitude];
  const latitudes = [...venues.map((item) => item.latitude), anchor.latitude];
  const minLng = Math.min(...longitudes);
  const maxLng = Math.max(...longitudes);
  const minLat = Math.min(...latitudes);
  const maxLat = Math.max(...latitudes);
  const x = ((anchor.longitude - minLng) / Math.max(0.001, maxLng - minLng)) * 82 + 9;
  const y = (1 - (anchor.latitude - minLat) / Math.max(0.001, maxLat - minLat)) * 78 + 11;
  return { left: `${x}%`, top: `${y}%` };
}

function ActivityRow({ activity }: { activity: Activity }) {
  return (
    <article className={`activity activity-${activity.confidence}`}>
      <div className="activity-topline">
        <span>{formatTime(activity.startTime)}</span>
        {activity.endTime ? <span>{formatTime(activity.endTime)}</span> : null}
      </div>
      <h3>{activity.title}</h3>
      <p>{activity.venueName}</p>
      <div className="activity-meta">
        <span>{activity.category}</span>
        {activity.location ? <span>{activity.location}</span> : null}
      </div>
      {activity.instructor ? <div className="activity-instructor">{activity.instructor}</div> : null}
      <div className="activity-links">
        <a href={activity.sourceUrl} target="_blank" rel="noreferrer">
          Source
        </a>
        <a href={activity.clubUrl} target="_blank" rel="noreferrer">
          Club
        </a>
      </div>
    </article>
  );
}

export function ActivityCalendar({ data, qcReport }: Props) {
  const days = useMemo(() => dateRange(data.dateFrom, data.dateTo), [data.dateFrom, data.dateTo]);
  const [activeDay, setActiveDay] = useState(days[0]);
  const [view, setView] = useState<"calendar" | "spotlight" | "sources" | "qc">("calendar");
  const [category, setCategory] = useState("All");
  const [venue, setVenue] = useState("All");
  const [query, setQuery] = useState("");

  const activityCategoryCounts = useMemo(() => countBy(data.activities.map((activity) => activity.category)), [data.activities]);
  const categories = useMemo(
    () => ["All", ...Object.entries(activityCategoryCounts).sort((a, b) => b[1] - a[1]).map(([name]) => name)],
    [activityCategoryCounts]
  );

  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return data.activities.filter((activity) => {
      if (category !== "All" && activity.category !== category) return false;
      if (venue !== "All" && activity.venueId !== venue) return false;
      if (!normalizedQuery) return true;
      return `${activity.title} ${activity.venueName} ${activity.category} ${activity.location || ""} ${activity.instructor || ""}`
        .toLowerCase()
        .includes(normalizedQuery);
    });
  }, [category, data.activities, query, venue]);

  const dayActivities = filtered.filter((activity) => activity.date === activeDay);
  const spotlight = [...filtered].sort((a, b) => b.interestingScore - a.interestingScore || a.startTime.localeCompare(b.startTime)).slice(0, 18);
  const venuesWithActivities = data.venues.filter((item) => item.activityCount > 0).length;
  const topCategories = Object.entries(activityCategoryCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);
  const activeVenue = venue === "All" ? null : data.venues.find((item) => item.id === venue);

  return (
    <main className="app-shell">
      <section className="hero-band">
        <div className="hero-copy">
          <p className="eyebrow">Los Gatos Club Activity Pull</p>
          <h1>Private-club activity calendar near Blossom Hill Road</h1>
          <p className="hero-subcopy">
            Consolidated pull for {formatDay(data.dateFrom)} through {formatDay(data.dateTo)} within an approximate 10-mile radius of {data.anchor.address}.
          </p>
        </div>
        <div className="metric-grid" aria-label="Data pull summary">
          <div>
            <strong>{data.activities.length}</strong>
            <span>activities pulled</span>
          </div>
          <div>
            <strong>{data.venues.length}</strong>
            <span>clubs scanned</span>
          </div>
          <div>
            <strong>{venuesWithActivities}</strong>
            <span>clubs with rows</span>
          </div>
          <div>
            <strong>{qcReport.failCount}</strong>
            <span>QC failures</span>
          </div>
        </div>
      </section>

      <section className="control-band">
        <div className="search-box">
          <label htmlFor="search">Search activities</label>
          <input
            id="search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Yoga, pickleball, swim, family night"
          />
        </div>
        <div className="segmented" aria-label="View selector">
          {(["calendar", "spotlight", "sources", "qc"] as const).map((option) => (
            <button key={option} className={view === option ? "active" : ""} onClick={() => setView(option)}>
              {option === "qc" ? "QC" : option[0].toUpperCase() + option.slice(1)}
            </button>
          ))}
        </div>
        <div className="select-pair">
          <label>
            Category
            <select value={category} onChange={(event) => setCategory(event.target.value)}>
              {categories.map((item) => (
                <option key={item} value={item}>
                  {item === "All" ? "All categories" : `${item} (${activityCategoryCounts[item] || 0})`}
                </option>
              ))}
            </select>
          </label>
          <label>
            Club
            <select value={venue} onChange={(event) => setVenue(event.target.value)}>
              <option value="All">All clubs</option>
              {data.venues.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} ({item.activityCount})
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      <section className="overview-grid">
        <div className="radius-map" aria-label="Approximate venue map">
          <div className="map-surface">
            <div className="radius-ring radius-ring-wide" />
            <div className="radius-ring radius-ring-tight" />
            <div className="anchor-dot" style={anchorPosition(data.venues, data.anchor)}>
              <span>Anchor</span>
            </div>
            {data.venues.map((item) => (
              <a
                key={item.id}
                className={`venue-dot venue-dot-${item.pullStatus}`}
                style={mapPosition(item, data.venues, data.anchor)}
                href={item.sourceUrl}
                target="_blank"
                rel="noreferrer"
                title={`${item.name}: ${item.distanceMiles} mi, ${item.activityCount} activities`}
              >
                <span>{item.name}</span>
              </a>
            ))}
          </div>
          <div className="map-caption">
            <strong>{activeVenue ? activeVenue.name : "Radius coverage"}</strong>
            <span>{activeVenue ? `${activeVenue.distanceMiles} mi from anchor` : "Dots show detected nearby clubs. Distances are approximate."}</span>
          </div>
        </div>

        <div className="category-stack">
          <h2>Interest Density</h2>
          {topCategories.map(([name, count]) => (
            <button key={name} className={category === name ? "category-row active" : "category-row"} onClick={() => setCategory(name)}>
              <span>{name}</span>
              <strong>{count}</strong>
            </button>
          ))}
        </div>
      </section>

      {view === "calendar" ? (
        <section className="calendar-panel">
          <div className="day-strip">
            {days.map((day) => {
              const count = filtered.filter((activity) => activity.date === day).length;
              return (
                <button key={day} className={activeDay === day ? "active" : ""} onClick={() => setActiveDay(day)}>
                  <span>{formatDay(day)}</span>
                  <strong>{count}</strong>
                </button>
              );
            })}
          </div>
          <div className="calendar-body">
            <div className="calendar-heading">
              <div>
                <p className="eyebrow">Calendar View</p>
                <h2>{formatDay(activeDay)}</h2>
              </div>
              <span>{dayActivities.length} matching activities</span>
            </div>
            <div className="activity-list">
              {dayActivities.length ? dayActivities.map((activity) => <ActivityRow key={activity.id} activity={activity} />) : <p className="empty-state">No activities match these filters for this day.</p>}
            </div>
          </div>
        </section>
      ) : null}

      {view === "spotlight" ? (
        <section className="spotlight-panel">
          <div className="section-heading">
            <p className="eyebrow">Interesting Activities</p>
            <h2>High-signal options from the current pull</h2>
          </div>
          <div className="spotlight-grid">
            {spotlight.map((activity) => (
              <ActivityRow key={activity.id} activity={activity} />
            ))}
          </div>
        </section>
      ) : null}

      {view === "sources" ? (
        <section className="source-panel">
          <div className="section-heading">
            <p className="eyebrow">Source Coverage</p>
            <h2>What pulled cleanly, and what needs another adapter</h2>
          </div>
          <div className="source-grid">
            {data.venues.map((item) => (
              <article key={item.id} className={`source-card source-card-${item.pullStatus}`}>
                <div>
                  <span className="source-kind">{sourceLabels[item.sourceKind]}</span>
                  <span className="source-status">{statusLabels[item.pullStatus]}</span>
                </div>
                <h3>{item.name}</h3>
                <p>{item.note}</p>
                <dl>
                  <div>
                    <dt>Distance</dt>
                    <dd>{item.distanceMiles} mi</dd>
                  </div>
                  <div>
                    <dt>Rows</dt>
                    <dd>{item.activityCount}</dd>
                  </div>
                </dl>
                <a href={item.sourceUrl} target="_blank" rel="noreferrer">
                  Open source page
                </a>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {view === "qc" ? (
        <section className="qc-panel">
          <div className="section-heading">
            <p className="eyebrow">QC Agent</p>
            <h2>Independent sample checks</h2>
            <span>
              {qcReport.passCount} pass, {qcReport.warnCount} warn, {qcReport.failCount} fail
            </span>
          </div>
          <div className="qc-grid">
            {qcReport.checks.map((check) => (
              <article key={check.id} className={`qc-check qc-${check.status}`}>
                <span>{check.status}</span>
                <h3>{check.title}</h3>
                {check.venueName ? <p>{check.venueName}</p> : null}
                <div>{check.detail}</div>
                {check.sourceUrl ? (
                  <a href={check.sourceUrl} target="_blank" rel="noreferrer">
                    Source
                  </a>
                ) : null}
              </article>
            ))}
          </div>
        </section>
      ) : null}
    </main>
  );
}
