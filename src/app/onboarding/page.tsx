import { getSessionUser } from "@/lib/session";
import OnboardForm from "./OnboardForm";

export default async function OnboardingPage() {
  const user = await getSessionUser();
  return (
    <div>
      <h1>
        {user?.name ? `Welcome, ${user.name.split(" ")[0]} 👋` : "Tell Jarvis about you"}
      </h1>
      <p className="sub">
        {user?.calendarLinked
          ? "Calendar linked ✓ — a few quick questions and you're off."
          : "This takes a minute. Jarvis learns the rest from what you book and pass on."}
      </p>
      <OnboardForm
        initialName={user?.name ?? ""}
        initialEmail={user?.email ?? ""}
        calendarLinked={user?.calendarLinked ?? false}
      />
    </div>
  );
}
