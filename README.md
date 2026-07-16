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
