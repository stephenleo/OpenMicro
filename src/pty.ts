// Spawns the selected agent under a pty and passes its TUI through untouched: user
// keyboard → pty, pty output → stdout, window resizes forwarded. Controller
// keystrokes are just extra writes into the same pty.

import fs from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import * as pty from 'node-pty'
import { logger } from './logger.js'

// node-pty's npm tarball ships spawn-helper without the exec bit, and the
// package.json postinstall chmod can't reach it when npm hoists node-pty out
// of our own node_modules (npx, install-as-dependency). Fix it here, where
// require() tells us where node-pty actually resolved to. Best effort: the
// postinstall still covers root-owned global installs this can't write to.
export function fixSpawnHelperPermissions(prebuildsDir?: string): void {
  try {
    const dir =
      prebuildsDir ??
      path.join(
        path.dirname(createRequire(import.meta.url).resolve('node-pty/package.json')),
        'prebuilds',
      )
    for (const entry of fs.readdirSync(dir)) {
      const helper = path.join(dir, entry, 'spawn-helper')
      if (fs.existsSync(helper)) fs.chmodSync(helper, 0o755)
    }
  } catch {
    // no prebuilds (built from source) or no write permission — if the exec
    // bit is genuinely missing, pty.spawn will surface the failure.
  }
}

type PtySpawner = typeof pty.spawn

export function spawnAgentProcess(
  spawnPty: PtySpawner,
  command: string,
  args: string[],
  wrapperId: string | undefined,
): pty.IPty {
  const env = { ...process.env } as Record<string, string>
  // herdr's own agent integration hooks (e.g. ~/.claude/hooks/herdr-agent-state.sh)
  // gate on HERDR_ENV=1. If the wrapped agent runs them, it claims the herdr
  // pane's session as herdr:<agent>, and herdr then silently drops every
  // report from any other source — including openmicro's state reports
  // (session-owner conflict; herdr can't verify "openmicro" as a takeover
  // agent). Hide HERDR_ENV from the child so only openmicro reports for the
  // pane. HERDR_PANE_ID stays: openmicro's hook curls echo it back to us.
  delete env.HERDR_ENV
  if (wrapperId) env.OPENMICRO_INSTANCE_ID = wrapperId
  return spawnPty(command, args, {
    name: process.env.TERM ?? 'xterm-256color',
    cols: process.stdout.columns,
    rows: process.stdout.rows,
    cwd: process.cwd(),
    env,
  })
}

export class AgentPty {
  private proc: pty.IPty

  constructor(
    command: string,
    args: string[],
    wrapperId: string | undefined,
    onExit: (code: number) => void,
  ) {
    fixSpawnHelperPermissions()
    this.proc = spawnAgentProcess(pty.spawn, command, args, wrapperId)

    this.proc.onData((data) => process.stdout.write(data))
    this.proc.onExit(({ exitCode }) => onExit(exitCode))

    if (process.stdin.isTTY) process.stdin.setRawMode(true)
    process.stdin.on('data', (data: Buffer) => this.proc.write(data.toString('utf8')))

    process.stdout.on('resize', () => {
      try {
        this.proc.resize(process.stdout.columns, process.stdout.rows)
      } catch (err) {
        logger.warn('pty resize failed', err)
      }
    })
  }

  write(data: string): void {
    this.proc.write(data)
  }

  dispose(): void {
    if (process.stdin.isTTY) process.stdin.setRawMode(false)
    process.stdin.pause()
    try {
      this.proc.kill()
    } catch {
      // already dead
    }
  }
}
