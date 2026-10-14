// Pure ranking of (model, effort[, runtime]) pairs. No DOM, so it tests under plain node.
// A pair's `runtime` is absent for Local. `runtimes` is api.runtimes():
// [{ id, label, ownsModel }]; a runtime that owns its models (Bifrost) takes a
// model id of its own, not one from the agent list, and Claude's efforts.

export const FALLBACK_MODELS = ['opus', 'sonnet', 'fable'];

const SEP = '\u0000';

// Graph node `model` values are the same strings as api.agents() option values
// (core's own quick launch compares them directly), so no normalisation needed.
function agentFor(model, agents) {
  return agents.find((a) => (a.models || []).some((m) => m.value === model));
}

const runtimeFor = (id, runtimes) => (id ? (runtimes || []).find((r) => r.id === id) : null);

// Runtimes only run Claude Code, so a model-owning runtime uses Claude's efforts.
function effortsFor(pair, agents, runtimes) {
  if (runtimeFor(pair.runtime, runtimes)?.ownsModel) return agents.find((a) => a.id === 'claude')?.efforts || [];
  return agentFor(pair.model, agents)?.efforts || [];
}

function allowed(pair, agents, runtimes) {
  const { model, effort, runtime } = pair;
  if (runtime) {
    const rt = runtimeFor(runtime, runtimes);
    if (!rt) return false;
    if (rt.ownsModel) return !effort || effortsFor(pair, agents, runtimes).some((e) => e.value === effort);
  }
  const agent = agentFor(model, agents);
  if (!agent) return false;
  if (runtime && agent.id !== 'claude') return false;
  if (!effort) return true;
  return (agent.efforts || []).some((e) => e.value === effort);
}

const pairOf = (model, effort, runtime) => (runtime ? { model, effort, runtime } : { model, effort });
const same = (a, b) => a && b && a.model === b.model && a.effort === b.effort && (a.runtime || '') === (b.runtime || '');

// Top n pairs ('' effort = agent default) by how often they were launched
// across live sessions and history; ties keep first-seen order. Sessions on a
// model-owning runtime are skipped (the graph only has their stand-in core
// model). Pairs the current agent list can't launch are dropped, and
// opus/sonnet/fable at default, then every other launchable pair, backfill any
// empty slot.
export function rankPairs(graph, agents, n = 3, runtimes = []) {
  agents = Array.isArray(agents) ? agents : [];
  const counts = new Map();
  for (const node of [...(graph?.sessions || []), ...(graph?.history || [])]) {
    if (!node?.model) continue;
    const runtime = node.runtime && node.runtime !== 'local' ? node.runtime : '';
    if (runtime && runtimeFor(runtime, runtimes)?.ownsModel) continue;
    const key = [node.model, node.effort || 'default', runtime].join(SEP);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  // Array.prototype.sort is stable, and Map iterates in insertion order.
  const ranked = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([key]) => {
      const [model, effort, runtime] = key.split(SEP);
      return pairOf(model, effort === 'default' ? '' : effort, runtime);
    });
  const picks = [];
  // Past the usual three, every other launchable pair (each model at default,
  // then at each effort) so six slots can still fill.
  const every = agents.flatMap((a) => (a.models || []).flatMap((m) =>
    ['', ...(a.efforts || []).map((e) => e.value)].map((effort) => ({ model: m.value, effort }))));
  for (const p of [...ranked, ...FALLBACK_MODELS.map((model) => ({ model, effort: '' })), ...every]) {
    if (picks.length >= n) break;
    if (allowed(p, agents, runtimes) && !picks.some((q) => same(p, q))) picks.push(p);
  }
  return picks;
}

// "Opus · High": the model label without its " · <context>" suffix, then the
// effort label ("default" when blank). A model whose agent has no efforts shows
// the model name alone. A non-local runtime adds its label: "gpt-5.4 · High · Bifrost".
export function label(pair, agents, runtimes = []) {
  agents = Array.isArray(agents) ? agents : [];
  const rt = runtimeFor(pair.runtime, runtimes);
  const opt = rt?.ownsModel ? null : agentFor(pair.model, agents)?.models.find((m) => m.value === pair.model);
  const name = (opt?.label.split('·')[0] || '').trim() || pair.model;
  const efforts = effortsFor(pair, agents, runtimes);
  const parts = [name];
  if (efforts.length) parts.push(pair.effort ? efforts.find((x) => x.value === pair.effort)?.label || pair.effort : 'default');
  if (pair.runtime) parts.push(runtimeLabel(pair.runtime, runtimes));
  return parts.join(' · ');
}

// "Bifrost (OpenAI)" → "Bifrost", so the button stays narrow.
export function runtimeLabel(id, runtimes = []) {
  return (runtimeFor(id, runtimes)?.label || id).replace(/\s*\(.*\)\s*$/, '').trim() || id;
}

// "opus:high" → { model: 'opus', effort: 'high' }; "opus" → default effort;
// "gpt-5.4:high@bifrost" adds runtime 'bifrost' ("@local" is Local).
// Blank or malformed → null (the slot ranks by usage).
export function parsePin(text) {
  const m = /^\s*([^:@\s]+)(?::([^:@\s]+))?(?:@([^:@\s]+))?\s*$/.exec(String(text ?? ''));
  return m ? pairOf(m[1], m[2] || '', m[3] && m[3] !== 'local' ? m[3] : '') : null;
}

// The inverse of parsePin.
export function formatPin(pair) {
  if (!pair?.model) return '';
  return `${pair.model}${pair.effort ? `:${pair.effort}` : ''}${pair.runtime ? `@${pair.runtime}` : ''}`;
}

// n slots: each launchable pin keeps its slot; the rest take the usage ranking
// in order, skipping pairs already pinned.
export function slotPairs(graph, agents, pins = [], n = 3, runtimes = []) {
  agents = Array.isArray(agents) ? agents : [];
  const fixed = Array.from({ length: n }, (_, i) => {
    const p = parsePin(pins[i]);
    return p && allowed(p, agents, runtimes) ? p : null;
  });
  const ranked = rankPairs(graph, agents, n * 2, runtimes).filter((p) => !fixed.some((f) => same(f, p)));
  return fixed.map((f) => f || ranked.shift()).filter(Boolean);
}
