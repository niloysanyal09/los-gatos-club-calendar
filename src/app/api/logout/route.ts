import { NextRequest, NextResponse } from "next/server";
import { clearSessionUser } from "@/lib/session";

/**
 * Drops the session cookie and sends you back to the landing page. Mostly a
 * testing aid: signing out is what lets the returning-user merge be exercised
 * repeatedly without clearing cookies by hand.
 */
export async function GET(req: NextRequest) {
  await clearSessionUser();
  return NextResponse.redirect(`${req.nextUrl.origin}/`);
}
