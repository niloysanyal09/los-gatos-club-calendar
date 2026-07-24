import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the consolidated club calendar", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /Los Gatos Club Activity Calendar/i);
  assert.match(html, /Private-club activity calendar near Blossom Hill Road/i);
  assert.match(html, /activities pulled/i);
  assert.match(html, /Bay Club Courtside/i);
  assert.match(html, /Los Gatos Swim and Racquet Club/i);
  assert.match(html, />Sources</i);
  assert.match(html, />QC</i);
  assert.match(html, /https:\/\/www\.bayclubs\.com\/classes\?c2=courtside/i);
  assert.match(html, /https:\/\/lgsrc\.com\/wp-content\/uploads\/2026\/06\/July-GX-Schedule-2026-Website-1\.pdf/i);
  assert.doesNotMatch(html, /Your site is taking shape|react-loading-skeleton|codex-preview/i);
});

test("keeps the data pipeline and generated artifacts wired", async () => {
  const [page, layout, packageJson, generatedData, qcReport, generator, qcAgent] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("../public/data/activities.json", import.meta.url), "utf8"),
    readFile(new URL("../public/data/qc-report.json", import.meta.url), "utf8"),
    readFile(new URL("../scripts/generate-data.mjs", import.meta.url), "utf8"),
    readFile(new URL("../scripts/qc-agent.mjs", import.meta.url), "utf8"),
  ]);

  const data = JSON.parse(generatedData);
  const qc = JSON.parse(qcReport);

  assert.match(page, /<ActivityCalendar data=\{generatedData\} qcReport=\{qcReport\}/);
  assert.match(layout, /Los Gatos Club Activity Calendar/);
  assert.match(packageJson, /"refresh": "pnpm data:generate && pnpm qc"/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
  assert.match(generator, /getClasses\?club=/);
  assert.match(generator, /calendar\/ical/);
  assert.match(qcAgent, /deterministicSample/);
  assert.ok(data.activities.length >= 400);
  assert.ok(data.venues.length >= 10);
  assert.equal(qc.failCount, 0);
});
