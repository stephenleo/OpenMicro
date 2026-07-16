<p align="center"><img src="assets/open-micro-logo.png" alt="OpenMicro" width="220"></p>

<p align="center">
  <a href="https://www.npmjs.com/package/openmicro"><img src="https://img.shields.io/npm/dm/openmicro?style=flat" alt="npm downloads"></a>
  <a href="https://github.com/stephenleo/OpenMicro/stargazers"><img src="https://img.shields.io/github/stars/stephenleo/OpenMicro?style=flat" alt="GitHub stars"></a>
  <a href="https://github.com/stephenleo/OpenMicro/forks"><img src="https://img.shields.io/github/forks/stephenleo/OpenMicro?style=flat" alt="GitHub forks"></a>
</p>

# OpenMicro

Codex Micro, replicated 100% in software with a consumer gamepad. Wrap Claude Code or Codex CLI (`openmicro claude` / `openmicro codex`) and drive it with a DualSense: face buttons accept/reject/push-to-talk/new-chat, left-stick flicks launch workflow presets, right-stick rotation is the thinking-depth dial, the lightbar and player LEDs show live agent status, and the touchpad cycles between sessions. Harness-agnostic — add any other agent CLI via the public `openmicro/harness` API.

_(Full docs land with the initial release — see PLAN.md meanwhile.)_

## Demo GIFs

<!-- demo-gif-plan: capture after v1 works on real hardware. One GIF per feature, ~10s each,
     terminal + controller in frame (overhead phone shot or picture-in-picture), recorded with
     vhs/asciinema for terminal + camera composite. Keep each under 5 MB for GitHub README. -->

Planned captures, one per Codex Micro feature replicated:

| GIF                            | What it shows                                                                                                                                      | Placeholder                                |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| `docs/demo/status-leds.gif`    | Agent runs → lightbar turns blue (executing), amber (waiting for input), green flash (complete), red (error); player LEDs light per active session | ![status](docs/demo/status-leds.gif)       |
| `docs/demo/command-keys.gif`   | Permission prompt appears → ✕ accepts, ○ rejects, △ push-to-talk, □ new chat                                                                       | ![commands](docs/demo/command-keys.gif)    |
| `docs/demo/workflow-flick.gif` | Left-stick flick up → "review this PR" prompt template lands in the agent and submits                                                              | ![workflows](docs/demo/workflow-flick.gif) |
| `docs/demo/thinking-dial.gif`  | Right-stick clockwise rotation → thinking depth steps up (with on-screen confirmation of the mode change)                                          | ![dial](docs/demo/thinking-dial.gif)       |
| `docs/demo/layers.gif`         | Hold L1 + face button → layer switches, lightbar flashes the layer tint, same button now does a different action                                   | ![layers](docs/demo/layers.gif)            |
| `docs/demo/multi-session.gif`  | Two terminal tabs both wrapped → touchpad click cycles focus, LEDs show both slots, lightbar tracks the focused session's state                    | ![sessions](docs/demo/multi-session.gif)   |

Capture checklist: DualSense over Bluetooth (proves wireless), macOS Terminal with a real Claude Code session, controller visible in frame for every clip, no cuts within a clip.

## Install

```
npm i -g openmicro
```

- **macOS-first.** Other platforms are untested.
- **Node >= 22** required.
- **DualSense recommended.** It's the only controller with an RGB lightbar and player LEDs, so it's the only one that shows live agent status. DS4, Xbox, and generic HID gamepads work too, but input-only — no lightbar/LED/rumble output path (see Known gaps).

### Troubleshooting: controller connected but openmicro can't open it

Symptom: System Settings → Game Controllers shows the pad as Connected, but openmicro never logs `DualSense connected` (under the hood, node-hid fails with `cannot open device with path DevSrvsID:...`).

The cause is almost always **another process holding the controller exclusively** (`IOHIDDeviceOpen` returns `kIOReturnExclusiveAccess`, `0xe00002c5`). One gamepad serves one master — quit the others:

- another agent-controller tool (vibesense, an older openmicro session)
- Steam (Steam Input remaps controllers in the background)
- a Chrome tab using the Gamepad/WebHID API
- PS Remote Play

To find the holder: `ioreg -r -n "DualSense Wireless Controller" -l -w0 | grep IOUserClientCreator` lists the PIDs with the device open.

Input Monitoring permission is **not** required for game controllers on current macOS (verified empirically — keyboards/mice need it, gamepads don't).

## Quick start

```
openmicro claude   # wrap Claude Code (also the default: `openmicro` alone)
openmicro codex     # wrap Codex CLI
```

The first `openmicro` process to start becomes the **host**: it binds port 48762, owns the controller, and aggregates agent state across every session. Later instances (e.g. a second terminal tab) run as **clients** — their session still reports state via hooks, and the host forwards terminal keystrokes to whichever session has focus (cycle focus with the touchpad).

## Controls (Layer 1 default bindings)

| Control                  | Action                                                              |
| ------------------------ | ------------------------------------------------------------------- |
| south (✕ / A)            | Accept — submits the prompt / accepts the highlighted dialog option |
| east (○ / B)             | Reject — interrupts the agent / closes a dialog                     |
| north (△ / Y)            | Push-to-talk (Claude only — no Codex equivalent, see Known gaps)    |
| west (□ / X)             | New chat (Claude: `/clear`, Codex: `/new`)                          |
| d-pad up/down/left/right | Arrow keys, for TUI menu navigation — auto-repeats while held       |
| left stick flick up      | Workflow preset: review this PR                                     |
| left stick flick down    | Workflow preset: debug                                              |
| left stick flick left    | Workflow preset: refactor                                           |
| left stick flick right   | Workflow preset: write tests                                        |
| right stick rotate CW    | Thinking depth +1 step (Claude only, see Known gaps)                |
| right stick rotate CCW   | Thinking depth -1 step (Claude only, see Known gaps)                |
| touchpad click           | Cycle focus to the next active session                              |

Everything above is remappable — see [Configuration](#configuration). L1 itself is fixed and not remappable: holding it turns south/east/west/north/dpad-up/dpad-down into a layer-switch (see [Layers](#layers)).

## Agent status colors

The lightbar always shows the focused session's state:

| State       | Lightbar color                                  | RGB           |
| ----------- | ----------------------------------------------- | ------------- |
| `executing` | blue                                            | `0, 0, 255`   |
| `waiting`   | amber                                           | `255, 176, 0` |
| `idle`      | dim white                                       | `20, 20, 20`  |
| `complete`  | green (flashes, then decays to `idle` after 8s) | `0, 255, 0`   |
| `error`     | red                                             | `255, 0, 0`   |

The 5 player LEDs show occupied session slots (one LED per active `openmicro` session, capped at 5 — see Known gaps).

## Layers

Hold **L1** + south/east/west/north/dpad-up/dpad-down to jump straight to layer 0-5. This mapping is fixed, not remappable. The lightbar flashes the new layer's tint for 600ms, and a 750ms guard window swallows all button and stick-gesture input right after the switch — including any button that was already held at the moment of the flip, which stays dead until it's released and freshly re-pressed. This prevents a press meant for the old layer from leaking into the new one.

Layer 1 (index 0) ships the bindings in the table above. Layers 2-6 (indices 1-5) are blank canvases with just a name and lightbar tint — fill them in via the config file.

## Configuration

Bindings and workflow prompts live in `~/.openmicro/config.json`, validated with zod on load. If the file doesn't exist, it's seeded with the default config on first run. If it exists but fails validation, `openmicro` exits with an error and leaves the file untouched — a typo can never be silently clobbered.

A trimmed but valid example (a real config needs all 6 `layers` entries; this shows the shape with layer 1 partially bound and layers 2-6 left blank):

```json
{
  "layers": [
    {
      "name": "Layer 1",
      "color": { "r": 255, "g": 255, "b": 255 },
      "bindings": {
        "south": { "type": "accept" },
        "east": { "type": "reject" },
        "lstick_up": { "type": "workflow", "presetId": "review-pr" },
        "rstick_cw": { "type": "thinking_depth", "delta": 1 }
      }
    },
    { "name": "Layer 2", "color": { "r": 160, "g": 32, "b": 240 }, "bindings": {} },
    { "name": "Layer 3", "color": { "r": 0, "g": 255, "b": 255 }, "bindings": {} },
    { "name": "Layer 4", "color": { "r": 255, "g": 140, "b": 0 }, "bindings": {} },
    { "name": "Layer 5", "color": { "r": 255, "g": 20, "b": 147 }, "bindings": {} },
    { "name": "Layer 6", "color": { "r": 255, "g": 255, "b": 0 }, "bindings": {} }
  ],
  "workflows": {
    "review-pr": "Review this PR for correctness, security, and style issues."
  }
}
```

`bindings` keys are any `ControlId` (button names like `south`/`dpad_up`, or stick gestures like `lstick_up`/`rstick_cw`); values are any `Action` from the harness contract (`accept`, `reject`, `push_to_talk`, `new_chat`, `thinking_depth`, `workflow`, `prompt`, `focus_session`, `layer`, `keys`). `workflows` maps a `presetId` referenced by a `workflow` binding to the prompt text sent to the agent.

## Adding a harness

Any other agent CLI can be added without forking — implement the `Harness` interface from `openmicro/harness` and call `registerHarness`:

```ts
import { registerHarness } from 'openmicro/harness'
import type { Action, AgentState, Harness } from 'openmicro/harness'

const geminiHarness: Harness = {
  kind: 'gemini',
  command: 'gemini',

  buildArgs(userArgs) {
    return userArgs
  },

  installHooks() {
    // Register whatever lifecycle hooks your CLI supports, or no-op.
    return { changed: false, trustNotice: null }
  },

  stateForHookEvent(event, _payload): AgentState | null {
    switch (event) {
      case 'UserPromptSubmit':
        return 'executing'
      case 'Stop':
        return 'complete'
      default:
        return null
    }
  },

  resolveAction(action: Action, _ctx) {
    switch (action.type) {
      case 'accept':
        return { bytes: '\r' }
      case 'reject':
        return { bytes: '\x1b' }
      case 'prompt':
        return { bytes: action.text + '\r' }
      case 'keys':
        return { bytes: action.bytes }
      default:
        return null // no equivalent — a documented gap, never faked
    }
  },
}

registerHarness(geminiHarness)
```

`resolveAction` returning `null` is the contract for "this harness has no equivalent for that action" (e.g. Codex's `push_to_talk`) — never fake bytes for an action a CLI doesn't support. Note that `registerHarness` is a real, tested extension point (core code never imports the `'claude'`/`'codex'` literals outside `src/harness/`), but the `openmicro` binary itself has no plugin-loading mechanism yet — your registration needs to run before the CLI resolves its harness, which today means writing your own small entry point around openmicro's internals rather than a config flag.

## Testing your controller

OpenMicro ships with a standalone hardware diagnostic. It wraps no agent and needs no running session:

```
openmicro doctor
```

It detects your pad (VID/PID, product, transport, and which driver claimed it), then walks an interactive checklist: press each button as prompted (`s`+Enter skips, 30s timeout per control), exercise both sticks and triggers so it can record their range, and — on a DualSense — confirm the lightbar and player-LED output. While you press, it captures the exact raw HID report bytes behind each event.

When it finishes it writes a report file to the current directory named by the controller's canonical identity — `<vid>-<pid>-<transport>.json` (e.g. `054c-0ce6-usb.json`) — and prints a paste-ready markdown summary. VID:PID + transport is what determines the HID report layout, so it works for any manufacturer without a model list, and it doubles as the dedup key: if someone already submitted your controller, your PR shows up as an update to their fixture rather than a duplicate file (newer full-pass reports win; git history credits every confirmer). The human-readable product name lives inside the JSON and in the table below.

**Contributing your report (PR-first):** the report file _is_ a test fixture — same schema, same filename, no editing. Drop it into `test/fixtures/controllers/` and open a PR. CI replays every captured button press through the matching parse function, so a merged fixture is a permanently regression-tested controller, and your pad shows up in the table below (regenerated by `npm run gen:controllers`, enforced by CI). If you'd rather not open a PR, paste the JSON into the [controller report issue template](../../issues/new?template=controller-report.yml) instead and a maintainer can add it.

If no driver recognizes your pad, `doctor` drops into capture-only mode: hold each control while it records idle-vs-pressed byte pairs. That's exactly the data needed to write a new parse function without having the hardware on hand.

Note: DualSense is the only controller with output (lightbar / player-LED) checks today — DS4, Xbox, and generic pads are input-only, so `doctor` records `output: "unsupported"` for them.

## Community-tested controllers

Controllers with a committed fixture — replayed through their parser on every CI run:

<!-- controllers:start -->

| Controller                    | VID:PID   | Connection | Driver    | Buttons passed | Output        | Status  |
| ----------------------------- | --------- | ---------- | --------- | -------------- | ------------- | ------- |
| DualSense Wireless Controller | 054c:0ce6 | usb        | dualsense | 17/17          | lightbar+LEDs | ✅ full |
| Xbox Wireless Controller      | 045e:0b12 | usb        | xbox      | 4/4            | none          | ✅ full |

<!-- controllers:end -->

## Known gaps

Deliberate, not oversights:

- **5 LED slots vs Codex Micro's 6 agent keys** — the DualSense has 5 player LEDs.
- **`error`/`complete` are heuristics** — hooks provide no ground-truth error signal; each harness sniffs what it can (e.g. Claude scans notification text for "error"/"failed"/"denied").
- **DS4/Xbox/generic gamepads are input-only** — no RGB lightbar/LED/rumble feedback path, only DualSense implements `ControllerOutput`.
- **Xbox driver is wired-USB report layout only** (inherited from vibesense) — no Bluetooth report parsing.
- **No voice / push-to-talk on Codex** — Codex CLI has no dictation feature, so the north button is a no-op there.
- **No thinking-depth dial on Codex** — reasoning effort is only adjustable through Codex's interactive `/model` picker; there's no deterministic per-step command to bind the right-stick rotation to, so it's a no-op there.
