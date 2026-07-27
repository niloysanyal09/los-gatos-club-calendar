import { CalendarOps, eventEnd, liveCalendar, promptConflictResolution } from "./conflicts";
import { prisma } from "./db";
import { ConflictingEvent } from "./google/calendar";
import { applyFeedback } from "./preferences/learner";

export type Action = "approved" | "declined" | "snoozed";

/**
 * Apply a user decision to a candidate event. Approvals are booked onto
 * Google Calendar when linked (status "booked"), otherwise recorded locally
 * (status "approved"). Every decision also trains the preference profile.
 *
 * An approval that would double-book is held instead: nothing is written to
 * the calendar and no preference is learned until the user says which event
 * they want. This is the single gate every booking path goes through — the
 * digest replies and the cron's standing auto-book rules both land here.
 */
export async function applyAction(
  candidateId: string,
  action: Action,
  ops: CalendarOps = liveCalendar
) {
  const c = await prisma.candidateEvent.findUnique({ where: { id: candidateId } });
  if (!c) throw new Error("candidate not found");

  if (action === "approved") {
    const conflicts = await ops
      .findConflicts(c.userId, c.startTime, eventEnd(c))
      .catch((err) => {
        // A calendar lookup failure should not silently swallow a booking.
        console.error("conflict check failed, booking anyway:", err);
        return null;
      });
    if (conflicts?.length) {
      const pending = await promptConflictResolution(c.userId, c.id, conflicts);
      return {
        candidate: c,
        bookedOnCalendar: false,
        conflict: { pending, conflicts } as {
          pending: { id: string };
          conflicts: ConflictingEvent[];
        },
      };
    }
  }

  await prisma.feedbackEvent.create({
    data: {
      userId: c.userId,
      candidateId: c.id,
      lane: c.lane,
      category: c.category,
      title: c.title,
      action,
    },
  });
  await applyFeedback(c.userId, c, action);

  let status: string = action;
  let googleEventId: string | null = null;
  if (action === "approved") {
    googleEventId = await ops.createCalendarEvent(c.userId, c).catch((err) => {
      console.error("calendar booking failed:", err);
      return null;
    });
    if (googleEventId) status = "booked";
  }

  const updated = await prisma.candidateEvent.update({
    where: { id: c.id },
    data: { status, googleEventId },
  });
  return { candidate: updated, bookedOnCalendar: !!googleEventId, conflict: null };
}
