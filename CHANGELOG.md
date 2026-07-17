# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [0.1.7] - 2026-07-17

### Added

- L2 cycles herdr workspaces ("spaces"); while a space is selected, touchpad click cycles that space's agents via `herdr agent focus` instead of local sessions. No-op when herdr is absent
- First-class herdr support: wrapped agent sessions running inside a herdr-managed pane report their state (working/blocked/idle) to herdr via `herdr pane report-agent`, and release the pane claim on session end. No-op outside herdr or when the `herdr` CLI is absent
- Default Layer 1 bindings: R1 cycles modes (Shift+Tab, `\x1b[Z`) and R2 clears the input line (Ctrl+U, `\x15`)

### Changed

- Refreshed the README banner image

### Fixed

- Manual touchpad session focus is no longer stolen when another session merely finishes a turn; only sessions newly demanding attention (waiting/error) pull controller focus.

## [0.1.6] - 2026-07-17

### Fixed

- Fixed the DualSense touchpad not cycling between open sessions: a freshly opened wrapped session fired no hook until its first prompt, so it never entered the touchpad cycle list. openmicro now installs a `SessionStart` hook and tracks the session as `idle` from the moment it opens ([#16](https://github.com/stephenleo/OpenMicro/pull/16))
- Fixed client sessions silently dropping out of the touchpad rotation after exactly 5 idle minutes: Node's `fetch` (undici) enforces a 300s body timeout on silent streams, killing the client keystroke SSE stream and removing its sessions on the host. The host now sends an SSE comment heartbeat every 25s to keep idle streams alive ([#16](https://github.com/stephenleo/OpenMicro/pull/16))

### Added

- This changelog. Release notes for each `vX.Y.Z` tag are now taken from the matching changelog section, and `CHANGELOG.md` ships in the npm package

## [0.1.5] - 2026-07-16

### Fixed

- Route Claude sessions by hook ownership instead of cwd: every wrapped agent is spawned with `OPENMICRO_INSTANCE_ID` in its environment, hook commands self-identify via the `X-Openmicro-Instance-Id` header, and the host only trusts hooks from wrappers it knows. Fixes touchpad input routing to the wrong terminal when several sessions share a directory, and preserves a manual touchpad selection when another session demands attention ([#12](https://github.com/stephenleo/OpenMicro/pull/12))

### Docs

- Improved README and controller documentation ([#11](https://github.com/stephenleo/OpenMicro/pull/11))

## [0.1.4] - 2026-07-16

### Fixed

- `openmicro --version` now reports openmicro's own version instead of the wrapped agent's ([#8](https://github.com/stephenleo/OpenMicro/pull/8))
- Corrected the MIT license metadata published to npm

### Added

- MIT `LICENSE` and contributing guide ([#9](https://github.com/stephenleo/OpenMicro/pull/9))

## [0.1.3] - 2026-07-16

### Added

- Controller fixture: DualSense Wireless Controller over USB, full pass ([#6](https://github.com/stephenleo/OpenMicro/pull/6))

## [0.1.2] - 2026-07-16

### Added

- `openmicro doctor` — interactive controller capture pipeline so the community can record and contribute fixtures for untested gamepads ([#5](https://github.com/stephenleo/OpenMicro/pull/5))

## [0.1.1] - 2026-07-16

### Fixed

- Lightbar follows agent activity without requiring a manual focus pick ([#3](https://github.com/stephenleo/OpenMicro/pull/3))

### Docs

- Documented macOS Input Monitoring setup for controller access ([#2](https://github.com/stephenleo/OpenMicro/pull/2))

## [0.1.0] - 2026-07-16

### Added

- Initial release: wrap `claude` or `codex` in a pty and drive it with a DualSense controller — prompt accept/reject, push-to-talk dictation, thinking-depth dial, layer switching with lightbar feedback, and HOST/CLIENT multi-session support with touchpad session cycling ([#1](https://github.com/stephenleo/OpenMicro/pull/1))
