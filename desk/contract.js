// The one place the response shapes live. The prompt (prompts.js), the
// validator (schema.js), the API (functions/api/ask.js) and the renderer
// (extension/sidebar/panel.js) all read from here. tests/contract.test.js
// fails if the renderer stops mentioning a field listed here — that is the
// four-seams check.

export const CONTRACT_VERSION = 1;

// A reply the TA posts under a note. `kind` says what it is.
export const REPLY_KINDS = ['you', 'answer', 'check', 'deeper', 'widget', 'error'];
// 'you' is KB's follow-up inside a thread; the desk stores it and answers it.

// answer / deeper — one concept, in KB's framing, with anchors.
export const ANSWER_FIELDS = ['concept', 'title', 'body', 'cites', 'widgetHint', 'enough'];
// enough: false means the notes did not cover it; the desk escalates to the
// reasoning pass on its own and the panel shows that reply instead.
// check — a note that contradicts the brain. verdict "ok" renders nothing.
export const CHECK_FIELDS = ['verdict', 'claim', 'correction', 'cites', 'concept'];
// deeper adds these to ANSWER_FIELDS.
export const DEEPER_EXTRA_FIELDS = ['changed', 'why'];
// widget — a declarative spec the sandbox renders. compute is a JS function body.
export const WIDGET_FIELDS = ['title', 'note', 'inputs', 'outputs', 'compute'];

export const WIDGET_INPUT_KINDS = ['slider', 'text', 'choice'];
export const WIDGET_OUTPUT_KINDS = ['bars', 'tokens', 'text', 'number', 'grid'];

// Hard limits the validator enforces and the prompt states.
export const LIMITS = {
  bodyWords: 170,        // one concept, not an article
  correctionWords: 110,
  citesMax: 3,
  widgetInputsMax: 3,
  widgetOutputsMax: 3,
  computeChars: 2500,
};

// Tokens that must not appear in a widget's compute body. The sandbox is the
// real boundary; this is the cheap first line.
export const COMPUTE_FORBIDDEN = /\b(fetch|XMLHttpRequest|WebSocket|import|require|window|document|parent|eval|Function|localStorage|indexedDB|navigator|postMessage)\b/;

export const cite = (src, t) => ({ src, t: Math.round(t) });
export const fmtTime = t => { t = Math.max(0, Math.floor(t || 0)); const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60; return (h ? `${h}:${String(m).padStart(2, '0')}` : String(m)) + ':' + String(s).padStart(2, '0'); };
