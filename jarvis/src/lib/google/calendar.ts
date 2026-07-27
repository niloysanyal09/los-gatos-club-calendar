import { google } from "googleapis";
import { authedClient } from "./oauth";

/** Busy windows on the user's primary calendar between two instants. */
export async function busyWindows(
  userId: string,
  timeMin: Date,
  timeMax: Date
): Promise<{ start: Date; end: Date }[] | null> {
  const auth = await authedClient(userId);
  if (!auth) return null; // calendar not linked
  const cal = google.calendar({ version: "v3", auth });
  const res = await cal.freebusy.query({
    requestBody: {
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
      items: [{ id: "primary" }],
    },
  });
  const busy = res.data.calendars?.primary?.busy ?? [];
  return busy
    .filter((b) => b.start && b.end)
    .map((b) => ({ start: new Date(b.start!), end: new Date(b.end!) }));
}

export function overlaps(
  aStart: Date,
  aEnd: Date,
  windows: { start: Date; end: Date }[]
): boolean {
  return windows.some((w) => aStart < w.end && aEnd > w.start);
}

export interface ConflictingEvent {
  id: string;
  title: string;
  start: Date;
  end: Date;
}

/**
 * Events on the primary calendar that overlap a proposed booking.
 *
 * Deliberately not freebusy: that returns anonymous busy blocks, and both the
 * question we ask the user ("this clashes with Board dinner") and the REPLACE
 * branch (delete by id) need the actual events.
 *
 * Returns null when the calendar is not linked, which is different from an
 * empty array — no calendar means we cannot know, so we do not block booking.
 */
export async function findConflicts(
  userId: string,
  start: Date,
  end: Date
): Promise<ConflictingEvent[] | null> {
  const auth = await authedClient(userId);
  if (!auth) return null;
  const cal = google.calendar({ version: "v3", auth });
  const res = await cal.events.list({
    calendarId: "primary",
    timeMin: start.toISOString(),
    timeMax: end.toISOString(),
    singleEvents: true, // expand recurring series into instances
    orderBy: "startTime",
    maxResults: 25,
  });

  const out: ConflictingEvent[] = [];
  for (const e of res.data.items ?? []) {
    if (!e.id || e.status === "cancelled") continue;
    // "Free" events and ones the user already declined are not real clashes,
    // and an all-day entry (date, not dateTime) should not block a 7pm concert.
    if (e.transparency === "transparent") continue;
    if (e.attendees?.some((a) => a.self && a.responseStatus === "declined")) continue;
    if (!e.start?.dateTime || !e.end?.dateTime) continue;
    out.push({
      id: e.id,
      title: e.summary ?? "(untitled event)",
      start: new Date(e.start.dateTime),
      end: new Date(e.end.dateTime),
    });
  }
  return out;
}

/** Remove an event from the primary calendar. Already-gone counts as success. */
export async function deleteCalendarEvent(userId: string, eventId: string): Promise<boolean> {
  const auth = await authedClient(userId);
  if (!auth) return false;
  const cal = google.calendar({ version: "v3", auth });
  try {
    await cal.events.delete({ calendarId: "primary", eventId });
    return true;
  } catch (err: unknown) {
    const code = (err as { code?: number }).code;
    if (code === 404 || code === 410) return true;
    throw err;
  }
}

/**
 * Detect Jarvis-booked events the user has since deleted from their calendar.
 * Returns the ids of Google events that no longer exist / were cancelled —
 * a strong negative preference signal for the daily learning pass.
 */
export async function findDeletedBookings(
  userId: string,
  googleEventIds: string[]
): Promise<string[]> {
  const auth = await authedClient(userId);
  if (!auth) return [];
  const cal = google.calendar({ version: "v3", auth });
  const deleted: string[] = [];
  for (const id of googleEventIds) {
    try {
      const res = await cal.events.get({ calendarId: "primary", eventId: id });
      if (res.data.status === "cancelled") deleted.push(id);
    } catch (err: unknown) {
      const code = (err as { code?: number }).code;
      if (code === 404 || code === 410) deleted.push(id);
    }
  }
  return deleted;
}

/** Create the event on the user's primary Google Calendar. Returns the Google event id. */
export async function createCalendarEvent(
  userId: string,
  e: {
    title: string;
    description?: string | null;
    venueName?: string | null;
    venueAddress?: string | null;
    startTime: Date;
    endTime?: Date | null;
    url?: string | null;
  }
): Promise<string | null> {
  const auth = await authedClient(userId);
  if (!auth) return null;
  const cal = google.calendar({ version: "v3", auth });
  const end = e.endTime ?? new Date(e.startTime.getTime() + 2 * 3600_000);
  const description = [e.description, e.url ? `Details / tickets: ${e.url}` : null, "Booked by Jarvis in your pocket"]
    .filter(Boolean)
    .join("\n\n");
  const res = await cal.events.insert({
    calendarId: "primary",
    requestBody: {
      summary: e.title,
      description,
      location: [e.venueName, e.venueAddress].filter(Boolean).join(", ") || undefined,
      start: { dateTime: e.startTime.toISOString() },
      end: { dateTime: end.toISOString() },
    },
  });
  return res.data.id ?? null;
}
