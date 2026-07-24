import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const data = JSON.parse(readFileSync(resolve(root, "public/data/activities.json"), "utf8"));

function deterministicSample(items, size) {
  const scored = items.map((item) => {
    let score = 0;
    for (const char of item.id) score = (score * 31 + char.charCodeAt(0)) % 1000003;
    return { item, score };
  });
  return scored.sort((a, b) => a.score - b.score).slice(0, size).map((entry) => entry.item);
}

async function urlStatus(url) {
  try {
    const response = await fetch(url, { method: "GET", redirect: "follow" });
    return { ok: response.ok, status: response.status, text: await response.text().catch(() => "") };
  } catch (error) {
    return { ok: false, status: 0, text: "", error: error.message };
  }
}

function checkRequiredFields(activity) {
  const missing = ["title", "venueName", "date", "startTime", "sourceUrl"].filter((field) => !activity[field]);
  return missing.length ? `Missing ${missing.join(", ")}` : "Required fields present.";
}

async function main() {
  const checks = [];
  const sample = deterministicSample(data.activities, Math.min(18, data.activities.length));

  for (const venue of data.venues) {
    if (venue.distanceMiles > data.anchor.radiusMiles) {
      checks.push({
        id: `venue-radius-${venue.id}`,
        venueName: venue.name,
        title: `${venue.name} radius check`,
        status: "fail",
        detail: `${venue.distanceMiles} mi exceeds radius.`,
        sourceUrl: venue.sourceUrl,
      });
    } else {
      checks.push({
        id: `venue-radius-${venue.id}`,
        venueName: venue.name,
        title: `${venue.name} radius check`,
        status: "pass",
        detail: `${venue.distanceMiles} mi from the approximate anchor.`,
        sourceUrl: venue.sourceUrl,
      });
    }
  }

  const uniqueUrls = [...new Set(sample.map((activity) => activity.sourceUrl))];
  const urlResults = new Map();
  for (const url of uniqueUrls) {
    urlResults.set(url, await urlStatus(url));
  }

  for (const activity of sample) {
    const required = checkRequiredFields(activity);
    const source = urlResults.get(activity.sourceUrl);
    let status = "pass";
    let detail = required;
    if (!source?.ok) {
      status = "warn";
      detail = `${required} Source returned HTTP ${source?.status || 0}.`;
    } else if (activity.sourceKind === "pdf-table") {
      detail = `${required} PDF source responded HTTP ${source.status}; table extraction is medium confidence.`;
    } else if (activity.sourceKind === "public-calendar") {
      detail = `${required} Calendar source responded HTTP ${source.status}; recurrence was expanded locally.`;
    } else if (activity.sourceKind === "structured-api") {
      detail = `${required} Bay Club deep link responded HTTP ${source.status}.`;
    }
    if (required.startsWith("Missing")) status = "fail";
    checks.push({
      id: `activity-${activity.id}`,
      activityId: activity.id,
      venueName: activity.venueName,
      title: activity.title,
      status,
      detail,
      sourceUrl: activity.sourceUrl,
    });
  }

  for (const note of data.sourceNotes.filter((item) => item.status !== "pulled")) {
    checks.push({
      id: `coverage-${note.venueId}`,
      venueName: note.title,
      title: `${note.title} coverage gap`,
      status: note.status === "no-public-feed" ? "warn" : "warn",
      detail: note.detail,
      sourceUrl: note.url,
    });
  }

  const report = {
    generatedAt: new Date().toISOString(),
    sampledActivities: sample.length,
    passCount: checks.filter((check) => check.status === "pass").length,
    warnCount: checks.filter((check) => check.status === "warn").length,
    failCount: checks.filter((check) => check.status === "fail").length,
    checks,
  };

  writeFileSync(resolve(root, "public/data/qc-report.json"), `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(
    resolve(root, "app/data/qc-report.ts"),
    `import type { QcReport } from "./types";\n\nexport const qcReport = ${JSON.stringify(report, null, 2)} satisfies QcReport;\n`
  );

  console.log(`QC sampled ${sample.length} activities: ${report.passCount} pass, ${report.warnCount} warn, ${report.failCount} fail.`);
  if (report.failCount > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
