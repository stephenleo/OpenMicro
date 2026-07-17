# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [0.1.14] - 2026-07-17

### Fixed

- Attention events (a session entering waiting/error state) no longer steal voice/keys focus while herdr governs it: the steal silently rerouted input back to a pane the user wasn't looking at, fighting the mouse-click focus sync and making voice land in two panes. Attention-based focus pull still works in local mode

## [0.1.13] - 2026-07-17

### Fixed

- Voice/keys focus now follows mouse clicks on herdr panes and spaces: focus changes made inside the herdr UI fired no controller event, so input stayed routed to the previously focused pane. The host now polls the focused herdr agent (1s, no-op outside herdr) and retargets input routing whenever it moves
- Controller input is dropped entirely while herdr focus sits on a pane hosting no openmicro session (plain terminal, foreign agent, empty space), instead of falling through to the host's own pty — typing into a pane the user isn't looking at is worse than a no-op. Explicit local picks (touchpad in local mode, L2 back to local mode) unblock input

## [0.1.12] - 2026-07-17

### Fixed

- Voice/keys input now retargets when switching herdr spaces: cycling to a new space left input routing (`focusSessionId`) on the previously-focused agent in the old space, so voice spilled across spaces. Entering a space now runs the same agent retargeting as touchpad cycling, and stale focus is cleared when the space is empty or the focused pane hosts no openmicro session

## [0.1.11] - 2026-07-17

### Fixed

- Voice/keys input now follows the herdr agent cycle: with a herdr space selected, touchpad cycling focused the next agent in herdr but left input routing (`focusSessionId`) on the previously-focused session — possibly in another space. The host now tracks each session's herdr pane (from the `X-Herdr-Pane-Id` hook header) and retargets input to the session hosted in the newly-focused pane

## [0.1.10] - 2026-07-17

### Fixed

- Herdr agent visibility (root cause, confirmed against herdr source): herdr's own claude integration hook (`~/.claude/hooks/herdr-agent-state.sh`, gated on `HERDR_ENV=1`) also runs inside the wrapped agent and claims the pane's session as `herdr:claude`. Once a pane's session has a different owner, herdr silently drops every `pane report-agent` from openmicro regardless of `--seq` — takeover requires herdr to natively detect the reporting agent in the pane's foreground, which it never can for openmicro. The wrapper now removes `HERDR_ENV` from the wrapped agent's environment so herdr's hooks no-op inside it and openmicro stays the pane's sole reporter (`HERDR_PANE_ID` is still passed through for openmicro's own hooks). Panes whose session was already claimed by a previous direct-claude run stay stuck until closed — open a fresh pane

## [0.1.9] - 2026-07-17

### Fixed

- Herdr agent visibility (for real this time): herdr silently drops any `pane report-agent` / `pane release-agent` request whose `--seq` is not strictly greater than the last seen — and a request without `--seq` defaults to 0, so every openmicro report (including the v0.1.8 startup pane claim) was discarded while herdr still replied ok. All report/release calls now pass an epoch-nanosecond `--seq`, matching herdr's own integration hook

## [0.1.8] - 2026-07-17

### Fixed

- Herdr agent visibility: claim the herdr pane at wrapper startup (releasing it on shutdown) so the wrapped agent's own herdr integration hook can't claim it first — herdr honors the first source to claim a pane and silently drops state reports from every other source, which kept openmicro sessions out of the herdr agents panel

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
