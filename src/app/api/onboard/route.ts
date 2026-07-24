import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { geocode } from "@/lib/geo";
import { googleConfigured } from "@/lib/google/oauth";
import { getSessionUserId, setSessionUser } from "@/lib/session";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const {
    name,
    email,
    phone,
    channel,
    address,
    radiusMiles,
    interests,
    sportsTeams,
    memberClubs,
  } = body as {
    name?: string;
    email?: string;
    phone?: string;
    channel?: string;
    address?: string;
    radiusMiles?: number;
    interests?: string[];
    sportsTeams?: string[];
    memberClubs?: string[];
  };

  if (!address || !interests?.length) {
    return NextResponse.json(
      { error: "address and at least one interest are required" },
      { status: 400 }
    );
  }

  const { lat, lng } = await geocode(address);
  const existingId = await getSessionUserId();

  const data = {
    name: name || null,
    email: email || null,
    phone: phone || null,
    channel: channel === "imessage" || channel === "sms" ? channel : "web",
    address,
    lat,
    lng,
    radiusMiles: radiusMiles && radiusMiles > 0 ? radiusMiles : 10,
  };

  const user = existingId
    ? await prisma.user.update({ where: { id: existingId }, data }).catch(() =>
        prisma.user.create({ data })
      )
    : await prisma.user.create({ data });

  await prisma.preferenceProfile.upsert({
    where: { userId: user.id },
    create: {
      userId: user.id,
      statedInterests: JSON.stringify(interests),
      sportsTeams: JSON.stringify(sportsTeams ?? []),
      memberClubs: JSON.stringify(memberClubs ?? []),
    },
    update: {
      statedInterests: JSON.stringify(interests),
      sportsTeams: JSON.stringify(sportsTeams ?? []),
      memberClubs: JSON.stringify(memberClubs ?? []),
    },
  });

  await setSessionUser(user.id);
  return NextResponse.json({ ok: true, googleConfigured: googleConfigured() });
}
