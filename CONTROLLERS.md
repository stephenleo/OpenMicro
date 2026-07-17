# Controller compatibility

OpenMicro accepts input from DualSense, DualShock 4 (including third-party pads in DS4 mode, such as the GameSir Cyclone 2), GameSir-G7 Pro, and wired Xbox gamepads, with a best-effort fallback for generic HID layouts. DualSense is the recommended controller because it also supports lightbar and player-LED feedback; other controllers are input-only.

## Community-tested controllers

Every controller below has a committed `openmicro doctor` report. CI replays captured inputs through the matching parser on every change.

<!-- controllers:start -->

| Controller                      | Reports as                      | VID:PID   | Connection | Driver    | Buttons passed | Output        | Status  |
| ------------------------------- | ------------------------------- | --------- | ---------- | --------- | -------------- | ------------- | ------- |
| GameSir Cyclone 2 (DS4 mode)    | DUALSHOCK 4 Wireless Controller | 054c:05c4 | bluetooth  | ds4       | 17/17          | none          | ✅ full |
| GameSir G7 Pro                  | GameSir-G7 Pro                  | 3537:1022 | bluetooth  | gamesir   | 17/17          | none          | ✅ full |
| Microsoft Xbox One S Controller | Controller                      | 045e:02ea | usb        | xbox      | 17/17          | none          | ✅ full |
| Microsoft Xbox One S Controller | Xbox Wireless Controller        | 045e:0b20 | bluetooth  | xbox      | 17/17          | none          | ✅ full |
| Sony DualSense                  | DualSense Wireless Controller   | 054c:0ce6 | usb        | dualsense | 17/17          | lightbar+LEDs | ✅ full |

<!-- controllers:end -->

## Test your controller

Run the standalone diagnostic without starting an agent:

```sh
openmicro doctor
```

Follow the prompts, then add the generated `<vid>-<pid>-<transport>.json` file to `test/fixtures/controllers/` in a pull request. Run `npm run gen:controllers` to refresh this page. If you cannot open a pull request, paste the report into the [controller report issue template](../../issues/new?template=controller-report.yml).

If OpenMicro has no parser for your controller, `doctor` captures the raw input needed to add one.

## Adding support for a new controller (with an AI coding agent)

Every driver in this repo was added with the same debug loop. It works with Claude Code, Codex, or any coding agent that can run shell commands. Budget ~15 minutes with the controller in hand — you press buttons, the agent does the rest.

### The one prompt you need

Clone the repo, run `npm install`, connect the pad, start your agent in the repo root, and paste:

> My controller fails `openmicro doctor` — output below. Follow the "Adding support for a new controller" guide in CONTROLLERS.md: run `npm run capture` in the background and tell me the exact order to press controls; decode the layout from the frames; add a parser and route my VID/PID to it; then walk me through certifying with doctor and opening the PR.
>
> [paste your doctor output here]

Everything below is the playbook the agent (or a human) follows.

### 1. Diagnose

`openmicro doctor` ends in one of three states:

- **All 17 controls pass** — no code needed. Commit the report as a fixture (see "Test your controller" above).
- **`Driver: generic` and buttons fail** — the pad's VID/PID is unknown, so it fell back to the generic parser whose byte layout almost never matches. The common case.
- **A known driver but some buttons fail** — the parser misses part of the report (wrong byte, or the button arrives in a separate message type, like the Xbox guide button). Same loop, smaller fix.

Beware false positives: a "pass" can be a misread byte that happens to flip (e.g. a report-ID byte the generic parser reads as a held button). Trust a full 17/17 run, not one lucky button.

### 2. Capture raw reports

The capture tool ships in the repo:

```sh
npm run capture                  # first gamepad-looking device, 60s window
npm run capture -- 045e 02ea 45  # or by VID PID (hex) and seconds
```

It prints every distinct input report as hex. The agent runs it **in the background** while you press controls in an agreed order — face buttons, bumpers, menu/view, dpad, triggers, home — one per second. The known press order is what makes the bytes decodable.

Gotchas:

- **"cannot open device"** — something else holds the pad (a still-running `doctor`, Steam, another capture). Close it and retry.
- **Zero reports at idle** — normal; many pads only report on change.
- **A button produces no frame** — it may arrive as a separate message/report type (the Xbox guide button is its own GIP message type `0x07`; the GameSir home button is report ID `0x02`). Capture again pressing only that button.

### 3. Decode and implement

Map the capture to a parser: a `parseXReport(data: Buffer): ControllerEvent[]` following the existing drivers in `src/controller/`, routed by VID/PID in `createDriver()` (`src/controller/hid-manager.ts`, before the generic fallback), with the PID list added to `findDevice()` in `src/doctor.ts`. Unit tests in `test/drivers.test.ts` use the real captured frames as hex strings.

Conventions (any existing driver is a template):

- Emit standard `ButtonId`s (`south`/`east`/`west`/`north`, not A/B/X/Y). The pad's home/guide button maps to `touchpad`.
- Synthesize `l2`/`r2` button presses from the analog triggers at a >25% threshold.
- Normalize sticks to -1..1 and triggers to 0..1.
- Return `[]` for short reports or wrong report IDs — never throw on malformed input.
- One controller can need **multiple parsers**: wired and Bluetooth layouts often differ completely (the Xbox pads here use three).

### 4. Verify and certify

1. `npm run typecheck && npm run lint && npm run format:check && npm test`
2. `npm run build`, then re-run `node dist/cli.js doctor` on the real pad until **17/17 controls pass** (skip `touchpad` with `s` only if the pad truly has no home button). When doctor asks for the make/model, type the pad's real retail name — firmware strings are often generic or spoofed (the wired Xbox One S calls itself "Controller"; a Cyclone 2 in DS4 mode claims to be a DUALSHOCK 4).
3. Drop the generated report into `test/fixtures/controllers/` — CI replays every captured press through your parser automatically, no test edits needed.
4. `npm run gen:controllers` to refresh the table above, and open a PR with the parser + fixture together.

If a control still fails, loop back to step 2 and capture just that control — the failing button's frames tell you what the parser missed.
