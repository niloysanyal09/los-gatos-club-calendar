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
