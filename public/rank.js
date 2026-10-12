// Pure ranking of (model, effort) pairs. No DOM, so it tests under plain node.

export const FALLBACK_MODELS = ['opus', 'sonnet', 'fable'];

const SEP = '\u0000';

// Graph node `model` values are the same strings as api.agents() option values
// (core's own quick launch compares them directly), so no normalisation needed.
function agentFor(model, agents) {
  return agents.find((a) => (a.models || []).some((m) => m.value === model));
}

function allowed(model, effort, agents) {
  const agent = agentFor(model, agents);
  if (!agent) return false;
  if (!effort) return true;
  return (agent.efforts || []).some((e) => e.value === effort);
}

// Top n { model, effort } pairs ('' effort = agent default) by how often they were
// launched across live sessions and history; ties keep first-seen order. Pairs the
// current agent list can't launch are dropped, and opus/sonnet/fable at default
// backfill any empty slot.
export function rankPairs(graph, agents, n = 3) {
  agents = Array.isArray(agents) ? agents : [];
  const counts = new Map();
  for (const node of [...(graph?.sessions || []), ...(graph?.history || [])]) {
    if (!node?.model) continue;
    const key = node.model + SEP + (node.effort || 'default');
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  // Array.prototype.sort is stable, and Map iterates in insertion order.
  const ranked = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([key]) => {
      const [model, effort] = key.split(SEP);
      return { model, effort: effort === 'default' ? '' : effort };
    });
  const picks = [];
  const has = (p) => picks.some((q) => q.model === p.model && q.effort === p.effort);
  for (const p of [...ranked, ...FALLBACK_MODELS.map((model) => ({ model, effort: '' }))]) {
    if (picks.length >= n) break;
    if (allowed(p.model, p.effort, agents) && !has(p)) picks.push(p);
  }
  return picks;
}

// "Opus · High": the model label without its " · <context>" suffix, then the
// effort label ("default" when blank). A model whose agent has no efforts shows
// the model name alone.
export function label(pair, agents) {
  agents = Array.isArray(agents) ? agents : [];
  const agent = agentFor(pair.model, agents);
  const opt = agent?.models.find((m) => m.value === pair.model);
  const name = (opt?.label.split('·')[0] || '').trim() || pair.model;
  const efforts = agent?.efforts || [];
  if (!efforts.length) return name;
  if (!pair.effort) return `${name} · default`;
  const e = efforts.find((x) => x.value === pair.effort);
  return `${name} · ${e?.label || pair.effort}`;
}
