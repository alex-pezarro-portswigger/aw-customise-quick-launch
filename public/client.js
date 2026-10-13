// Browser half. One `dispatch.field` that stands in for core's ⌘1–⌘3 row
// (vetoed via hides: ['quickLaunch']). There's no anchor in the footer, so the
// field mounts at `top` and moves its row next to core's, beside Cancel/Launch.
import { slotPairs, label, parsePin } from './rank.js';

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
    let row = null;

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
      at: 'top',
      hides: ['quickLaunch'],

      mount(el) {
        el.innerHTML = `<div class="quick-launch">${'<button type="button" class="ghost quick-launch-btn" style="white-space:nowrap"></button>'.repeat(SLOTS)}</div>`;
        row = el.querySelector('.quick-launch');
        buttons = [...el.querySelectorAll('.quick-launch-btn')];
        buttons.forEach((b, i) => b.addEventListener('click', () => launch(i)));
        // Before core's row, outside the wrapper its quickLaunch veto hides
        // (#m-quick-launch-row; older cores have no wrapper).
        const doc = el.ownerDocument;
        const core = doc?.getElementById?.('m-quick-launch-row') || doc?.getElementById?.('m-quick-launch');
        core?.parentNode?.insertBefore(row, core);
      },

      update(el, ctx, graph) {
        mode = ctx?.mode || 'launch';
        row?.classList.toggle('hidden', mode !== 'launch');
        pairs = agents.length
          ? slotPairs(graph, agents, pins(api), SLOTS)
          : ['opus', 'sonnet', 'fable'].map((model) => ({ model, effort: '' }));
        buttons.forEach((btn, i) => {
          const p = pairs[i];
          btn.style.display = p ? '' : 'none';
          if (!p) return;
          const text = label(p, agents);
          // Model on top, effort under it, so three buttons fit on one row.
          const cut = text.lastIndexOf(' · ');
          const [name, effort] = cut < 0 ? [text, ''] : [text.slice(0, cut), text.slice(cut + 3)];
          btn.innerHTML = `${QUICK_LAUNCH_ICON}<span style="display:inline-flex;flex-direction:column;align-items:flex-start;line-height:1.15">`
            + `<span>${esc(name)}</span>${effort ? `<span style="font-size:0.8em;opacity:0.7">${esc(effort)}</span>` : ''}</span>`
            + ` <span class="kbd">⌘${i + 1}</span>`;
          btn.title = `Launch with ${text} (⌘${i + 1})`;
        });
      },

      unmount() { row?.remove?.(); row = null; buttons = []; },
    });

    reg.register('settings.panel', {
      id: 'quick-launch-slots',
      mount(el) { renderSlotEditor(el, safeAgents(api), pins(api)); },
      save(el) {
        const current = pins(api);
        return Promise.all(slotValues(el).map((v, i) =>
          v === (current[i] || '') ? null : api.settings.set(`slot${i + 1}`, v)));
      },
    });
  },
};

function safeAgents(api) {
  try { const a = api.agents?.(); return Array.isArray(a) ? a : []; } catch { return []; }
}

function pins(api) {
  try { const s = api.settings?.() || {}; return [s.slot1, s.slot2, s.slot3]; } catch { return []; }
}

// One row per slot: a model select ("By usage" = unpinned) and an effort select
// listing that model's agent's efforts.
export function renderSlotEditor(el, agents, current) {
  const models = agents.flatMap((a) => (a.models || []).map((m) => ({ ...m, agent: a })));
  const opt = (value, text, sel) => `<option value="${esc(value)}"${sel ? ' selected' : ''}>${esc(text)}</option>`;
  el.innerHTML = `<div class="quick-launch-slots" style="display:grid;grid-template-columns:auto 1fr 1fr;gap:8px;align-items:center">${
    [0, 1, 2].map((i) => {
      const pin = parsePin(current[i]);
      const known = pin && models.some((m) => m.value === pin.model);
      return `<label>Slot ${i + 1} (⌘${i + 1})</label>`
        + `<select class="ql-model" data-slot="${i}">${opt('', 'By usage', !pin)}${
          known ? '' : pin ? opt(pin.model, pin.model, true) : ''}${
          models.map((m) => opt(m.value, `${m.label}${agents.length > 1 ? ` (${m.agent.label || m.agent.id})` : ''}`, pin?.model === m.value)).join('')}</select>`
        + `<select class="ql-effort" data-slot="${i}" data-current="${esc(pin?.effort || '')}"></select>`;
    }).join('')
  }</div>`;
  const fillEfforts = (modelSel) => {
    const effortSel = el.querySelector(`.ql-effort[data-slot="${modelSel.dataset.slot}"]`);
    const m = models.find((x) => x.value === modelSel.value);
    const efforts = m?.agent.efforts || [];
    const want = effortSel.value || effortSel.dataset.current;
    effortSel.innerHTML = opt('', 'Default effort', true) + efforts.map((e) => opt(e.value, e.label, e.value === want)).join('');
    effortSel.disabled = !modelSel.value || !efforts.length;
  };
  el.querySelectorAll('.ql-model').forEach((s) => {
    fillEfforts(s);
    s.addEventListener('change', () => fillEfforts(s));
  });
}

// ['opus:high', '', 'sonnet'] from the editor's selects.
export function slotValues(el) {
  return [...el.querySelectorAll('.ql-model')].map((s) => {
    if (!s.value) return '';
    const e = el.querySelector(`.ql-effort[data-slot="${s.dataset.slot}"]`);
    return e && !e.disabled && e.value ? `${s.value}:${e.value}` : s.value;
  });
}
