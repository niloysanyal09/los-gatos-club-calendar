import { CandidateEvent, PendingConflict } from "@prisma/client";
import { prisma } from "./db";
import {
  ConflictingEvent,
  createCalendarEvent,
  deleteCalendarEvent,
  findConflicts,
} from "./google/calendar";

/**
 * How long an unanswered conflict question stays live. Long enough to survive
 * a night's sleep, short enough that a stale "REPLACE" cannot delete something
 * days after the user has forgotten what was asked.
 */
export const CONFLICT_TTL_MS = 24 * 3600_000;

/** Calendar side effects, injectable so the flow can be tested without Google. */
export interface CalendarOps {
  findConflicts: typeof findConflicts;
  deleteCalendarEvent: typeof deleteCalendarEvent;
  createCalendarEvent: typeof createCalendarEvent;
}

export const liveCalendar: CalendarOps = {
  findConflicts,
  deleteCalendarEvent,
  createCalendarEvent,
};

/** Bookings default to two hours when the source gave no end time. */
export function eventEnd(c: { startTime: Date; endTime?: Date | null }): Date {
  return c.endTime ?? new Date(c.startTime.getTime() + 2 * 3600_000);
}

export function parseConflicts(row: PendingConflict): ConflictingEvent[] {
  try {
    const raw = JSON.parse(row.conflicts) as {
      id: string;
      title: string;
      start: string;
      end: string;
    }[];
    return raw.map((c) => ({ ...c, start: new Date(c.start), end: new Date(c.end) }));
  } catch {
    return [];
  }
}

/**
 * Ask the user which of the two events they want. Any earlier unanswered
 * question about the same candidate is retired first, so a repeated Tapback
 * cannot leave two live questions pointing at the same booking.
 */
export async function promptConflictResolution(
  userId: string,
  candidateId: string,
  conflicts: ConflictingEvent[]
): Promise<PendingConflict> {
  await prisma.pendingConflict.updateMany({
    where: { candidateId, resolvedAt: null },
    data: { resolvedAt: new Date(), resolution: "superseded" },
  });
  return prisma.pendingConflict.create({
    data: {
      userId,
      candidateId,
      conflicts: JSON.stringify(
        conflicts.map((c) => ({
          id: c.id,
          title: c.title,
          start: c.start.toISOString(),
          end: c.end.toISOString(),
        }))
      ),
      expiresAt: new Date(Date.now() + CONFLICT_TTL_MS),
    },
  });
}

/** The live question for this user, if any. Expired rows are swept as we go. */
export async function findActiveConflict(
  userId: string
): Promise<{ pending: PendingConflict; candidate: CandidateEvent } | null> {
  const now = new Date();
  await prisma.pendingConflict.updateMany({
    where: { userId, resolvedAt: null, expiresAt: { lt: now } },
    data: { resolvedAt: now, resolution: "expired" },
  });
  const pending = await prisma.pendingConflict.findFirst({
    where: { userId, resolvedAt: null, expiresAt: { gt: now } },
    orderBy: { createdAt: "desc" },
  });
  if (!pending) return null;
  const candidate = await prisma.candidateEvent.findUnique({
    where: { id: pending.candidateId },
  });
  if (!candidate) {
    await prisma.pendingConflict.update({
      where: { id: pending.id },
      data: { resolvedAt: now, resolution: "expired" },
    });
    return null;
  }
  return { pending, candidate };
}

export interface ConflictOutcome {
  resolution: "replace" | "keep";
  candidate: CandidateEvent;
  removed: string[];
  bookedOnCalendar: boolean;
}

/**
 * Act on the user's answer.
 *
 * REPLACE deletes the clashing events, then books. The delete comes first on
 * purpose: if the insert then fails the slot is at least free, and the user is
 * told the booking did not land rather than being left with a silent overlap.
 *
 * KEEP declines the candidate and touches the calendar not at all.
 */
export async function resolveConflict(
  pendingId: string,
  resolution: "replace" | "keep",
  ops: CalendarOps = liveCalendar
): Promise<ConflictOutcome | null> {
  const pending = await prisma.pendingConflict.findUnique({ where: { id: pendingId } });
  if (!pending || pending.resolvedAt) return null;
  const candidate = await prisma.candidateEvent.findUnique({
    where: { id: pending.candidateId },
  });
  if (!candidate) return null;

  // applyAction is deliberately not reused here: it would re-run the conflict
  // gate we are in the middle of answering.
  const { applyFeedback } = await import("./preferences/learner");
  const removed: string[] = [];
  let bookedOnCalendar = false;

  if (resolution === "replace") {
    for (const c of parseConflicts(pending)) {
      try {
        await ops.deleteCalendarEvent(pending.userId, c.id);
        removed.push(c.title);
      } catch (err) {
        console.error(`conflict: could not remove "${c.title}":`, err);
      }
    }
    const googleEventId = await ops
      .createCalendarEvent(pending.userId, candidate)
      .catch((err) => {
        console.error("conflict: booking after replace failed:", err);
        return null;
      });
    bookedOnCalendar = !!googleEventId;
    await prisma.candidateEvent.update({
      where: { id: candidate.id },
      data: { status: bookedOnCalendar ? "booked" : "approved", googleEventId },
    });
  } else {
    await prisma.candidateEvent.update({
      where: { id: candidate.id },
      data: { status: "declined" },
    });
  }

  const action = resolution === "replace" ? "approved" : "declined";
  await prisma.feedbackEvent.create({
    data: {
      userId: pending.userId,
      candidateId: candidate.id,
      lane: candidate.lane,
      category: candidate.category,
      title: candidate.title,
      action,
    },
  });
  await applyFeedback(pending.userId, candidate, action);

  await prisma.pendingConflict.update({
    where: { id: pending.id },
    data: { resolvedAt: new Date(), resolution },
  });

  const updated = await prisma.candidateEvent.findUniqueOrThrow({ where: { id: candidate.id } });
  return { resolution, candidate: updated, removed, bookedOnCalendar };
}
