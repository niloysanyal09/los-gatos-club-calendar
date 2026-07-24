import { prisma } from "./db";

// Claude Sonnet list pricing + web search fee. Slightly conservative
// (ignores intro discounts) so the guard errs on the safe side.
const INPUT_PER_TOKEN = 3 / 1_000_000;
const OUTPUT_PER_TOKEN = 15 / 1_000_000;
const PER_SEARCH = 0.01;

export const MONTHLY_BUDGET_USD = Number(process.env.JARVIS_MONTHLY_BUDGET ?? 20);

export async function recordSpend(usage: {
  inputTokens: number;
  outputTokens: number;
  searches: number;
}) {
  const estCostUsd =
    usage.inputTokens * INPUT_PER_TOKEN +
    usage.outputTokens * OUTPUT_PER_TOKEN +
    usage.searches * PER_SEARCH;
  await prisma.spendLog.create({ data: { ...usage, estCostUsd } }).catch(() => {});
  return estCostUsd;
}

export async function monthToDateSpend(): Promise<number> {
  const start = new Date();
  start.setDate(1);
  start.setHours(0, 0, 0, 0);
  const agg = await prisma.spendLog.aggregate({
    where: { createdAt: { gte: start } },
    _sum: { estCostUsd: true },
  });
  return agg._sum.estCostUsd ?? 0;
}

/** True when this month's estimated spend is still under the budget. */
export async function underBudget(): Promise<boolean> {
  return (await monthToDateSpend()) < MONTHLY_BUDGET_USD;
}
