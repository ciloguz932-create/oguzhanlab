import type { ModelRequirement, ProviderModel } from "./types";

export type { ModelRequirement } from "./types";

export interface ModelTrait {
  fast: boolean;
  reasoning: boolean;
  coding: boolean;
  vision: boolean;
}

const REASONING_HINTS = /(o1|o3|o4|reason|think|sonnet|opus|gpt-5|r1|deepseek-r|gemini-\d+\.\d+-pro|-pro\b)/i;
const FAST_HINTS = /(mini|nano|haiku|flash|small|lite|8b|7b|instant|turbo)/i;
const CODING_HINTS = /(cod(er|ing|estral)|deepseek|qwen.*coder|sonnet|gpt-5|gpt-4\.1)/i;
const VISION_HINTS = /(vision|-vl|4o|omni|gpt-5|sonnet|opus|gemini|pixtral|llava)/i;

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
 * Selects the best available model id for a task requirement from a connection's
 * models. Falls back to the provided default (or the first model) when no model
 * satisfies the requirement, so routing never blocks execution.
 */
export function selectModel(models: ProviderModel[], requirement: ModelRequirement | undefined, defaultModel: string): string {
  if (!models.length) return defaultModel;
  const fallback = models.some((model) => model.id === defaultModel) ? defaultModel : models[0].id;
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
