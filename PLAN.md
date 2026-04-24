# M2L-X Companion Module — Development Plan

## Context

This module is a Companion port of Sony's official Stream Deck plugin
(`streamdeckplugin_m2lx-v1.1_1.1/com.sony.m2lx-v1.streamDeckPlugin`, extracted
at [\_extracted/com.sony.m2lx-v1.sdPlugin/](streamdeckplugin_m2lx-v1.1_1.1/_extracted/com.sony.m2lx-v1.sdPlugin/)).
It talks to an M2L-X switcher over two WebSockets:

- **Control**: `wss://{host}/api/v1/switcher_controller` — CSP (Cloud Switcher Protocol) commands
- **Status**: `wss://{host}/api/v1/switcher_status?nodes=mixer,router` — state stream

Alongside the WS protocol, the switcher also exposes a large REST API
(85 paths) documented in [openapi.json](openapi.json). The current module does
not use REST at all.

The current port covers roughly the XPT + DSK subset of the SD plugin and
adds a clip player, but is missing Auto/Take, snapshot recall, flip-flop
control, upstream keyers, and all reconnect/refresh machinery. It also
ships with template-boilerplate README/HELP and no presets.

## Goals

1. Achieve feature parity with the Stream Deck plugin.
2. Fix the defects introduced during the port.
3. Harden the connection (reconnect, token refresh, status updates).
4. Expand beyond the SD plugin using the REST API surface.
5. Ship presets and real docs so the module is usable out of the box.

## Non-goals

- Tally hardware integration (device create/update/delete) beyond simple
  colour toggles — this is a configuration-time task, not a live-operation
  one.
- License/product-update endpoints — system-admin only, not operator-facing.
- User management endpoints.
- Migration from V1 to a hypothetical V2 CSP protocol — stay on V1.

---

## Phase 0 — Defects (pre-requisite for everything else)

Small, isolated fixes. Do first so we don't build on top of broken behaviour.

### 0.1 Decode WebSocket messages correctly

[src/m2lx.ts:247](src/m2lx.ts#L247) and [src/m2lx.ts:301](src/m2lx.ts#L301)
currently do `JSON.parse(JSON.stringify(data))` on a `ws` `Buffer`, which
yields `{type:"Buffer",data:[…]}` — not the payload. The SD plugin does
`JSON.parse(event.data)` because browser `MessageEvent.data` is already a
string. Replace with `JSON.parse(data.toString('utf8'))` (or attach the
`ws` socket with `{ binary: false }` and assert the data is a string).
Impact: the control-channel error handler ([src/m2lx.ts:248-261](src/m2lx.ts#L248-L261)) is
currently dead code, and status parsing may only be working because of
coincidental buffer coercion.

### 0.2 Fix `clip_load` option lookup

[src/actions.ts:642](src/actions.ts#L642) reads `event.options.num` on an
action that only declares a `clip` option. Every load currently targets
`node: "vtrundefined"`. Add a `num` option (Clip Player 1-4, consistent
with the other `clip_*` actions) and use it.

### 0.3 Remove the global TLS-verify escape hatch

[src/m2lx.ts:200](src/m2lx.ts#L200) sets
`process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'`, which disables TLS
verification for the entire Companion process — not just this module.
Replace with per-request options:

- For `fetch`: pass `{ dispatcher: new Agent({ connect: { rejectUnauthorized: false } }) }`
  via `undici` (already transitively available), or use a `custom` https
  Agent on a node-fetch polyfill.
- For `ws`: `new WebSocket(url, protocols, { rejectUnauthorized: false })`.

Make this behaviour opt-in via a config checkbox (see 1.2).

### 0.4 Dead `feedback-scene` listener

[src/m2lx.ts:489](src/m2lx.ts#L489) emits `feedback-scene` but nothing in
[src/main.ts](src/main.ts) subscribes. Either remove the emit or wire it
to `self.checkFeedbacks('snapshot_active')` once Phase 2.3 lands.

### 0.5 Typos and cosmetics

- [src/actions.ts:80](src/actions.ts#L80) — `Tansition` → `Transition`.
- The duration dropdown's `map` lookup ([src/actions.ts:95](src/actions.ts#L95))
  is pointless indirection — put the string values directly on the
  dropdown's `id`.

**Deliverable:** one PR titled `fix: port defects from Stream Deck plugin`.

---

## Phase 1 — Connectivity & reliability

### 1.1 Auto-reconnect loop

The SD plugin reconnects every 5 s if any socket is closed or erroring
([app.js:662-669](streamdeckplugin_m2lx-v1.1_1.1/_extracted/com.sony.m2lx-v1.sdPlugin/js/app.js#L662-L669)).
Companion has no retry — after a drop the module is silent until the user
manually toggles the instance.

Design:

- Add a `private reconnectTimer: NodeJS.Timeout | undefined` to `M2LX`.
- On `close` or `error` from either socket, clear + schedule `start()`
  in 5 s.
- Cancel the timer in `destroy()`.
- Clear the timer when both sockets are open.

### 1.2 Token refresh

The SD plugin authenticates with HTTP Basic (`basic_token=`) which never
expires. The Companion module uses `/api/local_auth/signin` which issues
an **access token** and a **refresh token**
([src/m2lx.ts:186-202](src/m2lx.ts#L186-L202)), but discards the refresh
token. Once the access token expires the socket silently dies.

Design:

- Store `access_token`, `refresh_token`, and `expires_in` on the `M2LX`
  instance.
- Schedule a refresh at `(expires_in - 60) s` via
  `POST /api/local_auth/refresh_token` (see
  [openapi.json](openapi.json) — `LocalAuthRefreshToken`).
- On 401 from signin, surface a clear error via `updateStatus`.

### 1.3 Module status wiring

[src/main.ts:33](src/main.ts#L33) calls `updateStatus(InstanceStatus.Ok)`
exactly once. It must transition:

- `Connecting` — initial and during reconnect attempts.
- `Ok` — both sockets open, no recent errors.
- `ConnectionFailure` — sockets closed and reconnect is retrying.
- `AuthenticationFailure` — signin 401.
- `UnknownWarning` — one of the two sockets is open, the other isn't.

Pass an `updateStatus` callback into the `M2LX` constructor alongside
the existing `log` callback, and have the socket handlers drive it.

### 1.4 TLS config field

Add a checkbox `allowSelfSigned` (default `true`, since M2L-X ships with
self-signed certs) to [src/config.ts](src/config.ts). When unchecked,
the module uses standard TLS verification; when checked, it uses the
per-socket `rejectUnauthorized: false` from 0.3.

### 1.5 Health-check WS (optional)

The SD plugin opens a third short-lived WS every 5 s as a liveness probe
([app.js:614-659](streamdeckplugin_m2lx-v1.1_1.1/_extracted/com.sony.m2lx-v1.sdPlugin/js/app.js#L614-L659)).
Node's `ws` library exposes `ping()` / `pong` events on the main socket,
which gives us the same information without a third connection. Wire a
30 s ping to the status socket, mark `ConnectionFailure` on two
consecutive missed pongs.

**Deliverable:** `feat: add reconnect, token refresh, and status wiring`.

---

## Phase 2 — Stream Deck parity

All of these are CSP commands already used elsewhere in the codebase,
just not exposed as user-facing actions/feedbacks.

### 2.1 Take / Auto action

SD-plugin reference: [app.js:443-453](streamdeckplugin_m2lx-v1.1_1.1/_extracted/com.sony.m2lx-v1.sdPlugin/js/app.js#L443-L453).

New action `auto`:

```ts
{ name: 'Take / Auto',
  options: [
    { id: 'flip_flop', type: 'checkbox', label: 'Flip-Flop', default: true },
  ],
  callback: async (event) => {
    if (self.m2lx.trans_running) return            // re-entry guard
    self.m2lx.sendCSP({ command: 'configure_effect', node: 'mixer',
                       args: { toggle_mode: event.options.flip_flop } })
    self.m2lx.sendCSP({ command: 'transition', node: 'mixer',
                       args: { effect_enabled: true } })
  } }
```

### 2.2 Flip-flop toggle as a reusable concept

The SD plugin's Cut and Auto buttons both carry a `trans_toggle` setting.
Add `flip_flop` as an option on **both** `cut` and `auto` actions, and
always emit `configure_effect { toggle_mode }` before the `transition`.
Default to `true` (the SD plugin's default).

### 2.3 Snapshot recall action + feedback

SD-plugin reference: [app.js:539-557](streamdeckplugin_m2lx-v1.1_1.1/_extracted/com.sony.m2lx-v1.sdPlugin/js/app.js#L539-L557).

New action `snapshot_recall`:

- Option `name` — textinput with `useVariables`, or a dropdown populated
  from `switcherStatus.snapshots`. The SD plugin uses dynamic binding
  (scene row N = snapshot index N); Companion has no 2D context, so
  recall by name is the right idiom.
- Option `target` — dropdown `program | preview`.
- Sends `{ command: 'load_snapshot', node: 'mixer', args: { name, target } }`.

New feedback `snapshot_active` (if CSP surfaces this; otherwise skip —
the SD plugin doesn't have it either).

Wire the dead `feedback-scene` emit from 0.4 to trigger Companion
variable updates for the snapshot list.

### 2.4 Upstream keyer parity

All three keyer actions (`key`, `key_toggle`, `key_source`) and both
keyer feedbacks (`key_pgm`, `key_pvw`) are hardcoded to
`key_type: 'downstream'`. Extend each with a `key_type` dropdown
(`downstream | upstream`) and a matching numeric `num` range
(1-2 for DSK, 1-8 for upstream — Layer 1-4 + KEY 1-4, matching
[propertyinspector/index.html:151-162](streamdeckplugin_m2lx-v1.1_1.1/_extracted/com.sony.m2lx-v1.sdPlugin/propertyinspector/index.html#L151-L162)).

Feedback callbacks read
`self.m2lx.switcherStatus.keyStatus[`${target}_${keyType}\_${num-1}`]` —
the data is already tracked ([src/m2lx.ts:408-447](src/m2lx.ts#L408-L447)).

Note: DSKs are typically mirrored to both PGM and PVW
([src/actions.ts:126-145](src/actions.ts#L126-L145)); upstream keyers
usually are not. Only send to both targets when `key_type === 'downstream'`.

### 2.5 Transition-running guard

Every `cut` / `auto` / `wipe` action should short-circuit if
`self.m2lx.trans_running === true`
([src/m2lx.ts:467](src/m2lx.ts#L467) already tracks this). Matches
[app.js:421-422](streamdeckplugin_m2lx-v1.1_1.1/_extracted/com.sony.m2lx-v1.sdPlugin/js/app.js#L421-L422).

**Deliverable:** `feat: port missing Stream Deck actions (Auto, snapshot, USK, flip-flop)`.

---

## Phase 3 — Variables, feedbacks, presets

### 3.1 Real variables

Delete the `variable1/2/3` stubs in [src/variables.ts](src/variables.ts)
and replace with:

| variableId                             | source                                   |
| -------------------------------------- | ---------------------------------------- |
| `pgm_source`                           | `Object.keys(switcherStatus.program)[0]` |
| `pvw_source`                           | `Object.keys(switcherStatus.preview)[0]` |
| `transition_running`                   | `trans_running`                          |
| `connection_state`                     | derived from socket state                |
| `snapshot_count`                       | `switcherStatus.snapshots.length`        |
| `snapshot_N_name` / `snapshot_N_title` | indexed (up to some cap, e.g. 32)        |
| `key_<type>_<n>_<bus>`                 | `switcherStatus.keyStatus[…]`            |

Call `self.setVariableValues(...)` from the `feedback-input`,
`feedback-key`, `feedback-scene`, and connection-state emitters.

### 3.2 New feedbacks

- `transition_running` — boolean, default style red pulse.
- `connection_ok` — boolean, default style grey when disconnected.
- Per-keyer `key_active` replacing the DSK-only pair (parameterised by
  `key_type`, `num`, `target`).

### 3.3 Presets

Add `src/presets.ts` with:

- **PGM bus row** — 24 XPT buttons (`cam1-24`, or a configurable count)
  using `pgm_cut` + `xpt_pgm` feedback.
- **PVW bus row** — same with `pvw_cut` + `xpt_pvw` feedback.
- **DSK row** — 2 buttons, `key_toggle` + `key_pgm` feedback.
- **USK row** — 8 buttons (Layer 1-4, KEY 1-4).
- **Transition** — Cut, Auto, Duration (short/medium/long), FTB.
- **Clip transport** — Play/Pause/Reset/FF/RW/Load.
- **Snapshot recall** — 1-32 buttons bound to `snapshot_N_title`
  variables.
- **Connection status** — single button using `connection_ok` feedback.

Wire via `self.setPresetDefinitions({...})` in `main.ts`.

**Deliverable:** `feat: variables, feedbacks, and presets`.

---

## Phase 4 — Transition polish

### 4.1 Free-form duration

The current `wipe_duration` is a three-choice dropdown
([src/actions.ts:80-103](src/actions.ts#L80-L103)). Replace with a
`textinput` accepting a duration string (e.g. `0.75s`, `2s`) with
`useVariables: true`. The CSP `configure_effect` `duration` argument
already accepts arbitrary strings.

### 4.2 Transition type selector

`configure_effect` has a `name` parameter. Expose
`crossfade | dip | wipe | push | dve` (confirm available names against
the live switcher — the CSP protocol isn't in `openapi.json` so this
requires manual testing). Add an `args` payload per type.

### 4.3 Fade to Black

Standard switcher operation. Typically a `configure_effect` +
`transition` to a black source. Confirm the exact command sequence
with the switcher and add a `ftb` action.

**Deliverable:** `feat: flexible transitions (free-form duration, type selector, FTB)`.

---

## Phase 5 — REST API integrations

This is net-new territory beyond the SD plugin. It all depends on
knowing the **event ID**, which the current module does not collect.

### 5.1 Event-ID config + auto-select

Two options on [src/config.ts](src/config.ts):

- `event_id` — textinput, optional.
- If empty, call `GET /api/events/overview` on connect and pick the
  first event whose `status === 'Running'`. Cache the ID on `M2LX`.

Expose `event_id` and `event_name` as variables.

### 5.2 HTTP helper

Add `M2LX.rest<T>(method, path, body?): Promise<T>` that:

- Injects the current `access_token` as a bearer header.
- Handles 401 by forcing a token refresh and retrying once.
- Honours the `allowSelfSigned` config flag.
- Returns parsed JSON.

### 5.3 Event lifecycle actions + feedback

Endpoints (see [openapi.json](openapi.json)):

- `POST /api/events/start/{event_id}`
- `POST /api/events/stop/{event_id}`
- `POST /api/events/restart/{event_id}`
- `GET /api/events/overview` — polled every ~5s for status.

Actions: `event_start`, `event_stop`, `event_restart`.
Feedback: `event_status` (with dropdown for the `EventStatus` enum:
Initializing/Running/Stopped/Starting/Stopping/Resetting/Failed/Dead).
Variable: `event_status`.

### 5.4 Output control + status

Endpoints:

- `POST /api/output/start/{event_id}/{id}`
- `POST /api/output/stop/{event_id}/{id}`
- `POST /api/output/all_start/{event_id}`
- `POST /api/output/all_stop/{event_id}`
- `GET /api/output/list/{event_id}` — polled for `status` (`online`/`offline`/`none`).

Actions: `output_start`, `output_stop`, `output_all_start`, `output_all_stop`.
Feedback: `output_online` (parameterised by output ID).

### 5.5 Input status

Endpoints:

- `GET /api/input/router/list/{event_id}`
- `GET /api/input/mic/list/{event_id}`
- `GET /api/input/switcher/list/{event_id}`

Polled feedback `input_online` (parameterised by source + id). Also
expose input `name` fields as variables, so operators can display
friendly names instead of `cam1`.

### 5.6 Operation mode (flip-flop)

- `GET /api/events/operation_mode/{event_id}`
- `POST /api/events/operation_mode/update/{event_id}`

Action `operation_mode_set { flip_flop: boolean }`, feedback
`operation_mode_flip_flop`, variable `operation_mode_flip_flop`.

Note: this is the **event-level** flip-flop; the CSP `toggle_mode` from
2.2 is the **per-transition** flip-flop. Both exist in the switcher
and do different things. Document this in HELP.md.

### 5.7 Tally colour

- `GET /api/tally/enable/{event_id}`
- `POST /api/tally/enable/update/{event_id}`

Action `tally_colour_set` with dropdowns for program/preview/clean
(`Red | Green | Yellow | None`), feedback for current colour.

### 5.8 Lower-priority readbacks (variables only)

- `GET /api/version/list` → `m2lx_version`, `m2lx_frontend_version`,
  `m2lx_backend_version`.
- `GET /api/cert/expiry` → `cert_expiry_days`.
- `GET /api/system/resource_status` → `cpu_percent`, `mem_percent`,
  `storage_percent` for dashboards.

**Deliverable:** three PRs splitting 5.1+5.2 (foundation), 5.3+5.4
(event & output control), and 5.5-5.8 (readbacks). Keep PRs small
because REST polling needs care.

---

## Phase 6 — Documentation & polish

### 6.1 README

Replace the template in [README.md](README.md) with:

- What the module controls (M2L-X v1.1+).
- Config field documentation.
- Known limitations (CSP V1 only; self-signed certs; event ID handling).
- Link to HELP.md.
- Development workflow (keep the existing `yarn build` / `yarn dev` bit).

### 6.2 HELP.md

Replace [companion/HELP.md](companion/HELP.md) with operator-facing
docs: every action, every feedback, every variable, every preset, a
worked example (PGM/PVW bus build-out), and troubleshooting.

### 6.3 Keyer source expansion

The existing `key_source` action
([src/actions.ts:186-498](src/actions.ts#L186-L498)) is a huge
switch/case that only covers HTML5 vs Off. Refactor into:

- `key_source_set { key_type, num, source }` — textinput for `source`,
  `useVariables` enabled. Sends the single `set_key_property video`
  command.
- `key_reset_transform { key_type, num }` — performs the translate/
  scale/rotate/shape/image reset as one batched helper.

This is more flexible (supports any source, not just HTML5) and ~80%
less code.

### 6.4 Upgrade scripts

[src/upgrades.ts](src/upgrades.ts) is empty. As actions are renamed or
their options change across phases, add upgrade scripts so existing
user buttons keep working. At minimum we'll need one for Phase 2.4 to
migrate DSK-only `key`/`key_toggle`/`key_source`/`key_pgm`/`key_pvw`
option shapes to include the new `key_type` field.

### 6.5 Type safety pass

[src/m2lx.ts](src/m2lx.ts) uses `any` heavily (`element.state.source`,
key state payloads, etc.). Introduce a discriminated-union type for
the status payload once we've seen enough wire traffic in testing.

**Deliverable:** `docs: README and HELP` + `refactor: key_source and upgrade scripts`.

---

## Cross-cutting concerns

### Testing

No automated tests exist. Minimum viable coverage:

- Unit-test the status-payload parser with fixtures captured from a
  real switcher session.
- Unit-test the action callbacks by stubbing `sendCSP` and asserting
  the outgoing command shape.

### Logging

The current module logs at `info` very liberally (every CSP send, every
status payload). Downgrade routine traffic to `debug` and keep
connection lifecycle at `info`. Errors stay at `error`.

### Config migration

If we add the `allowSelfSigned` and `event_id` fields, users with
existing installs need an upgrade script that sets the defaults.

### Dependencies

- `ws` — already present.
- Consider `undici` (node 18+ bundles it) for the HTTPS agent support
  needed in 0.3 and 5.2 rather than pulling in `node-fetch`.

---

## Sequencing and merge strategy

Recommend one PR per phase, merged in order:

1. Phase 0 — defects (1 PR).
2. Phase 1 — connectivity (1 PR).
3. Phase 2 — SD-plugin parity (1 PR).
4. Phase 3 — variables/feedbacks/presets (1 PR).
5. Phase 4 — transition polish (1 PR).
6. Phase 5 — REST integration, split into 3 PRs (foundation, lifecycle,
   readbacks).
7. Phase 6 — docs + refactor (1-2 PRs).

Each PR should be independently testable against a real switcher before
the next one starts.

## Out of scope (future)

- V2 CSP protocol migration (if/when Sony ships one).
- Singular.Live content URL management
  (`/api/content/singular/output_url/{event_id}`).
- Multi-event control from one module instance.
- Content import/export (`/api/content/*`) — operator-facing but huge
  scope.
- Full tally device / UMD management — configuration-time, not live.
