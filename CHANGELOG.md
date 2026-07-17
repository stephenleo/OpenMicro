# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [0.2.1] - 2026-07-17

### Fixed

- DS4-mode home/touchpad button now registers. `parseDs4Report` never read byte 7, where the PS/home button (bit 0) and touchpad click (bit 1) live, so neither produced events. Third-party pads in DS4 mode (e.g. GameSir Cyclone 2) have no touchpad, so their home button — byte 7 bit 0 — had nowhere to land and failed the doctor's `touchpad` check. Byte 7's low two bits now map to `touchpad`, masking the high six bits (a report counter on genuine DS4s, so it can't fake presses). A real DualShock 4's touchpad click works too

### Added

- GameSir Cyclone 2 certified over Bluetooth in DS4 mode (all 17 controls pass). It reports as a DualShock 4 (`054c:05c4`), so the committed fixture also covers genuine DS4s and CI replays its touchpad capture

## [0.2.0] - 2026-07-17

### Added

- GameSir-G7 Pro Bluetooth support: a dedicated `gamesir` driver, detected by VID/PID ahead of the generic fallback that misread the pad's reports (byte 0 is the report ID `0x07`, which decoded as phantom face-button presses). All 17 controls and full axis ranges pass the doctor; the certified fixture ships in `test/fixtures/controllers/` and CI replays every captured press
- The G7 Pro's home button maps to `touchpad` (session cycling by default) — the pad's M button is firmware-consumed and never reaches the host
- `openmicro doctor --capture` forces raw capture-only mode, recording idle/pressed HID report pairs per control without any parser — the data needed to add a driver for a pad the parsers misread

### Fixed

- Doctor's capture-only device search now targets gamepad/joystick HID usages, so it can't grab a mouse or keyboard

## [0.1.18] - 2026-07-17

### Fixed

- Voice now actually stops in the host's own pane on focus change. When the host's session was tracked by session id (the normal case once hooks register it), `stopVoice` looked for a client instance that doesn't exist for host-owned sessions and gave up with "voice stop not delivered" — the first-launched session kept transcribing after focus moved away. The stop keystroke now falls back to the host's own pty, mirroring how regular key routing already handled it
- LT space cycling no longer eats presses at the wrap-around. `cycleHerdrAgent` changed the herdr pane without marking the change as seen, so the focus poll mistook openmicro's own pane switch for a mouse click and re-synced the workspace right after LT stepped past the last space into local mode — undoing the press. Cycling now records its own pane changes, so LT wraps last space → local mode → first space without dead presses

## [0.1.17] - 2026-07-17

### Fixed

- Killed the remaining voice-overlap path: when tap-mode dictation auto-submitted its transcript, the host's tracking went stale, and the next focus change fired the stale Space "off" toggle into a now-empty prompt — starting a fresh recording in the pane the user had left. The `UserPromptSubmit` hook now clears voice tracking at exactly that moment, so no stale toggle is ever sent
- Voice now disengages when its terminal stops being active, in any multi-terminal setup — no herdr required. Each wrapper observes terminal focus reporting (mode 1004 `ESC[I`/`ESC[O`) on its own pty and reports focus loss to the host, which stops dictation in that terminal immediately
- While dictation is live, herdr focus is polled every 250ms instead of every 1s, so a mouse pane change cuts voice within a beat instead of transcribing up to a second into the old pane
- A voice stop that cannot be delivered to its pane is now logged instead of silently dropped

## [0.1.16] - 2026-07-17

### Fixed

- Voice dictation is now restricted to the focused pane: it stops in the old pane the moment focus moves (controller cycle, herdr mouse click, space change), instead of only when the next voice press happened to fire. Previously async herdr focus changes could leave dictation running in a pane the user had left, transcribing into two panes at once
- Attention events no longer pull focus while dictation is live, which would have cut voice off mid-sentence

## [0.1.15] - 2026-07-17

### Fixed

- Xbox LT/RT presses no longer intermittently fail to register: the synthesized l2/r2 button press required a >50% analog pull, so soft or fast taps produced no press edge. Threshold lowered to 25% (DS4 unaffected — its triggers are hardware digital bits)
- Rapid LT presses no longer swallow each other: herdr space/agent cycle operations were fire-and-forget and could interleave, computing the same "next" twice. They are now serialized through a queue
- Starting voice in a second pane no longer leaves the first pane transcribing too: the host now tracks which pane holds dictation open and sends the toggle-off keystroke there before opening voice in the newly focused pane

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
