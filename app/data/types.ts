export type SourceKind =
  | "structured-api"
  | "public-calendar"
  | "pdf-table"
  | "image-schedule"
  | "source-page"
  | "member-gated";

export type PullStatus = "pulled" | "partial" | "blocked" | "no-public-feed";

export type Venue = {
  id: string;
  name: string;
  address: string;
  distanceMiles: number;
  latitude: number;
  longitude: number;
  website: string;
  sourceKind: SourceKind;
  pullStatus: PullStatus;
  sourceUrl: string;
  note: string;
  activityCount: number;
};

export type Activity = {
  id: string;
  title: string;
  venueId: string;
  venueName: string;
  date: string;
  startTime: string;
  endTime?: string;
  category: string;
  instructor?: string;
  location?: string;
  status?: string;
  description?: string;
  sourceUrl: string;
  clubUrl: string;
  sourceKind: SourceKind;
  confidence: "high" | "medium" | "low";
  interestingScore: number;
};

export type Anchor = {
  label: string;
  address: string;
  latitude: number;
  longitude: number;
  radiusMiles: number;
};

export type SourceNote = {
  venueId: string;
  title: string;
  url: string;
  status: PullStatus;
  detail: string;
};

export type GeneratedData = {
  generatedAt: string;
  dateFrom: string;
  dateTo: string;
  anchor: Anchor;
  venues: Venue[];
  activities: Activity[];
  sourceNotes: SourceNote[];
};

export type QcCheck = {
  id: string;
  activityId?: string;
  venueName?: string;
  title: string;
  sourceUrl?: string;
  status: "pass" | "warn" | "fail";
  detail: string;
};

export type QcReport = {
  generatedAt: string;
  sampledActivities: number;
  passCount: number;
  warnCount: number;
  failCount: number;
  checks: QcCheck[];
};
