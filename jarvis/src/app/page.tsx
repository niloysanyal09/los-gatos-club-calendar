import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";

export default async function Home() {
  const user = await getSessionUser();
  if (user) redirect("/digest");
  return (
    <div className="hero">
      <h1>Jarvis lives in your texts.</h1>
      <p>
        Every morning, Jarvis texts you what&apos;s new near you — clubs, movies,
        events, games on TV — matched to your taste. Reply to book; it lands on
        your Google Calendar. This site is only for setup, sign-in, and
        (soon) payments.
      </p>
      <div className="row" style={{ justifyContent: "center" }}>
        <a href="/api/auth/google" className="btn btn-primary">
          Continue with Google
        </a>
      </div>
      <p style={{ marginTop: 14, fontSize: 13 }}>
        <Link href="/onboarding" style={{ color: "var(--muted)" }}>
          or set up manually (demo mode)
        </Link>
      </p>
    </div>
  );
}
