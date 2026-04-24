# companion-module-sony-m2lx

Bitfocus Companion module for the [Sony M2L-X](https://pro.sony/ue_US/products/video-switchers/m2l-x)
cloud switcher. Talks to the switcher over its WebSocket-based Cloud Switcher
Protocol (V1) and its REST API.

Provides:

- PGM/PVW crosspoint control and tally feedbacks.
- Cut, Take/Auto, Wipe with flip-flop and transition-running guards.
- Downstream (DSK) and upstream (USK) keyer show/hide/toggle with tally
  feedbacks.
- Snapshot recall (bind buttons to `$(m2lx:snapshot_N_name)` variables).
- Clip player transport (play/pause/seek/ff/rw/load) for 4 clip players.
- REST-backed event lifecycle (start/stop/restart), output control
  (start/stop/all), operation mode (flip-flop), and tally colour.
- Status/version/resource variables for dashboards.
- Presets for every common layout — PGM/PVW bus, DSK/USK rows, transitions,
  clip transport, snapshot grid, connection status.

See [HELP.md](./companion/HELP.md) for operator documentation.

## Getting started

Running `yarn` in the module directory performs all necessary install steps.
If not:

- `yarn build` — one-shot build to `dist/`.
- `yarn dev` — TypeScript compiler in watch mode.
- `yarn lint` — runs eslint + prettier.

## Configuration

| Field                              | Notes                                                          |
| ---------------------------------- | -------------------------------------------------------------- |
| Target URL                         | Switcher hostname or IP (no scheme; HTTPS is always used).     |
| Username / Password                | Local-auth credentials.                                        |
| Event ID                           | Optional. Auto-picks the first Running event when empty.       |
| Allow self-signed TLS certificates | Default on. Disable only if you have installed a trusted cert. |

## Known limitations

- CSP V1 only (no V2 yet).
- Requires the switcher to be reachable over HTTPS — HTTP is not supported.
- Input-status feedbacks (`/api/input/router/list` etc.) are not yet wired;
  PGM/PVW tally via the CSP WebSocket covers the common case.
- Fade to Black is not yet implemented — there's no clear CSP mechanism
  exposed in the current firmware; track via [PLAN.md](./PLAN.md) Phase 4.3.

## License

MIT — see [LICENSE](./LICENSE).
