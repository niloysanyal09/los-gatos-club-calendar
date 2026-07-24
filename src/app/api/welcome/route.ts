import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { runDiscovery } from "@/lib/discovery";
import { sendDigest } from "@/lib/messaging";
import { sendMessage } from "@/lib/messaging/send";
import { getSessionUserId } from "@/lib/session";

/**
 * Fired once when onboarding completes: text a welcome immediately, then run
 * the first discovery in the background and text the first digest — the new
 * user's phone lights up minutes after the ad click.
 */
export async function POST() {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "not signed in" }, { status: 401 });
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return NextResponse.json({ error: "no user" }, { status: 404 });

  const canText = !!user.phone && user.channel !== "web";
  if (canText) {
    await sendMessage(
      user.channel,
      user.phone!,
      `It's Jarvis 👋 Nice to meet you${user.name ? ", " + user.name.split(" ")[0] : ""}. I'm out scouting your area right now — your first picks will land here in a few minutes.\n\nWhen they do: Tapback 👍 to book, 👎 to pass, ‼️ for maybe — or just tell me in plain words.`
    );
  }

  // Fire-and-forget: discovery + first digest happen after we respond
  void (async () => {
    try {
      await runDiscovery(userId, { scan: "light" });
      if (canText) await sendDigest(userId, { onlyNew: true });
    } catch (err) {
      console.error("welcome discovery failed:", err);
    }
  })();

  return NextResponse.json({ ok: true, texting: canText });
}
