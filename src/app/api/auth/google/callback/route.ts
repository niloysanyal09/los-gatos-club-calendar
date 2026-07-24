import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { oauthClient } from "@/lib/google/oauth";

export async function GET(req: NextRequest) {
  const base = req.nextUrl.origin;
  const code = req.nextUrl.searchParams.get("code");
  const userId = req.nextUrl.searchParams.get("state");
  if (!code || !userId) return NextResponse.redirect(`${base}/settings?google=error`);
  try {
    const client = oauthClient();
    const { tokens } = await client.getToken(code);
    client.setCredentials(tokens);

    // Pull name + email from the Google profile so the user never types them
    let name: string | undefined;
    let email: string | undefined;
    try {
      const { google } = await import("googleapis");
      const info = await google.oauth2({ version: "v2", auth: client }).userinfo.get();
      name = info.data.name ?? undefined;
      email = info.data.email ?? undefined;
    } catch {}

    await prisma.user.update({
      where: { id: userId },
      data: {
        name,
        email,
        googleAccessToken: tokens.access_token ?? null,
        googleRefreshToken: tokens.refresh_token ?? undefined,
        googleTokenExpiry: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
        calendarLinked: true,
      },
    });

    // Route by onboarding progress: questions → taste game → digest
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { profile: true },
    });
    let hasTastes = false;
    try {
      hasTastes = Object.keys(JSON.parse(user?.profile?.learned ?? "{}").categoryAffinity ?? {}).length > 0;
    } catch {}
    const next = !user?.address ? "/onboarding" : !hasTastes ? "/onboarding/tastes" : "/digest";
    return NextResponse.redirect(`${base}${next}?google=linked`);
  } catch (err) {
    console.error("google oauth callback failed:", err);
    return NextResponse.redirect(`${base}/settings?google=error`);
  }
}
