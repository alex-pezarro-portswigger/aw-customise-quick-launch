// Browser half. One `dispatch.field` at the `model` anchor that stands in for
// core's ⌘1–⌘3 row (vetoed via hides: ['quickLaunch']), ranked by model + effort.
import { rankPairs, label } from './rank.js';

// Copied from core's app.js — it isn't exported.
export const QUICK_LAUNCH_ICON = '<svg class="icon" aria-hidden="true" viewBox="0 0 24 24" fill="currentColor"><path d="M7 4.5v15a1 1 0 0 0 1.5.86l12-7.5a1 1 0 0 0 0-1.72l-12-7.5A1 1 0 0 0 7 4.5z"/></svg>';

const SLOTS = 3;

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export default {
  register(reg) {
    const api = reg.api;
    // Empty until the agents frame lands; rankPairs then yields nothing, so
    // fall back to the plain backfill so three buttons still show.
    let agents = safeAgents(api);
    let pairs = [];
    let mode = 'launch';
    let buttons = [];

    function launch(i) {
      if (mode !== 'launch') return;
      const p = pairs[i];
      if (!p) return;
      Promise.resolve()
        .then(() => api.dispatch.submit({ model: p.model, effort: p.effort || undefined }))
        .catch((err) => console.warn('[quick-launch] launch failed:', err?.message || err));
    }

    api.agents?.onChange?.((list) => { agents = Array.isArray(list) ? list : []; });

    for (let n = 1; n <= SLOTS; n++) {
      api.keys.bind({
        combo: `mod+${n}`,
        scope: 'dispatch',
        run: () => launch(n - 1),
        description: `Quick launch slot ${n}`,
      });
    }

    reg.register('dispatch.field', {
      id: 'quick-launch',
      at: 'model',
      hides: ['quickLaunch'],

      mount(el) {
        el.innerHTML = `<div class="quick-launch">${'<button type="button" class="ghost quick-launch-btn"></button>'.repeat(SLOTS)}</div>`;
        buttons = [...el.querySelectorAll('.quick-launch-btn')];
        buttons.forEach((b, i) => b.addEventListener('click', () => launch(i)));
      },

      update(el, ctx, graph) {
        mode = ctx?.mode || 'launch';
        const wrap = el.querySelector('.quick-launch');
        wrap?.classList.toggle('hidden', mode !== 'launch');
        pairs = agents.length
          ? rankPairs(graph, agents, SLOTS)
          : ['opus', 'sonnet', 'fable'].map((model) => ({ model, effort: '' }));
        buttons.forEach((btn, i) => {
          const p = pairs[i];
          btn.style.display = p ? '' : 'none';
          if (!p) return;
          const text = label(p, agents);
          btn.innerHTML = `${QUICK_LAUNCH_ICON}${esc(text)} <span class="kbd">⌘${i + 1}</span>`;
          btn.title = `Launch with ${text} (⌘${i + 1})`;
        });
      },

      unmount() { buttons = []; },
    });
  },
};

function safeAgents(api) {
  try { const a = api.agents?.(); return Array.isArray(a) ? a : []; } catch { return []; }
}
