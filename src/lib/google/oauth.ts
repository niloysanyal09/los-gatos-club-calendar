import { google } from "googleapis";
import { prisma } from "../db";

export function googleConfigured() {
  return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

export function oauthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    `${process.env.APP_URL ?? "http://localhost:3000"}/api/auth/google/callback`
  );
}

export function consentUrl(state: string) {
  return oauthClient().generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: [
      "https://www.googleapis.com/auth/calendar.events",
      "https://www.googleapis.com/auth/calendar.freebusy",
      "openid",
      "email",
      "profile",
    ],
    state,
  });
}

/** Returns an authorized OAuth2 client for a linked user, refreshing tokens as needed. */
export async function authedClient(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user?.calendarLinked || !user.googleRefreshToken) return null;
  const client = oauthClient();
  client.setCredentials({
    access_token: user.googleAccessToken ?? undefined,
    refresh_token: user.googleRefreshToken,
    expiry_date: user.googleTokenExpiry?.getTime(),
  });
  client.on("tokens", async (tokens) => {
    await prisma.user.update({
      where: { id: userId },
      data: {
        googleAccessToken: tokens.access_token ?? undefined,
        googleTokenExpiry: tokens.expiry_date ? new Date(tokens.expiry_date) : undefined,
      },
    });
  });
  return client;
}
