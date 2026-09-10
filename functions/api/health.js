import { json, loadBrain } from './_util.js';
import { isMock } from '../../desk/client.js';
import { modelFor } from '../../desk/models.js';

// Open (no token) so the panel can tell "desk up, wrong token" from "desk down".
export async function onRequestGet({ request, env }) {
  const origin = new URL(request.url).origin;
  let notes = 0, brainError = null;
  try { notes = (await loadBrain(env, origin)).notes.length; } catch (e) { brainError = e.message; }
  return json({
    ok: !brainError,
    mock: isMock(env),
    tokenSet: Boolean(env.TA_TOKEN),
    kv: Boolean(env.TA_KV),
    brain: { notes, error: brainError },
    models: { composer: modelFor('composer', env), checker: modelFor('checker', env), deeper: modelFor('deeper', env), widget: modelFor('widget', env) },
  });
}
