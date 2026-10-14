import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rankPairs, label, parsePin, formatPin, slotPairs } from './public/rank.js';

const AGENTS = [
  {
    id: 'claude',
    models: [
      { value: 'opus', label: 'Opus · 1M' },
      { value: 'sonnet', label: 'Sonnet' },
      { value: 'fable', label: 'Fable' },
      { value: 'haiku', label: 'Haiku' },
    ],
    efforts: [{ value: 'low', label: 'Low' }, { value: 'high', label: 'High' }],
  },
  { id: 'codex', models: [{ value: 'gpt', label: 'GPT' }], efforts: [] },
];
const s = (model, effort) => ({ model, effort });

test('counts sessions plus history; blank and null effort count as default', () => {
  const graph = { sessions: [s('haiku', ''), s('haiku', null)], history: [s('haiku', undefined), s('gpt', null)] };
  assert.deepEqual(rankPairs(graph, AGENTS, 1), [{ model: 'haiku', effort: '' }]);
});

test('top 3 by frequency, ties in first-seen order', () => {
  const graph = {
    sessions: [s('haiku', 'low'), s('sonnet', 'high'), s('sonnet', 'high')],
    history: [s('opus', 'low'), s('gpt', null), s('opus', 'low'), s('sonnet', 'high')],
  };
  assert.deepEqual(rankPairs(graph, AGENTS), [
    { model: 'sonnet', effort: 'high' },
    { model: 'opus', effort: 'low' },
    { model: 'haiku', effort: 'low' },
  ]);
});

test('drops models no longer offered and efforts the agent does not offer; skips modelless nodes', () => {
  const graph = { sessions: [s('retired', ''), s('retired', ''), s('opus', 'max'), s('opus', 'max'), { effort: 'high' }], history: [s('haiku', 'high')] };
  assert.deepEqual(rankPairs(graph, AGENTS), [
    { model: 'haiku', effort: 'high' },
    { model: 'opus', effort: '' },
    { model: 'sonnet', effort: '' },
  ]);
});

test('backfill skips duplicates and models not offered, then offers the rest', () => {
  const graph = { sessions: [s('opus', null)], history: [] };
  const agents = [{ id: 'claude', models: [{ value: 'opus', label: 'Opus' }, { value: 'fable', label: 'Fable' }, { value: 'haiku', label: 'Haiku' }], efforts: [] }];
  assert.deepEqual(rankPairs(graph, agents), [{ model: 'opus', effort: '' }, { model: 'fable', effort: '' }, { model: 'haiku', effort: '' }]);
});

test('empty graph gives the three backfill pairs', () => {
  assert.deepEqual(rankPairs({}, AGENTS), [
    { model: 'opus', effort: '' }, { model: 'sonnet', effort: '' }, { model: 'fable', effort: '' },
  ]);
});

test('fewer offered models gives a shorter list', () => {
  const agents = [{ id: 'claude', models: [{ value: 'sonnet', label: 'Sonnet' }], efforts: [] }];
  assert.deepEqual(rankPairs({ sessions: [], history: [] }, agents), [{ model: 'sonnet', effort: '' }]);
});

test('label: short model name plus effort label, "default" when blank, name alone without efforts', () => {
  assert.equal(label({ model: 'opus', effort: 'high' }, AGENTS), 'Opus · High');
  assert.equal(label({ model: 'opus', effort: '' }, AGENTS), 'Opus · default');
  assert.equal(label({ model: 'gpt', effort: '' }, AGENTS), 'GPT');
  assert.equal(label({ model: 'unknown', effort: '' }, AGENTS), 'unknown');
});

test('parsePin reads model and model:effort; blank or malformed is null', () => {
  assert.deepEqual(parsePin('opus:high'), s('opus', 'high'));
  assert.deepEqual(parsePin(' sonnet '), s('sonnet', ''));
  assert.equal(parsePin(''), null);
  assert.equal(parsePin(undefined), null);
  assert.equal(parsePin('a:b:c'), null);
});

test('slotPairs keeps pins in place and fills the rest by rank without repeats', () => {
  const graph = { sessions: [s('sonnet', 'high'), s('sonnet', 'high'), s('opus', 'low')], history: [] };
  assert.deepEqual(slotPairs(graph, AGENTS, ['', 'sonnet:high', 'haiku']), [s('opus', 'low'), s('sonnet', 'high'), s('haiku', '')]);
});

test('slotPairs ignores a pin the agents cannot launch', () => {
  const graph = { sessions: [s('sonnet', 'high')], history: [] };
  assert.deepEqual(slotPairs(graph, AGENTS, ['nope:high', 'opus:max']), [s('sonnet', 'high'), s('opus', ''), s('sonnet', '')]);
});

test('rankPairs backfills past three with every launchable pair', () => {
  const agents = [{ id: 'claude', models: [{ value: 'opus', label: 'Opus' }, { value: 'sonnet', label: 'Sonnet' }, { value: 'fable', label: 'Fable' }], efforts: [{ value: 'low', label: 'Low' }, { value: 'high', label: 'High' }] }];
  const out = rankPairs({}, agents, 6);
  assert.equal(out.length, 6);
  assert.deepEqual(out.slice(0, 3).map((p) => p.model), ['opus', 'sonnet', 'fable']);
  assert.equal(new Set(out.map((p) => `${p.model}:${p.effort}`)).size, 6);
});

const RUNTIMES = [
  { id: 'local', label: 'Local', ownsModel: false },
  { id: 'devcontainer', label: 'Dev container', ownsModel: false },
  { id: 'bifrost', label: 'Bifrost (OpenAI)', ownsModel: true },
];

test('parsePin and formatPin round-trip an @runtime; @local is Local', () => {
  assert.deepEqual(parsePin('gpt-5.4:high@bifrost'), { model: 'gpt-5.4', effort: 'high', runtime: 'bifrost' });
  assert.deepEqual(parsePin('gpt-5.4@bifrost'), { model: 'gpt-5.4', effort: '', runtime: 'bifrost' });
  assert.deepEqual(parsePin('opus:high@local'), s('opus', 'high'));
  assert.equal(parsePin('a@b@c'), null);
  for (const t of ['gpt-5.4:high@bifrost', 'gpt-5.4@bifrost', 'opus:low', 'opus']) assert.equal(formatPin(parsePin(t)), t);
});

test('a model-owning runtime takes any model id with Claude efforts; others need an offered Claude model', () => {
  const pins = ['gpt-5.4:high@bifrost', 'gpt-5.4:max@bifrost', 'sonnet:high@devcontainer', 'gpt@devcontainer', 'opus@gone'];
  assert.deepEqual(slotPairs({}, AGENTS, pins, 5, RUNTIMES), [
    { model: 'gpt-5.4', effort: 'high', runtime: 'bifrost' },
    s('opus', ''),
    { model: 'sonnet', effort: 'high', runtime: 'devcontainer' },
    s('sonnet', ''),
    s('fable', ''),
  ]);
});

test('ranking keeps a session\'s runtime, and skips sessions on a model-owning runtime', () => {
  const graph = { sessions: [
    { model: 'opus', effort: 'high', runtime: 'bifrost' }, { model: 'opus', effort: 'high', runtime: 'bifrost' },
    { model: 'sonnet', effort: null, runtime: 'devcontainer' },
  ], history: [{ model: 'opus', effort: 'low', runtime: null }] };
  assert.deepEqual(rankPairs(graph, AGENTS, 2, RUNTIMES), [{ model: 'sonnet', effort: '', runtime: 'devcontainer' }, s('opus', 'low')]);
});

test('label adds the runtime without its parenthetical', () => {
  assert.equal(label({ model: 'gpt-5.4', effort: 'high', runtime: 'bifrost' }, AGENTS, RUNTIMES), 'gpt-5.4 · High · Bifrost');
  assert.equal(label({ model: 'gpt-5.4', effort: '', runtime: 'bifrost' }, AGENTS, RUNTIMES), 'gpt-5.4 · default · Bifrost');
  assert.equal(label({ model: 'opus', effort: 'low', runtime: 'devcontainer' }, AGENTS, RUNTIMES), 'Opus · Low · Dev container');
});
