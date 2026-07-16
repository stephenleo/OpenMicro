# Contributing to OpenMicro

Thanks for helping build the open Codex Micro replica. There are three ways in, from zero-code to core.

## 1. Test your controller (no code required)

The most valuable contribution: run the hardware diagnostic and submit the result.

```bash
npm i -g openmicro
openmicro doctor
```

It writes a report named by your controller's identity (e.g. `054c-0ce6-usb.json`). Open a PR adding that file to `test/fixtures/controllers/` — unedited — then run `npm run gen:controllers` so the README table includes your pad. CI replays your captured button presses through the parsers on every future build.

- If a fixture with the same filename already exists, your controller is already covered: your PR shows as an update to it. Newer full-pass reports are accepted; otherwise we'll close with thanks.
- If no driver recognized your pad, the doctor's capture-only output is exactly what a new driver needs — submit it anyway and note the model.
- Prefer not to PR? Paste the JSON into the [controller report issue](../../issues/new?template=controller-report.yml).

## 2. Add a harness (one file)

OpenMicro drives any agent CLI through the `Harness` interface — see "Adding a harness" in the README. A new harness is one file implementing `Harness` plus a registry entry; the core never needs to change. PRs should include the harness's `stateForHookEvent`/`resolveAction` unit tests (pure, no I/O) and note which actions return `null` (unsupported is fine — faked keybindings are not: verify every binding against the real CLI and cite the doc or help output).

## 3. Core changes

```bash
git clone https://github.com/stephenleo/OpenMicro && cd OpenMicro
npm install        # Node >= 22, macOS-first (native deps: node-hid, node-pty)
npm run verify     # typecheck + lint + format:check + tests — must be green
```

- Branch from `main`, keep PRs small and focused, and make `npm run verify` pass before pushing — CI runs the same gate on ubuntu and macos.
- New controller drivers are pure parse functions (`src/controller/*-driver.ts`) + a fixture; study `xbox-driver.ts` and its tests for the pattern.
- Hardware-behavior changes (lightbar, gestures, HID) should say in the PR what was verified on a physical pad vs. only in tests.
- No new dependencies without discussion — the runtime dep list is four packages and we like it that way.

## Releases (maintainers)

Version bumps ride a `release/vX.Y.Z` PR; merging + pushing the `vX.Y.Z` tag publishes to npm via trusted publishing and creates the GitHub release automatically. The release PR must also move the `Unreleased` section of `CHANGELOG.md` under a new `[X.Y.Z] - YYYY-MM-DD` heading — the workflow uses that section as the GitHub release notes.

## License

MIT. By contributing you agree your contributions are licensed under it.
