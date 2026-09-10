// Which OpenRouter model does which job. Overridable per job from the Pages
// environment so a swap is a config change, not a deploy of code.
//
// Picked 2026-09-10 from the OpenRouter catalogue by price, context and the
// reasoning/tools flags, plus family reputation. Not benchmarked yet —
// scripts/bench.mjs runs KB's real d1 doubts through any list of candidates
// so the choice can be made on evidence. See docs in AGENTS.md.

export const DEFAULTS = {
  // Composition from retrieved notes. Cheap, fast, follows a JSON shape well.
  composer: 'openai/gpt-oss-120b',
  // Claim checking. Same class as composer; needs judgement not creativity.
  checker: 'openai/gpt-oss-120b',
  // The deeper pass: full transcript so far + prerequisite subgraph.
  deeper: 'deepseek/deepseek-v4-pro',
  // Widget spec generation: a small, code-shaped task.
  widget: 'qwen/qwen3-coder-next',
};

// Fallbacks tried in order if the primary errors or returns invalid JSON twice.
export const FALLBACKS = {
  composer: ['qwen/qwen3.7-flash', 'deepseek/deepseek-v4-flash'],
  checker: ['qwen/qwen3.7-flash'],
  deeper: ['qwen/qwen3.7-plus', 'minimax/minimax-m3'],
  widget: ['moonshotai/kimi-k2.7-code', 'openai/gpt-oss-120b'],
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
