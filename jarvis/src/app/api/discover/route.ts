import { NextResponse } from "next/server";
import { runDiscovery } from "@/lib/discovery";
import { getSessionUserId } from "@/lib/session";

export const maxDuration = 300;

export async function POST() {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "not signed in" }, { status: 401 });
  try {
    const summary = await runDiscovery(userId);
    return NextResponse.json(summary);
  } catch (err) {
    console.error("discovery failed:", err);
    return NextResponse.json({ error: "discovery failed" }, { status: 500 });
  }
}
