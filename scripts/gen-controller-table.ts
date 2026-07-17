// Regenerates the "Community-tested controllers" table in CONTROLLERS.md from every
// fixture in test/fixtures/controllers/. The fixture files are the doctor's
// report output verbatim, so the table is a pure projection of committed data —
// deterministic (sorted by product) so a fixture PR that forgets to run
// `npm run gen:controllers` fails the freshness test in test/fixtures.test.ts.
//
// The generation logic is exported so the test can assert CONTROLLERS.md matches
// without shelling out.

import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
export const FIXTURES_DIR = join(HERE, '..', 'test', 'fixtures', 'controllers')
export const CONTROLLERS_PATH = join(HERE, '..', 'CONTROLLERS.md')
const START = '<!-- controllers:start -->'
const END = '<!-- controllers:end -->'

interface ControlResult {
  status: 'pass' | 'fail' | 'skip' | 'capture'
}

/** The subset of the doctor report the table depends on. */
export interface FixtureReport {
  controller: {
    vid: string
    pid: string
    product: string
    makeModel?: string
    transport: string
    driver: string
  }
  results: Record<string, ControlResult>
  output: Record<string, string> | 'unsupported'
}

/** Read and parse every fixture JSON file (sorted by filename for stable order). */
export function loadFixtures(dir: string = FIXTURES_DIR): FixtureReport[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')) as FixtureReport)
}

/** Count button results (anything not a raw capture) and how many passed. */
function buttonTally(results: Record<string, ControlResult>): { passed: number; total: number } {
  let passed = 0
  let total = 0
  for (const r of Object.values(results)) {
    if (r.status === 'capture') continue
    total += 1
    if (r.status === 'pass') passed += 1
  }
  return { passed, total }
}

/** Human-readable output-capability cell. */
function outputCell(output: FixtureReport['output']): string {
  if (output === 'unsupported') return 'none'
  const answers = Object.values(output).map((a) => a.toLowerCase())
  if (answers.length > 0 && answers.every((a) => a === 'y')) return 'lightbar+LEDs'
  return 'partial'
}

/** Roll a fixture up into an overall status badge. */
function statusBadge(report: FixtureReport): string {
  const { passed, total } = buttonTally(report.results)
  if (report.controller.driver === 'none' || total === 0) return '🔴 capture-only'
  const outputOk = report.output === 'unsupported' || outputCell(report.output) === 'lightbar+LEDs'
  return passed === total && outputOk ? '✅ full' : '🟡 partial'
}

/** Render the markdown table body (no surrounding markers), sorted by product name. */
export function renderTable(reports: FixtureReport[]): string {
  const header =
    '| Controller | Reports as | VID:PID | Connection | Driver | Buttons passed | Output | Status |\n' +
    '| --- | --- | --- | --- | --- | --- | --- | --- |'
  if (reports.length === 0) {
    return header + '\n| _none yet — run `openmicro doctor` and open a PR_ | | | | | | | |'
  }
  // Doctor prompts the tester for the real make/model; older fixtures without
  // the field fall back to the firmware product string.
  const named = [...reports].map((r) => {
    const c = r.controller
    const vidpid = `${c.vid.replace(/^0x/, '')}:${c.pid.replace(/^0x/, '')}`
    return { r, vidpid, name: c.makeModel ?? c.product }
  })
  const rows = named
    .sort((a, b) => a.name.localeCompare(b.name) || a.vidpid.localeCompare(b.vidpid))
    .map(({ r, vidpid, name }) => {
      const c = r.controller
      const { passed, total } = buttonTally(r.results)
      const buttons = total === 0 ? '—' : `${passed}/${total}`
      return `| ${name} | ${c.product} | ${vidpid} | ${c.transport} | ${c.driver} | ${buttons} | ${outputCell(r.output)} | ${statusBadge(r)} |`
    })
  return [header, ...rows].join('\n')
}

/** Replace the marker block in a controller document with a freshly rendered table. */
export function updateControllersDocument(document: string, table: string): string {
  const start = document.indexOf(START)
  const end = document.indexOf(END)
  if (start === -1 || end === -1 || end < start) {
    throw new Error(`CONTROLLERS.md markers ${START} / ${END} not found`)
  }
  return document.slice(0, start + START.length) + '\n' + table + '\n' + document.slice(end)
}

/**
 * Normalize a markdown table so cell padding/alignment doesn't matter — prettier
 * pads the committed document's columns, gen emits them tight. Compares on data.
 */
export function normalizeTable(table: string): string {
  return table
    .split('\n')
    .map((line) =>
      line
        .split('|')
        .map((cell) => {
          const t = cell.trim()
          return /^-+$/.test(t) ? '---' : t
        })
        .join('|'),
    )
    .join('\n')
    .trim()
}

/** Extract the current table text sitting between the markers (for the freshness test). */
export function extractTable(document: string): string {
  const start = document.indexOf(START)
  const end = document.indexOf(END)
  if (start === -1 || end === -1 || end < start) {
    throw new Error(`CONTROLLERS.md markers ${START} / ${END} not found`)
  }
  return document
    .slice(start + START.length, end)
    .replace(/^\n/, '')
    .replace(/\n$/, '')
}

/** CLI entry: rewrite CONTROLLERS.md in place. */
function main(): void {
  const document = readFileSync(CONTROLLERS_PATH, 'utf8')
  const updated = updateControllersDocument(document, renderTable(loadFixtures()))
  writeFileSync(CONTROLLERS_PATH, updated)
  console.log('Regenerated the community-tested controllers table in CONTROLLERS.md')
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main()
}
