# Sony M2L-X

Controls a Sony M2L-X cloud switcher over its Cloud Switcher Protocol (CSP)
WebSockets and its REST API.

## Configuration

| Field                                  | Description                                                                                                                  |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| **Target URL**                         | Hostname or IP of the switcher. No scheme — HTTPS is always used.                                                            |
| **Username**                           | Local-auth username.                                                                                                         |
| **Password**                           | Local-auth password.                                                                                                         |
| **Event ID**                           | Optional. If empty, the module calls `/api/events/overview` on connect and auto-picks the first event with status `Running`. |
| **Allow self-signed TLS certificates** | On by default. M2L-X ships with a self-signed cert; disable only if you have installed a trusted cert.                       |

Connection state is reported via the standard Companion status indicator:

- **Connecting** — initial or reconnect in progress.
- **OK** — both CSP WebSockets (control + status) are open.
- **Warning** — only one of the two sockets is open.
- **Connection Failure** — both sockets closed; module is retrying every 5 s.
- **Authentication Failure** — signin returned 401/403.

Access tokens are refreshed automatically using the `refresh_token` endpoint
60 s before expiry.

---

## Actions

### Crosspoint

| Action    | Options | Notes                         |
| --------- | ------- | ----------------------------- |
| `Cut PGM` | Source  | Sets the PGM source directly. |
| `Cut PVW` | Source  | Sets the PVW source directly. |

Sources are strings like `cam1`, `ndi3`, `vtr2` — the same names the switcher uses internally.

### Transition

| Action                     | Options                                           | Notes                                                                                                                                     |
| -------------------------- | ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `Cut`                      | Flip-Flop                                         | Instant transition. Blocks re-entry while a transition is running.                                                                        |
| `Take / Auto`              | Flip-Flop                                         | Runs the currently configured transition. Blocks re-entry.                                                                                |
| `Wipe (crossfade)`         | —                                                 | Configures a crossfade with fade 0.02 and runs it. Blocks re-entry.                                                                       |
| `Transition Duration`      | Duration string (e.g. `0.5s`, `1s`, `1.5s`, `2s`) | Configures `duration` only.                                                                                                               |
| `Transition Effect (type)` | Effect name, Fade amount                          | Configures `name` (+ `args.fade` when name is `crossfade`). Common names: `crossfade`, `dip`, `wipe`, `push`, `dve` — firmware-dependent. |

"Flip-Flop" drives the per-transition `toggle_mode` (PGM↔PVW swap after the transition). See also the event-level flip-flop under **REST** below.

### Keyers (DSK/USK)

Each keyer action takes `key_type` (DSK/USK), `num` (1–2 for DSK, 1–8 for USK) and `target` (PGM/PVW). DSK operations mirror to both buses automatically; the target option only applies to USK.

| Action              | Extras                        | Notes                              |
| ------------------- | ----------------------------- | ---------------------------------- |
| `Keyer Set Visible` | `state` checkbox              | Explicit show/hide.                |
| `Keyer Toggle`      | —                             | Toggles based on current state.    |
| `Keyer Source`      | `type` dropdown (HTML5 / Off) | Resets transforms and sets source. |

USK slots 1–4 are Layer 1–4, slots 5–8 are KEY 1–4 (matching the switcher UI labels).

### Snapshots

| Action            | Options      | Notes                                                                                                                     |
| ----------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------- |
| `Recall Snapshot` | Name, Target | Sends `load_snapshot` with the given internal name. Use `$(m2lx:snapshot_N_name)` to bind buttons to live snapshot slots. |

### Clip player

All clip actions take `num` (1–4) selecting the clip player (`vtrN`):

- `Play Clip`, `Pause Clip`, `Reset Clip` (seek to start)
- `Fast Forward Clip`, `Rewind Clip` — with `rate` (1–10)
- `Seek Clip` — with `pos` in seconds
- `Load Clip` — with `clip` filename (`useVariables` enabled)

### REST-backed

These require a resolved `event_id` (automatic if the config field is empty).

| Action                          | Options               | Endpoint                                      |
| ------------------------------- | --------------------- | --------------------------------------------- |
| `Event: Start`                  | —                     | `POST /api/events/start/{id}`                 |
| `Event: Stop`                   | —                     | `POST /api/events/stop/{id}`                  |
| `Event: Restart`                | —                     | `POST /api/events/restart/{id}`               |
| `Output: Start`                 | Output ID             | `POST /api/output/start/{event_id}/{id}`      |
| `Output: Stop`                  | Output ID             | `POST /api/output/stop/{event_id}/{id}`       |
| `Output: Start All`             | —                     | `POST /api/output/all_start/{id}`             |
| `Output: Stop All`              | —                     | `POST /api/output/all_stop/{id}`              |
| `Operation Mode: Set Flip-Flop` | `flip_flop` boolean   | `POST /api/events/operation_mode/update/{id}` |
| `Tally: Set Colours`            | PGM/PVW/Clean colours | `POST /api/tally/enable/update/{id}`          |

---

## Feedbacks

| Feedback                          | Notes                                                                   |
| --------------------------------- | ----------------------------------------------------------------------- |
| `PGM Tally` / `PVW Tally`         | Current source on PGM/PVW matches the configured source.                |
| `Key PGM Tally` / `Key PVW Tally` | Per-keyer tally on the given bus (DSK or USK).                          |
| `Key Active (parameterised bus)`  | Same as above but bus is an option — useful for preset layouts.         |
| `Transition in progress`          | Lit while `trans_running` is true.                                      |
| `Connected to switcher`           | Lit when both CSP sockets are open.                                     |
| `Event status`                    | Matches a chosen event-status value (Running, Starting, Stopped, etc.). |
| `Output online`                   | Output with the given ID is reporting `online`.                         |
| `Flip-Flop enabled (event mode)`  | Event-level operation-mode flip-flop.                                   |
| `Tally colour active`             | A given bus (PGM/PVW/Clean) currently has a given tally colour.         |

---

## Variables

| Variable                                                        | Source                                        |
| --------------------------------------------------------------- | --------------------------------------------- |
| `connection_state`                                              | `connected` / `degraded` / `disconnected`     |
| `pgm_source`, `pvw_source`                                      | Current crosspoint sources.                   |
| `transition_running`                                            | 1 or 0.                                       |
| `snapshot_count`, `snapshot_1…32_name`, `snapshot_1…32_title`   | Live snapshot list from the status stream.    |
| `event_id`, `event_name`, `event_status`                        | Resolved event (auto-picked or configured).   |
| `operation_mode_flip_flop`                                      | 1 or 0.                                       |
| `m2lx_version`, `m2lx_frontend_version`, `m2lx_backend_version` | From `GET /api/version/list`.                 |
| `cert_expiry_days`                                              | Days until TLS cert expiry (slow-poll).       |
| `cpu_utilization`, `gpu_utilization`                            | From `GET /api/system/resource_status` (0–1). |

Fast variables (crosspoint, key state, transition, REST events/outputs/tally) refresh on every relevant event or 5 s poll. Version/cert/resource refresh every 60 s.

---

## Presets

Bundled preset categories:

- **PGM Bus** / **PVW Bus** — cam1–24, ndi1–4, vtr1–4 with matching tally.
- **DSK** / **USK** — every keyer for both buses, with `Key Active` feedback.
- **Transition** — Cut, Auto, Wipe, three duration buttons.
- **Clip Transport** — play/pause/reset for clip 1–4.
- **Snapshots** — 32 slots bound to `$(m2lx:snapshot_N_title)` with recall-to-PVW.
- **Status** — Connection indicator button.

---

## Troubleshooting

- **Stays on "Connecting"** — check the Target URL, credentials, and that HTTPS to the switcher works from the Companion host. If the cert is self-signed, make sure _Allow self-signed TLS certificates_ is ticked.
- **"Authentication Failure"** — credentials rejected by `/api/local_auth/signin`.
- **Buttons stop working after ~1 hour** — should no longer happen; access tokens are refreshed automatically. If it does, check the Companion log for `token refresh failed`.
- **Snapshots variables are empty** — the switcher publishes snapshot names only when at least one scene has a `__SCENE_ORDER__` entry; make sure at least one scene has been saved.
