import type { ProviderId, ProviderUsage } from "./types";

/**
 * Best-effort public list prices in USD per 1,000,000 tokens. These are used only
 * to produce an ESTIMATED cost that is always surfaced to the user as an estimate.
 * Prices drift over time; matching is by longest id substring so unknown models
 * fall through to a conservative provider default rather than a wrong number.
 */
interface PriceRow {
  match: string;
  inputPerM: number;
  outputPerM: number;
}

const PRICE_TABLE: PriceRow[] = [
  // OpenAI
  { match: "gpt-4o-mini", inputPerM: 0.15, outputPerM: 0.6 },
  { match: "gpt-4.1-mini", inputPerM: 0.4, outputPerM: 1.6 },
  { match: "gpt-4.1-nano", inputPerM: 0.1, outputPerM: 0.4 },
  { match: "gpt-4.1", inputPerM: 2, outputPerM: 8 },
  { match: "gpt-4o", inputPerM: 2.5, outputPerM: 10 },
  { match: "o1-mini", inputPerM: 1.1, outputPerM: 4.4 },
  { match: "o3-mini", inputPerM: 1.1, outputPerM: 4.4 },
  { match: "o1", inputPerM: 15, outputPerM: 60 },
  // Anthropic
  { match: "haiku", inputPerM: 0.8, outputPerM: 4 },
  { match: "sonnet", inputPerM: 3, outputPerM: 15 },
  { match: "opus", inputPerM: 15, outputPerM: 75 },
  // Google
  { match: "gemini-2.0-flash", inputPerM: 0.1, outputPerM: 0.4 },
  { match: "gemini-1.5-flash", inputPerM: 0.075, outputPerM: 0.3 },
  { match: "gemini-1.5-pro", inputPerM: 1.25, outputPerM: 5 },
  { match: "flash", inputPerM: 0.1, outputPerM: 0.4 },
  { match: "pro", inputPerM: 1.25, outputPerM: 5 },
];

const PROVIDER_DEFAULT: Record<ProviderId, PriceRow> = {
  openai: { match: "openai", inputPerM: 2.5, outputPerM: 10 },
  anthropic: { match: "anthropic", inputPerM: 3, outputPerM: 15 },
  openrouter: { match: "openrouter", inputPerM: 1, outputPerM: 3 },
  gemini: { match: "gemini", inputPerM: 1.25, outputPerM: 5 },
  local: { match: "local", inputPerM: 0, outputPerM: 0 },
};

function priceFor(provider: ProviderId, model: string): PriceRow {
  const id = model.toLowerCase();
  const rows = PRICE_TABLE.filter((row) => id.includes(row.match));
  if (rows.length) return rows.sort((a, b) => b.match.length - a.match.length)[0];
  return PROVIDER_DEFAULT[provider];
}

/**
 * Returns an estimated USD cost for a single model call, or undefined when token
 * usage was not reported by the provider. Never fabricates token counts.
 */
export function estimateCostUsd(provider: ProviderId, model: string, usage: ProviderUsage | undefined): number | undefined {
  if (!usage || (usage.inputTokens === undefined && usage.outputTokens === undefined)) return undefined;
  const price = priceFor(provider, model);
  const input = (usage.inputTokens ?? 0) / 1_000_000 * price.inputPerM;
  const output = (usage.outputTokens ?? 0) / 1_000_000 * price.outputPerM;
  return Math.round((input + output) * 1_000_000) / 1_000_000;
}

export interface UsageTotals {
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
  hasCost: boolean;
}

export function emptyTotals(): UsageTotals {
  return { inputTokens: 0, outputTokens: 0, estimatedCostUsd: 0, hasCost: false };
}

export function addUsage(totals: UsageTotals, usage: ProviderUsage | undefined): UsageTotals {
  if (!usage) return totals;
  return {
    inputTokens: totals.inputTokens + (usage.inputTokens ?? 0),
    outputTokens: totals.outputTokens + (usage.outputTokens ?? 0),
    estimatedCostUsd: totals.estimatedCostUsd + (usage.estimatedCostUsd ?? 0),
    hasCost: totals.hasCost || usage.estimatedCostUsd !== undefined,
  };
}
