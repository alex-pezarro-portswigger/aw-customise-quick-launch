import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rankPairs, label, parsePin, slotPairs } from './public/rank.js';

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

test('backfill skips duplicates and models not offered', () => {
  const graph = { sessions: [s('opus', null)], history: [] };
  const agents = [{ id: 'claude', models: [{ value: 'opus', label: 'Opus' }, { value: 'fable', label: 'Fable' }, { value: 'haiku', label: 'Haiku' }], efforts: [] }];
  assert.deepEqual(rankPairs(graph, agents), [{ model: 'opus', effort: '' }, { model: 'fable', effort: '' }]);
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
