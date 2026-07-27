import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { applyAction, Action } from "@/lib/feedback";
import { getSessionUserId } from "@/lib/session";

export async function POST(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "not signed in" }, { status: 401 });
  const { candidateId, action } = (await req.json()) as {
    candidateId: string;
    action: Action;
  };
  if (!candidateId || !["approved", "declined", "snoozed"].includes(action)) {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }
  const candidate = await prisma.candidateEvent.findUnique({ where: { id: candidateId } });
  if (!candidate || candidate.userId !== userId) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  const result = await applyAction(candidateId, action);
  return NextResponse.json({
    ok: true,
    status: result.candidate.status,
    bookedOnCalendar: result.bookedOnCalendar,
  });
}
