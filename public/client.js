// Browser half. One `dispatch.field` that stands in for core's ⌘1–⌘3 row
// (vetoed via hides: ['quickLaunch']). There's no anchor in the footer, so the
// field mounts at `top` and moves its row next to core's, beside Cancel/Launch.
import { slotPairs, label, parsePin, formatPin, runtimeLabel } from './rank.js';

// Copied from core's app.js — it isn't exported.
export const QUICK_LAUNCH_ICON = '<svg class="icon" aria-hidden="true" viewBox="0 0 24 24" fill="currentColor"><path d="M7 4.5v15a1 1 0 0 0 1.5.86l12-7.5a1 1 0 0 0 0-1.72l-12-7.5A1 1 0 0 0 7 4.5z"/></svg>';

export const MAX_SLOTS = 6;
export const DEFAULT_SLOTS = 3;
const PER_ROW = 3;

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
        // Always name the runtime: the dialog restores the last launch's, so a
        // Local slot must not inherit a Bifrost one.
        .then(() => api.dispatch.submit({ model: p.model, effort: p.effort || undefined, runtime: p.runtime || 'local' }))
        .catch((err) => console.warn('[quick-launch] launch failed:', err?.message || err));
    }

    api.agents?.onChange?.((list) => { agents = Array.isArray(list) ? list : []; });

    for (let n = 1; n <= MAX_SLOTS; n++) {
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
        // minmax(0,…) + min-width:0 let the row shrink to the footer's free space
        // (beside Cancel/Launch) instead of overflowing it; long labels ellipsize.
        el.innerHTML = `<div class="quick-launch" style="display:grid;grid-template-columns:repeat(${PER_ROW},minmax(0,max-content));gap:6px;min-width:0">${'<button type="button" class="ghost quick-launch-btn" style="white-space:nowrap;min-width:0"></button>'.repeat(MAX_SLOTS)}</div>`;
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
        const count = slotCount(api);
        const runtimes = safeRuntimes(api);
        pairs = agents.length
          ? slotPairs(graph, agents, pins(api), count, runtimes)
          : ['opus', 'sonnet', 'fable'].slice(0, count).map((model) => ({ model, effort: '' }));
        buttons.forEach((btn, i) => {
          const p = pairs[i];
          btn.style.display = p ? '' : 'none';
          if (!p) return;
          const text = label(p, agents, runtimes);
          // Model on top, effort (and runtime) under it, so three buttons fit on one row.
          const cut = text.indexOf(' · ');
          const [name, effort] = cut < 0 ? [text, ''] : [text.slice(0, cut), text.slice(cut + 3)];
          const line = 'max-width:100%;overflow:hidden;text-overflow:ellipsis';
          btn.innerHTML = `${QUICK_LAUNCH_ICON}<span style="display:inline-flex;flex-direction:column;align-items:flex-start;line-height:1.15;min-width:0;overflow:hidden">`
            + `<span style="${line}">${esc(name)}</span>${effort ? `<span style="${line};font-size:0.8em;opacity:0.7">${esc(effort)}</span>` : ''}</span>`
            + ` <span class="kbd" style="flex:0 0 auto">⌘${i + 1}</span>`;
          btn.title = `Launch with ${text} (⌘${i + 1})`;
        });
      },

      unmount() { row?.remove?.(); row = null; buttons = []; },
    });

    reg.register('settings.panel', {
      id: 'quick-launch-slots',
      mount(el) { renderSlotEditor(el, safeAgents(api), pins(api).slice(0, slotCount(api)), safeRuntimes(api)); },
      save(el) {
        const current = pins(api);
        const values = slotValues(el);
        const writes = [];
        if (values.length !== slotCount(api)) writes.push(api.settings.set('slots', values.length));
        for (let i = 0; i < MAX_SLOTS; i++) {
          const v = values[i] || '';
          if (v !== (current[i] || '')) writes.push(api.settings.set(`slot${i + 1}`, v));
        }
        return Promise.all(writes);
      },
    });
  },
};

function safeAgents(api) {
  try { const a = api.agents?.(); return Array.isArray(a) ? a : []; } catch { return []; }
}

// api.runtimes() is 1.33.0; [] (Local only) before it.
function safeRuntimes(api) {
  try { const r = api.runtimes?.(); return Array.isArray(r) ? r : []; } catch { return []; }
}

function pins(api) {
  try { const s = api.settings?.() || {}; return Array.from({ length: MAX_SLOTS }, (_, i) => s[`slot${i + 1}`]); } catch { return []; }
}

// How many buttons to show: the `slots` setting, clamped to 1–MAX_SLOTS.
function slotCount(api) {
  try {
    const n = Math.trunc(Number(api.settings?.()?.slots));
    return n >= 1 ? Math.min(n, MAX_SLOTS) : DEFAULT_SLOTS;
  } catch { return DEFAULT_SLOTS; }
}

// One row per slot: a runtime select (only when there is more than Local), a
// model select ("By usage" = unpinned) or, for a runtime that owns its models,
// a model id input, an effort select listing that model's agent's efforts
// (Claude's for such a runtime), and a remove button. "Add slot" appends a row
// up to MAX_SLOTS; removing one shifts the later pins up.
export function renderSlotEditor(el, agents, current, runtimes = []) {
  const models = agents.flatMap((a) => (a.models || []).map((m) => ({ ...m, agent: a })));
  const claudeEfforts = agents.find((a) => a.id === 'claude')?.efforts || [];
  const others = runtimes.filter((r) => r.id && r.id !== 'local');
  const showRuntime = others.length > 0;
  const owns = (id) => Boolean(id && others.find((r) => r.id === id)?.ownsModel);
  const opt = (value, text, sel) => `<option value="${esc(value)}"${sel ? ' selected' : ''}>${esc(text)}</option>`;
  // Rows as { model, effort, runtime }; a blank model is "By usage".
  let rows = Array.from({ length: Math.max(1, current.length) }, (_, i) => parsePin(current[i]) || { model: '', effort: '' });

  const draw = () => {
    el.innerHTML = `<div class="quick-launch-slots" style="display:grid;grid-template-columns:auto${showRuntime ? ' auto' : ''} 1fr 1fr auto;gap:8px;align-items:center">${
      rows.map((pin, i) => {
        const rt = pin.runtime || '';
        const known = models.some((m) => m.value === pin.model);
        const runtimeSel = !showRuntime ? '' : `<select class="ql-runtime" data-slot="${i}" aria-label="Slot ${i + 1} runtime">${opt('', 'Local', !rt)}${
          others.some((r) => r.id === rt) || !rt ? '' : opt(rt, rt, true)}${
          others.map((r) => opt(r.id, r.label || r.id, r.id === rt)).join('')}</select>`;
        const modelCtl = owns(rt)
          ? `<input class="ql-model" data-slot="${i}" type="text" placeholder="${esc(runtimeLabel(rt, runtimes))} model, e.g. gpt-5.4" value="${esc(pin.model)}" aria-label="Slot ${i + 1} model">`
          : `<select class="ql-model" data-slot="${i}">${opt('', 'By usage', !pin.model)}${
            known || !pin.model ? '' : opt(pin.model, pin.model, true)}${
            models.map((m) => opt(m.value, `${m.label}${agents.length > 1 ? ` (${m.agent.label || m.agent.id})` : ''}`, pin.model === m.value)).join('')}</select>`;
        return `<label>Slot ${i + 1} (⌘${i + 1})</label>${runtimeSel}${modelCtl}`
          + `<select class="ql-effort" data-slot="${i}" data-current="${esc(pin.effort || '')}"></select>`
          + `<button type="button" class="ghost ql-remove" data-slot="${i}" title="Remove slot ${i + 1}"${rows.length <= 1 ? ' disabled' : ''}>Remove</button>`;
      }).join('')
    }</div><div style="margin-top:8px"><button type="button" class="ghost ql-add"${rows.length >= MAX_SLOTS ? ' disabled' : ''}>Add slot (${rows.length}/${MAX_SLOTS})</button></div>`;
    const fillEfforts = (modelCtl) => {
      const slot = modelCtl.dataset.slot;
      const effortSel = el.querySelector(`.ql-effort[data-slot="${slot}"]`);
      const rt = el.querySelector(`.ql-runtime[data-slot="${slot}"]`)?.value || '';
      const efforts = owns(rt) ? claudeEfforts : models.find((x) => x.value === modelCtl.value)?.agent.efforts || [];
      const want = effortSel.value || effortSel.dataset.current;
      effortSel.innerHTML = opt('', 'Default effort', true) + efforts.map((e) => opt(e.value, e.label, e.value === want)).join('');
      effortSel.disabled = !modelCtl.value.trim() || !efforts.length;
    };
    el.querySelectorAll('.ql-model').forEach((s) => {
      fillEfforts(s);
      s.addEventListener(s.tagName === 'INPUT' ? 'input' : 'change', () => fillEfforts(s));
    });
    // A runtime change swaps the model control, so redraw; the model only
    // carries over between runtimes that share a vocabulary.
    el.querySelectorAll('.ql-runtime').forEach((s) => s.addEventListener('change', () => {
      rows = readRows(el);
      const i = Number(s.dataset.slot);
      const prev = rows[i];
      const was = el.querySelector(`.ql-model[data-slot="${i}"]`)?.tagName === 'INPUT';
      rows[i] = { model: was === owns(s.value) ? prev.model : '', effort: prev.effort, ...(s.value ? { runtime: s.value } : {}) };
      draw();
    }));
    el.querySelectorAll('.ql-remove').forEach((b) => b.addEventListener('click', () => {
      rows = readRows(el);
      rows.splice(Number(b.dataset.slot), 1);
      draw();
    }));
    el.querySelector('.ql-add')?.addEventListener('click', () => {
      if (rows.length >= MAX_SLOTS) return;
      rows = [...readRows(el), { model: '', effort: '' }];
      draw();
    });
  };
  draw();
}

// The editor's rows as { model, effort, runtime? } (blank model = By usage).
function readRows(el) {
  return [...el.querySelectorAll('.ql-model')].map((s) => {
    const slot = s.dataset.slot;
    const e = el.querySelector(`.ql-effort[data-slot="${slot}"]`);
    const runtime = el.querySelector(`.ql-runtime[data-slot="${slot}"]`)?.value || '';
    return { model: s.value.trim(), effort: e && !e.disabled ? e.value : '', ...(runtime ? { runtime } : {}) };
  });
}

// ['opus:high', '', 'sonnet', 'gpt-5.4:high@bifrost'] from the editor's controls.
// A pinned runtime with no model is blank (By usage): the model is what it launches.
export function slotValues(el) {
  return readRows(el).map((r) => (r.model ? formatPin(r) : ''));
}
