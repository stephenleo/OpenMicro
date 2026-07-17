# Controller compatibility

OpenMicro accepts input from DualSense, DualShock 4, and wired Xbox gamepads, with a best-effort fallback for generic HID layouts. DualSense is the recommended controller because it also supports lightbar and player-LED feedback; other controllers are input-only.

## Community-tested controllers

Every controller below has a committed `openmicro doctor` report. CI replays captured inputs through the matching parser on every change.

<!-- controllers:start -->

| Controller                    | VID:PID   | Connection | Driver    | Buttons passed | Output        | Status  |
| ----------------------------- | --------- | ---------- | --------- | -------------- | ------------- | ------- |
| DualSense Wireless Controller | 054c:0ce6 | usb        | dualsense | 17/17          | lightbar+LEDs | ✅ full |
| GameSir-G7 Pro                | 3537:1022 | bluetooth  | gamesir   | 17/17          | none          | ✅ full |
| Xbox Wireless Controller      | 045e:0b12 | usb        | xbox      | 4/4            | none          | ✅ full |

<!-- controllers:end -->

## Test your controller

Run the standalone diagnostic without starting an agent:

```sh
openmicro doctor
```

Follow the prompts, then add the generated `<vid>-<pid>-<transport>.json` file to `test/fixtures/controllers/` in a pull request. Run `npm run gen:controllers` to refresh this page. If you cannot open a pull request, paste the report into the [controller report issue template](../../issues/new?template=controller-report.yml).

If OpenMicro has no parser for your controller, `doctor` captures the raw input needed to add one.
