import { test } from 'node:test';
import assert from 'node:assert/strict';
import client from './public/client.js';

// Stub DOM: just enough for three buttons and a classList.
function stubEl() {
  const mk = () => ({ style: {}, innerHTML: '', title: '', handlers: {}, addEventListener(t, f) { this.handlers[t] = f; } });
  const btns = [mk(), mk(), mk(), mk(), mk(), mk()];
  const cls = new Set();
  const wrap = { classList: { toggle: (c, on) => (on ? cls.add(c) : cls.delete(c)), contains: (c) => cls.has(c) } };
  return { btns, wrap, innerHTML: '', querySelectorAll: () => btns, querySelector: () => wrap };
}

const AGENTS = [{ id: 'claude', models: [{ value: 'opus', label: 'Opus' }, { value: 'sonnet', label: 'Sonnet' }, { value: 'fable', label: 'Fable' }], efforts: [{ value: 'high', label: 'High' }] }];

function setup({ agents = AGENTS, submit, settings = {}, runtimes } = {}) {
  const binds = [];
  const submits = [];
  const sets = [];
  let field = null;
  let onAgents = null;
  const api = {
    agents: Object.assign(() => agents, { onChange: (f) => { onAgents = f; return () => {}; } }),
    keys: { bind: (b) => { binds.push(b); return () => {}; } },
    settings: Object.assign(() => settings, { set: async (k, v) => { sets.push([k, v]); } }),
    dispatch: { submit: submit || (async (p) => { submits.push(p); }) },
    ...(runtimes ? { runtimes: () => runtimes } : {}),
  };
  const regs = {};
  client.register({ api, register: (slot, c) => { regs[slot] = c; } });
  field = regs['dispatch.field'];
  const el = stubEl();
  field.mount(el);
  return { binds, submits, field, el, regs, api, sets, onAgents: (a) => onAgents(a) };
}

const graph = { sessions: [{ model: 'sonnet', effort: 'high' }], history: [] };

test('registers at the top anchor, hiding quickLaunch, and binds mod+1..6 in dispatch scope', () => {
  const { field, binds } = setup();
  assert.equal(field.at, 'top');
  assert.deepEqual(field.hides, ['quickLaunch']);
  assert.deepEqual(binds.map((b) => [b.combo, b.scope]), [1, 2, 3, 4, 5, 6].map((n) => [`mod+${n}`, 'dispatch']));
});

test('update labels the buttons by rank with ⌘ hints', () => {
  const { field, el } = setup();
  field.update(el, { mode: 'launch' }, graph);
  assert.match(el.btns[0].innerHTML, /<span[^>]*>Sonnet<\/span><span[^>]*>High<\/span><\/span> <span class="kbd"[^>]*>⌘1<\/span>/);
  assert.equal(el.btns[0].title, 'Launch with Sonnet · High (⌘1)');
  assert.match(el.btns[1].innerHTML, /<span[^>]*>Opus<\/span><span[^>]*>default/);
});

test('the row and its buttons can shrink to fit the footer, three per row', () => {
  const { el } = setup();
  assert.match(el.innerHTML, /grid-template-columns:repeat\(3,minmax\(0,max-content\)\)/);
  assert.match(el.innerHTML, /class="quick-launch" style="[^"]*min-width:0/);
  assert.match(el.innerHTML, /class="ghost quick-launch-btn" style="[^"]*min-width:0/);
});

test('long label lines ellipsize and the ⌘ badge never shrinks', () => {
  const { field, el } = setup({ settings: { slot1: 'gpt-5.4:high@bifrost' }, runtimes: [{ id: 'bifrost', label: 'Bifrost (OpenAI)', ownsModel: true, efforts: [{ value: 'high', label: 'High' }] }] });
  field.update(el, { mode: 'launch' }, graph);
  assert.match(el.btns[0].innerHTML, /<span style="[^"]*text-overflow:ellipsis[^"]*">High · Bifrost<\/span>/);
  assert.match(el.btns[0].innerHTML, /<span class="kbd" style="flex:0 0 auto">⌘1<\/span>/);
});

test('click and key both submit the slot pair; default effort is undefined', async () => {
  const { field, el, binds, submits } = setup();
  field.update(el, { mode: 'launch' }, graph);
  el.btns[0].handlers.click();
  binds[1].run();
  await new Promise((r) => setImmediate(r));
  assert.deepEqual(submits, [{ model: 'sonnet', effort: 'high', runtime: 'local' }, { model: 'opus', effort: undefined, runtime: 'local' }]);
});

test('schedule mode hides the row and keys do nothing', async () => {
  const { field, el, binds, submits } = setup();
  field.update(el, { mode: 'schedule' }, graph);
  assert.equal(el.wrap.classList.contains('hidden'), true);
  binds[0].run();
  await new Promise((r) => setImmediate(r));
  assert.deepEqual(submits, []);
});

test('before agents arrive the backfill renders; an agents change re-ranks on next update', () => {
  const { field, el, onAgents } = setup({ agents: [] });
  field.update(el, { mode: 'launch' }, graph);
  assert.match(el.btns[0].innerHTML, /opus/);
  onAgents(AGENTS);
  field.update(el, { mode: 'launch' }, graph);
  assert.match(el.btns[0].innerHTML, /<span[^>]*>Sonnet<\/span><span[^>]*>High/);
});

test('a rejected submit is caught and logged', async () => {
  const { field, el, binds } = setup({ submit: async () => { throw new Error('dispatch blocked by validation'); } });
  field.update(el, { mode: 'launch' }, graph);
  const orig = console.warn; const seen = [];
  console.warn = (...a) => seen.push(a.join(' '));
  try { binds[0].run(); await new Promise((r) => setImmediate(r)); } finally { console.warn = orig; }
  assert.match(seen[0], /dispatch blocked by validation/);
});

test('a pinned slot from settings overrides the ranking', () => {
  const { field, el } = setup({ settings: { slot1: 'fable:high' } });
  field.update(el, { mode: 'launch' }, graph);
  assert.match(el.btns[0].innerHTML, /<span[^>]*>Fable<\/span><span[^>]*>High/);
  assert.match(el.btns[1].innerHTML, /<span[^>]*>Sonnet<\/span><span[^>]*>High/);
});

test('the slots setting sets how many buttons show; default is three', () => {
  const three = setup();
  three.field.update(three.el, { mode: 'launch' }, graph);
  assert.deepEqual(three.el.btns.map((b) => b.style.display), ['', '', '', 'none', 'none', 'none']);
  const six = setup({ settings: { slots: 6 } });
  six.field.update(six.el, { mode: 'launch' }, graph);
  assert.deepEqual(six.el.btns.map((b) => b.style.display), ['', '', '', '', '', '']);
  assert.match(six.el.btns[5].innerHTML, /⌘6/);
});

test('slots is clamped to 1-6', () => {
  const lo = setup({ settings: { slots: 0 } });
  lo.field.update(lo.el, { mode: 'launch' }, graph);
  assert.equal(lo.el.btns.filter((b) => b.style.display === '').length, 3);
  const hi = setup({ settings: { slots: 99 } });
  hi.field.update(hi.el, { mode: 'launch' }, graph);
  assert.equal(hi.el.btns.filter((b) => b.style.display === '').length, 6);
});

test('keys beyond the slot count do nothing', async () => {
  const { field, el, binds, submits } = setup();
  field.update(el, { mode: 'launch' }, graph);
  binds[5].run();
  await new Promise((r) => setImmediate(r));
  assert.deepEqual(submits, []);
});

const RUNTIMES = [{ id: 'local', label: 'Local', ownsModel: false }, { id: 'bifrost', label: 'Bifrost (OpenAI)', ownsModel: true }];

test('a slot pinned to a model-owning runtime shows its model, effort and runtime, and launches on it', async () => {
  const { field, el, binds, submits } = setup({ settings: { slot1: 'gpt-5.4:high@bifrost' }, runtimes: RUNTIMES });
  field.update(el, { mode: 'launch' }, graph);
  assert.match(el.btns[0].innerHTML, /<span[^>]*>gpt-5\.4<\/span><span[^>]*>High · Bifrost<\/span>/);
  assert.equal(el.btns[0].title, 'Launch with gpt-5.4 · High · Bifrost (⌘1)');
  binds[0].run();
  await new Promise((r) => setImmediate(r));
  assert.deepEqual(submits, [{ model: 'gpt-5.4', effort: 'high', runtime: 'bifrost' }]);
});

test('a runtime pin is ignored when that runtime is not offered', () => {
  const { field, el } = setup({ settings: { slot1: 'gpt-5.4@bifrost' } });
  field.update(el, { mode: 'launch' }, graph);
  assert.match(el.btns[0].innerHTML, /<span[^>]*>Sonnet<\/span>/);
});
