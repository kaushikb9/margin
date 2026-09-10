// Which OpenRouter model does which job. Overridable per job from the Pages
// environment so a swap is a config change, not a deploy of code.
//
// Picked 2026-09-10 from OpenRouter's benchmark aggregate (Artificial
// Analysis indices via `npm run benchmarks`) joined to live prices. GLM 5.3
// Flash scored 41.9 intel / 71.5 code / 51.2 agentic at $0.15/$0.50 per M —
// within three points of full GLM 5.3 at a tenth of the price, and ahead of
// every DeepSeek V4 variant — so it takes every cheap job. Full GLM 5.3 takes
// the deeper pass (top intel score, 1.3M context for the whole transcript).
// KB ruled out the GPT and Claude families; nothing here is from them.
// `npm run bench` reads the actual replies; run it before trusting a swap.

export const DEFAULTS = {
  // Composition from retrieved notes. Cheap, fast, follows a JSON shape well.
  composer: 'z-ai/glm-5.3-flash',
  // Claim checking. Same model; judgement not creativity, temperature 0.1.
  checker: 'z-ai/glm-5.3-flash',
  // The deeper pass: full transcript so far + prerequisite subgraph.
  deeper: 'z-ai/glm-5.3',
  // Widget spec generation: a small code-shaped task; 71.5 on coding is plenty.
  widget: 'z-ai/glm-5.3-flash',
};

// Fallbacks tried in order if the primary errors or returns invalid JSON twice.
// Cross-family on purpose, so a provider outage does not take the desk down.
export const FALLBACKS = {
  composer: ['deepseek/deepseek-v4-flash', 'qwen/qwen3.7-flash'],
  checker: ['deepseek/deepseek-v4-flash'],
  deeper: ['deepseek/deepseek-v4-pro-0813', 'moonshotai/kimi-k3'],
  widget: ['z-ai/glm-5.3', 'moonshotai/kimi-k2.7-code'],
};

export function modelFor(job, env = {}) {
  const key = `TA_MODEL_${job.toUpperCase()}`;
  return env[key] || DEFAULTS[job];
}

export function fallbacksFor(job, env = {}) {
  const key = `TA_FALLBACK_${job.toUpperCase()}`;
  if (env[key]) return env[key].split(',').map(s => s.trim()).filter(Boolean);
  return FALLBACKS[job] || [];
}

// Per-job generation settings. Low temperature everywhere: the TA is
// composing from notes, not brainstorming.
export const SETTINGS = {
  composer: { temperature: 0.3, max_tokens: 700 },
  checker: { temperature: 0.1, max_tokens: 500 },
  deeper: { temperature: 0.3, max_tokens: 900, reasoning: { effort: 'medium' } },
  widget: { temperature: 0.2, max_tokens: 1400 },
};
