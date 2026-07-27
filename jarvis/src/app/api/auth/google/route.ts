import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { consentUrl, googleConfigured } from "@/lib/google/oauth";
import { getSessionUserId, setSessionUser } from "@/lib/session";

/**
 * The ad-click entry point: "Continue with Google". Works with no prior
 * session — a shell user is created on the spot, identity comes back from
 * Google in the callback, and the questions + taste game follow.
 */
export async function GET(req: NextRequest) {
  const base = req.nextUrl.origin;
  if (!googleConfigured())
    return NextResponse.redirect(`${base}/onboarding?google=not-configured`);
  let userId = await getSessionUserId();
  if (!userId) {
    const user = await prisma.user.create({ data: {} });
    await setSessionUser(user.id);
    userId = user.id;
  }
  return NextResponse.redirect(consentUrl(userId));
}
