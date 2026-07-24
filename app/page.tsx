import type { Metadata } from "next";
import { ActivityCalendar } from "./components/ActivityCalendar";
import { generatedData } from "./data/generated";
import { qcReport } from "./data/qc-report";

export const metadata: Metadata = {
  title: "Los Gatos Club Activity Calendar",
  description: "A consolidated activity calendar for private and membership clubs within 10 miles of Blossom Hill Road in Los Gatos.",
  other: {
    "data-generated-at": generatedData.generatedAt,
  },
};

export default function Home() {
  return <ActivityCalendar data={generatedData} qcReport={qcReport} />;
}
