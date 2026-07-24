import { prisma } from "./db";
import { createCalendarEvent } from "./google/calendar";
import { applyFeedback } from "./preferences/learner";

export type Action = "approved" | "declined" | "snoozed";

/**
 * Apply a user decision to a candidate event. Approvals are booked onto
 * Google Calendar when linked (status "booked"), otherwise recorded locally
 * (status "approved"). Every decision also trains the preference profile.
 */
export async function applyAction(candidateId: string, action: Action) {
  const c = await prisma.candidateEvent.findUnique({ where: { id: candidateId } });
  if (!c) throw new Error("candidate not found");

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
    googleEventId = await createCalendarEvent(c.userId, c).catch((err) => {
      console.error("calendar booking failed:", err);
      return null;
    });
    if (googleEventId) status = "booked";
  }

  const updated = await prisma.candidateEvent.update({
    where: { id: c.id },
    data: { status, googleEventId },
  });
  return { candidate: updated, bookedOnCalendar: !!googleEventId };
}
