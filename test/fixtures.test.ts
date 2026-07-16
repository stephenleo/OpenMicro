// Community controller fixtures. Each file in test/fixtures/controllers/ is a
// verbatim `openmicro doctor` report. This suite:
//   1. replays every captured raw report through the matching parse function
//      and asserts the expected control's press event fires — so a new fixture
//      dropped in by a contributor gets CI coverage with zero test edits;
//   2. asserts README's generated controller table is up to date, so a fixture
//      PR that forgets `npm run gen:controllers` fails with a clear message.
//
// DualSense fixtures are skipped for replay: that parsing lives in dualsense-ts,
// and the doctor records no raw reports for it.

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parseDs4Report } from '../src/controller/ds4-driver.js'
import { parseGenericReport } from '../src/controller/generic-driver.js'
import { parseXboxReport } from '../src/controller/xbox-driver.js'
import type { ControllerEvent } from '../src/types.js'
import {
  README_PATH,
  extractTable,
  loadFixtures,
  normalizeTable,
  renderTable,
} from '../scripts/gen-controller-table.js'

// Fixtures carry the full report; this is the slice the replay needs (per-control captures).
interface Capture {
  pressed: string
  idle: string
}
interface ReplayFixture {
  controller: { vid: string; pid: string; product: string; transport: string; driver: string }
  results: Record<string, { status: string; capture?: Capture }>
}

const PARSERS: Record<string, (data: Buffer) => ControllerEvent[]> = {
  xbox: parseXboxReport,
  ds4: parseDs4Report,
  generic: parseGenericReport,
}

const fixtures = loadFixtures() as unknown as ReplayFixture[]

describe('controller fixtures replay through their parse function', () => {
  it('has at least one committed fixture', () => {
    expect(fixtures.length).toBeGreaterThan(0)
  })

  it('has no duplicate controller identities (vid+pid+transport is the dedup key)', () => {
    const keys = fixtures.map(
      (f) => `${f.controller.vid}-${f.controller.pid}-${f.controller.transport}`,
    )
    const dupes = keys.filter((k, i) => keys.indexOf(k) !== i)
    expect(
      dupes,
      `duplicate fixture(s) for: ${dupes.join(', ')} — update the existing file`,
    ).toEqual([])
  })

  for (const fixture of fixtures) {
    const { driver, product } = fixture.controller
    const parse = PARSERS[driver]
    // dualsense (parser lives in dualsense-ts) and capture-only 'none' have no
    // replayable parse function.
    if (!parse) continue

    for (const [control, result] of Object.entries(fixture.results)) {
      if (!result.capture) continue
      it(`${product}: ${control} press replays through ${driver}`, () => {
        const events = parse(Buffer.from(result.capture!.pressed, 'hex'))
        const hit = events.find((e) => e.kind === 'button' && e.button === control && e.pressed)
        expect(hit, `expected ${control} pressed in replayed ${driver} report`).toBeTruthy()
      })
    }
  }
})

describe('README controller table', () => {
  it('is up to date (run: npm run gen:controllers)', () => {
    const readme = readFileSync(README_PATH, 'utf8')
    expect(normalizeTable(extractTable(readme))).toBe(normalizeTable(renderTable(loadFixtures())))
  })
})
