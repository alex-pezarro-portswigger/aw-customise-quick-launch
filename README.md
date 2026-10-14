# aw-quick-launch

An [Agent Wrangler](https://github.com/alex-pezarro-portswigger/agent-wrangler) extension
that replaces the dispatch modal's ⌘1–⌘3 quick-launch buttons with your most-used
**model + effort** pairs, e.g. *Sonnet · High*, *Opus · Low*, *Opus · default*. Up to six slots, three per row.

- Pairs are counted across live sessions and history (graph `effort`, host API 1.28.0).
  Pairs the current agent list can't launch are dropped; Opus, Sonnet and Fable at default
  effort, then every other launchable pair, fill any empty slot.
- The buttons sit where core's did, beside Cancel/Launch. The field mounts at the `top`
  anchor and moves its row into the modal footer. Core's row is hidden with
  `hideDispatchField: ['quickLaunch']`, which also hands ⌘1–⌘3 to this extension.
- Add or remove slots (1–6, default 3) in Settings → Extensions; buttons wrap three to a row.
- Each slot can be pinned in the extension's settings (Settings → Extensions) with a model and an effort select, stored as
  `model` or `model:effort`, e.g. `opus:high`. Blank slots fill by usage, skipping pinned
  pairs; a pin the current agents can't launch is ignored.
- A click or shortcut calls `api.dispatch.submit({ model, effort })`, so core validation
  still applies. Hidden in schedule mode.

Requires Agent Wrangler host API **≥ 1.28.0**. No capabilities (`requires: []`).

## Shortcuts

| Keys | Action |
| --- | --- |
| ⌘1 / Ctrl+1 | Launch with slot 1 |
| ⌘2 / Ctrl+2 | Launch with slot 2 |
| ⌘3 / Ctrl+3 | Launch with slot 3 |
| ⌘4–⌘6 / Ctrl+4–6 | Launch with slots 4–6, when added |

They are listed under *Customise quick launch* in Settings → Shortcuts.

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
