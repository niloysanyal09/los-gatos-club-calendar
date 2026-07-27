import { getSessionUser } from "@/lib/session";

export default async function DonePage() {
  const user = await getSessionUser();
  const texting = !!user?.phone && user?.channel !== "web";
  return (
    <div className="hero">
      <div style={{ fontSize: 48 }}>📲</div>
      <h1>You&apos;re in{user?.name ? `, ${user.name.split(" ")[0]}` : ""}.</h1>
      <p>
        {texting
          ? "Jarvis is scouting your area right now — your first picks arrive by text in a few minutes. From here on, everything happens in Messages: Tapback 👍 to book, 👎 to pass, ‼️ for maybe. Booked events land on your calendar with a ticket link to pay on your phone."
          : "Jarvis is scouting your area now. Add your mobile number in Settings to get picks by text — that's where Jarvis really lives."}
      </p>
      <p style={{ fontSize: 13 }}>
        You can close this page. It&apos;s only needed again for settings or payments.
      </p>
    </div>
  );
}
