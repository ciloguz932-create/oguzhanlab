import type { ModelRequirement, ProviderModel } from "./types";

export type { ModelRequirement } from "./types";

export interface ModelTrait {
  fast: boolean;
  reasoning: boolean;
  coding: boolean;
  vision: boolean;
}

const REASONING_HINTS = /(o1|o3|o4|reason|think|fable|mythos|sonnet|opus|gpt-5|r1|deepseek-r|gemini-\d+\.\d+-pro|-pro\b)/i;
const FAST_HINTS = /(mini|nano|haiku|flash|small|lite|8b|7b|instant|turbo)/i;
const CODING_HINTS = /(cod(er|ing|estral)|deepseek|qwen.*coder|fable|mythos|sonnet|opus|gpt-5|gpt-4\.1)/i;
const VISION_HINTS = /(vision|-vl|4o|omni|gpt-5|fable|mythos|sonnet|opus|gemini|pixtral|llava)/i;

/**
 * Derives capability traits for a model. Provider adapters do not reliably report
 * fine-grained capabilities, so we combine any declared capabilities with
 * conservative id-based heuristics. Heuristics are additive: a declared capability
 * always wins, a hint only sets a trait to true.
 */
export function classifyModel(model: ProviderModel): ModelTrait {
  const id = `${model.id} ${model.label}`.toLowerCase();
  const caps = new Set(model.capabilities);
  return {
    fast: FAST_HINTS.test(id),
    reasoning: caps.has("reasoning") || REASONING_HINTS.test(id),
    coding: CODING_HINTS.test(id),
    vision: caps.has("vision") || VISION_HINTS.test(id),
  };
}

/**
 * Chooses a sensible default model for a freshly connected provider. For OpenRouter we
 * strongly prefer a `:free` model (so a key with no credits works out of the box), and a
 * fast tier within that; for other providers we prefer a fast/cheap model. Falls back to
 * the first model. This is the model a plain conversational goal (no skill) will use.
 */
export function pickDefaultModel(providerId: string, models: ProviderModel[]): string {
  if (!models.length) return "";
  const isFast = (m: ProviderModel) => FAST_HINTS.test(`${m.id} ${m.label}`.toLowerCase());
  if (providerId === "openrouter") {
    const free = models.filter((m) => /:free\b/i.test(m.id));
    const pool = free.length ? free : models;
    return (pool.find(isFast) ?? pool[0]).id;
  }
  return (models.find(isFast) ?? models[0]).id;
}

/**
 * Selects the best available model id for a task requirement from a connection's
 * models. A user `override` for this requirement wins whenever it names a model the
 * connection actually has; otherwise capability heuristics choose, falling back to
 * the provided default (or the first model) so routing never blocks execution.
 */
export function selectModel(models: ProviderModel[], requirement: ModelRequirement | undefined, defaultModel: string, override?: string): string {
  if (!models.length) return defaultModel;
  const fallback = models.some((model) => model.id === defaultModel) ? defaultModel : models[0].id;
  if (override && models.some((model) => model.id === override)) return override;
  if (!requirement) return fallback;

  const scored = models
    .map((model) => ({ id: model.id, trait: classifyModel(model) }))
    .filter((entry) => entry.trait[requirement]);
  if (!scored.length) return fallback;

  // For "fast" prefer a matching model even if it also reasons; for the others
  // prefer a model that is not merely the fast tier so quality is not downgraded.
  if (requirement === "fast") return scored[0].id;
  const nonFast = scored.find((entry) => !entry.trait.fast);
  return (nonFast ?? scored[0]).id;
}
