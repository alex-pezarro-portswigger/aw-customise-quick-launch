import { fileURLToPath } from 'node:url';
import path from 'node:path';

// The loader resolves `client` inside this directory's public/ subdir, so the
// manifest has to say where it lives.
export const dir = path.dirname(fileURLToPath(import.meta.url));

export default {
  id: 'quick-launch',
  label: 'Customise quick launch',
  help: 'Customise the dispatch quick-launch buttons: up to six slots, each pinned to a model + effort or filled by your most-used pairs.',
  defaultEnabled: true,
  // 1.28.0: the `quickLaunch` dispatch field, api.dispatch.submit and `effort`
  // on graph session/history nodes. 1.33.0: `runtime` on api.dispatch.submit
  // and api.runtimes().
  engines: { wranglerApi: '^1.33.0' },
  // Hiding quickLaunch also turns off core's ⌘1–⌘3, so the bindings below own them.
  hideDispatchField: ['quickLaunch'],
  keybindings: [1, 2, 3, 4, 5, 6].map((n) => ({ combo: `mod+${n}`, scope: 'dispatch' })),
  // Each slot can be pinned to "model", "model:effort" or either with
  // "@runtime" (e.g. "gpt-5.4:high@bifrost"); blank slots fill by
  // usage. Hidden: the client's settings.panel edits them with model and effort
  // selects built from the live agent list, which a manifest select can't be.
  // `slots` is how many are shown (1–6, default 3), set by the same editor.
  settings: [
    { key: 'slots', label: 'Slots', type: 'number', hidden: true, min: 1, max: 6, step: 1 },
    ...[1, 2, 3, 4, 5, 6].map((n) => ({
      key: `slot${n}`,
      label: `Slot ${n}`,
      type: 'text',
      hidden: true,
      pattern: '[^:@\\s]+(:[^:@\\s]+)?(@[^:@\\s]+)?',
      maxLength: 100,
    })),
  ],
  client: 'public/client.js',
};
