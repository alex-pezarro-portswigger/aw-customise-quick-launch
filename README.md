# aw-quick-launch

An [Agent Wrangler](https://github.com/alex-pezarro-portswigger/agent-wrangler) extension
that replaces the dispatch modal's ⌘1–⌘3 quick-launch buttons with your three most-used
**model + effort** pairs, e.g. *Sonnet · High*, *Opus · Low*, *Opus · default*.

- Pairs are counted across live sessions and history (graph `effort`, host API 1.28.0).
  Pairs the current agent list can't launch are dropped; Opus, Sonnet and Fable at default
  effort fill any empty slot.
- The buttons sit under the prompt (the `top` dispatch-field anchor). Core's row is hidden
  with `hideDispatchField: ['quickLaunch']`, which also hands ⌘1–⌘3 to this extension.
- A click or shortcut calls `api.dispatch.submit({ model, effort })`, so core validation
  still applies. Hidden in schedule mode.

Requires Agent Wrangler host API **≥ 1.28.0**. No capabilities (`requires: []`).

## Shortcuts

| Keys | Action |
| --- | --- |
| ⌘1 / Ctrl+1 | Launch with slot 1 |
| ⌘2 / Ctrl+2 | Launch with slot 2 |
| ⌘3 / Ctrl+3 | Launch with slot 3 |

They are listed under *Quick launch by usage* in Settings → Shortcuts.

## Install

Extensions panel → install by git URL:

```
https://github.com/alex-pezarro-portswigger/aw-quick-launch
```

## Tests

```
npm test
```

`rank.test.js` covers the ranking and labels; `client.test.js` drives the contribution and
key bindings against a stub registrar and DOM.
