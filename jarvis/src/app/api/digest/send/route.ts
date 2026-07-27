import { NextResponse } from "next/server";
import { sendDigest } from "@/lib/messaging";
import { getSessionUserId } from "@/lib/session";

export async function POST() {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "not signed in" }, { status: 401 });
  const result = await sendDigest(userId);
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
