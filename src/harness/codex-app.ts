// Codex macOS desktop app harness (/Applications/Codex.app, AppleScript name
// "Codex", bundle com.openai.codex). GUI harness: no pty is spawned. Actions
// resolve to tagged strings that execute() turns into `open` deep links or
// System Events keystrokes into the frontmost Codex window.

import { execFile } from 'node:child_process'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import { installCodexHooks } from '../hooks-install.js'
import { logger } from '../logger.js'
import { codexHarness } from './codex.js'
import type { Action, AgentState, Harness } from './types.js'

// Terminal byte sequences with a System Events equivalent — lets the default
// layer's `keys` bindings (d-pad arrows, Shift+Tab clear/cycle, Ctrl+U) drive
// the app. Sequences without an entry resolve to null (no GUI meaning).
const KEY_EQUIVALENTS: Record<string, string> = {
  '\x1b[A': 'key code 126', // up arrow
  '\x1b[B': 'key code 125', // down arrow
  '\x1b[C': 'key code 124', // right arrow
  '\x1b[D': 'key code 123', // left arrow
  '\x1b[Z': 'key code 48 using shift down', // Shift+Tab
  // Clear the input line. Electron text boxes ignore Cocoa's Ctrl+U kill-line,
  // so select-all + delete (newline = sequential System Events statements).
  '\x15': 'keystroke "a" using command down\nkey code 51',
}

// Whether the dictation key chord is currently held down (see push_to_talk).
let dictationHeld = false

// ── Desktop thread/project cycling ──────────────────────────────────────────
// The app has Next/Previous Chat shortcuts but they stop at the list ends and
// there is no project-switch shortcut at all. Instead, read the app's thread
// catalog from the shared ~/.codex/state_5.sqlite (archived=0, non-subagent —
// verified to match the sidebar's per-project chat lists exactly) and jump
// directly via the app's copyDeeplink format (codex://threads/<id>) —
// wrap-around for free.

export interface DesktopThread {
  id: string
  cwd: string
  /** Last-activity ms (the app's recency column) — orders projects, not threads. */
  mtime: number
}

/** Touchpad/LT cursor into the desktop thread list. */
export interface DesktopCursor {
  threadId: string | null
  cwd: string | null
}

// ponytail: best-effort cursor. Threads the user opens by clicking in the app
// go unseen here, so the next press resumes from the last controller pick.
const cursor: DesktopCursor = { threadId: null, cwd: null }

/**
 * List the desktop app's visible threads from its thread catalog db.
 *
 * Args:
 *     dbPath (string): Path to the catalog. Defaults to ~/.codex/state_5.sqlite.
 *
 * Returns:
 *     DesktopThread[]: Non-archived, non-subagent threads, newest-created first (stable UUIDv7 order).
 */
export function scanDesktopThreads(
  dbPath: string = path.join(os.homedir(), '.codex', 'state_5.sqlite'),
): DesktopThread[] {
  try {
    // Lazy-require: node:sqlite is flagless only on Node 23.4+. On older
    // runtimes this throws and thread/project cycling degrades to a no-op.
    const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as {
      DatabaseSync: new (
        path: string,
        options: { readOnly: boolean },
      ) => {
        prepare(sql: string): { all(): unknown[] }
        close(): void
      }
    }
    const db = new DatabaseSync(dbPath, { readOnly: true })
    try {
      // id is UUIDv7 (creation-ordered) — a stable sort key, unlike recency,
      // which our own deep-link opens would reshuffle mid-cycle.
      const rows = db
        .prepare(
          `SELECT id, cwd, COALESCE(recency_at_ms, updated_at * 1000) AS recency
           FROM threads
           WHERE archived = 0 AND source NOT LIKE '{%'
           ORDER BY id DESC`,
        )
        .all() as { id: string; cwd: string; recency: number }[]
      return rows.map((r) => ({ id: r.id, cwd: r.cwd, mtime: r.recency }))
    } finally {
      db.close()
    }
  } catch {
    return []
  }
}

/**
 * Advance the cursor to the next thread within the current project (wrapping).
 *
 * Args:
 *     threads (DesktopThread[]): Threads newest-first from scanDesktopThreads.
 *     cur (DesktopCursor): Cursor to advance. Defaults to the module cursor.
 *
 * Returns:
 *     DesktopThread | null: The thread to open, or null when there are none.
 */
export function cycleThread(
  threads: DesktopThread[],
  cur: DesktopCursor = cursor,
): DesktopThread | null {
  if (threads.length === 0) return null
  const cwd = cur.cwd ?? threads[0]!.cwd
  const scoped = threads.filter((t) => t.cwd === cwd)
  const list = scoped.length > 0 ? scoped : threads
  const index = list.findIndex((t) => t.id === cur.threadId)
  const next = list[(index + 1) % list.length]!
  cur.threadId = next.id
  cur.cwd = next.cwd
  return next
}

/**
 * Advance the cursor to the next project's most recent thread (wrapping).
 *
 * Args:
 *     threads (DesktopThread[]): Threads newest-first from scanDesktopThreads.
 *     cur (DesktopCursor): Cursor to advance. Defaults to the module cursor.
 *
 * Returns:
 *     DesktopThread | null: The thread to open, or null when there are none.
 */
export function cycleProject(
  threads: DesktopThread[],
  cur: DesktopCursor = cursor,
): DesktopThread | null {
  if (threads.length === 0) return null
  // Projects ordered by last activity, most recent first: active projects sit
  // 1-2 presses apart, stale ones trail at the end of the ring and age out as
  // usage shifts. ponytail: the app's sidebar project list is account-synced
  // and unreadable locally, so rarely-used projects with visible chats still
  // appear late in the cycle.
  const latest = new Map<string, number>()
  for (const t of threads) {
    if (t.mtime > (latest.get(t.cwd) ?? -1)) latest.set(t.cwd, t.mtime)
  }
  const cwds = [...latest.keys()].sort((a, b) => latest.get(b)! - latest.get(a)!)
  // No cursor yet: assume the user sits in the first (most active) project so
  // the first press visibly switches away from it.
  const index = cur.cwd === null ? 0 : cwds.indexOf(cur.cwd)
  const nextCwd = cwds[(index + 1) % cwds.length]!
  const next = threads.find((t) => t.cwd === nextCwd)!
  cur.threadId = next.id
  cur.cwd = next.cwd
  return next
}

export const codexAppHarness: Harness = {
  kind: 'codex-app',
  usesPty: false,
  // No pty is spawned; instead the cli runs command+buildArgs once at startup
  // to launch/activate the app, mirroring how pty harnesses launch their CLI.
  command: 'open',
  buildArgs(): string[] {
    return ['-a', 'Codex']
  },

  installHooks() {
    // The desktop app shares ~/.codex with the CLI: if the app fires the
    // hooks.json lifecycle hooks, state feedback works for free; if it does
    // not, the tracker stays empty and LEDs degrade to the layer color.
    const result = installCodexHooks()
    return {
      changed: result === 'changed',
      trustNotice:
        result === 'changed'
          ? 'openmicro: Codex hooks changed — open /hooks in Codex and trust the openmicro hooks'
          : null,
    }
  },

  stateForHookEvent(event: string, payload: unknown): AgentState | null {
    // Same ~/.codex hook contract as the CLI — delegate the mapping.
    return codexHarness.stateForHookEvent(event, payload)
  },

  resolveAction(action: Action, _ctx: { thinkingLevel: number }) {
    switch (action.type) {
      case 'accept':
        return { bytes: 'osascript:keystroke return' }
      case 'push_to_talk':
        // Ctrl+Shift+D = the app's composer.startDictation binding, and it is
        // hold-to-dictate: dictation runs only while the keys stay down, so an
        // instantaneous press+release starts and stops it in the same moment.
        // Emulate the hold — first press holds the keys down, second press
        // releases them (verified live: mic engages while held, transcript
        // inserts on release).
        // ponytail: module state; if the process dies mid-hold the keys stay
        // down until the user taps them physically. Upgrade path: plumb
        // controller press/release through dispatch for true push-to-talk.
        dictationHeld = !dictationHeld
        return dictationHeld
          ? { bytes: 'osascript:key down control\nkey down shift\nkey down "d"' }
          : { bytes: 'osascript:key up "d"\nkey up shift\nkey up control' }
      case 'new_chat':
        // codex://threads/new, not codex://new — the app's deep-link parser
        // drops a bare codex://new (it requires a prompt/path/originUrl query
        // param); only the threads/new form falls back to a plain new thread.
        return { bytes: 'open:codex://threads/new' }
      case 'prompt':
        // Deep link prefills the composer but does NOT auto-send — the user
        // follows with accept.
        return { bytes: 'open:codex://new?prompt=' + encodeURIComponent(action.text) }
      case 'reject':
        return { bytes: 'osascript:key code 53' } // Esc — stop generation / dismiss
      case 'thinking_depth':
        // The app ships unassigned "Increase/Decrease reasoning effort"
        // shortcuts (Settings → Keyboard shortcuts). Users assign + and -
        // once (see README); assignments are account-synced with no local
        // store, so openmicro cannot set them at install time.
        return action.delta > 0
          ? { bytes: 'osascript:keystroke "+"' }
          : { bytes: 'osascript:keystroke "-"' }
      case 'focus_session': {
        // Touchpad: cycle the current project's chats with wrap-around.
        const next = cycleThread(scanDesktopThreads())
        return next ? { bytes: `open:codex://threads/${next.id}` } : null
      }
      case 'herdr_space': {
        // LT: jump to the next project's most recent chat (wrapping).
        const next = cycleProject(scanDesktopThreads())
        return next ? { bytes: `open:codex://threads/${next.id}` } : null
      }
      case 'keys': {
        const equivalent = KEY_EQUIVALENTS[action.bytes]
        return equivalent ? { bytes: `osascript:${equivalent}` } : null
      }
      default:
        return null // workflow/layer never reach a harness
    }
  },

  execute(bytes: string): void {
    const sep = bytes.indexOf(':')
    if (sep < 0) return // untagged bytes (e.g. a raw '\x03') have no GUI meaning
    const tag = bytes.slice(0, sep)
    const payload = bytes.slice(sep + 1)
    // Arg arrays only, never a shell string (prompt text must not be
    // shell-interpretable). Failures print to the terminal — the terminal is
    // ours in GUI mode, and a silently dropped keystroke is undebuggable.
    const report = (err: Error | null, stderr?: string): void => {
      if (!err) return
      logger.warn('codex-app command failed', stderr || err.message)
      console.error(
        `\x1b[31m●\x1b[0m ${(stderr || err.message).trim()} — if this is a permission error, allow your terminal under System Settings → Privacy & Security → Accessibility and Automation`,
      )
    }
    if (tag === 'open') {
      execFile('open', [payload], (err) => report(err))
    } else if (tag === 'osascript') {
      // System Events keystrokes require the terminal to have Accessibility /
      // Automation permission. A newline in the payload runs as sequential
      // System Events statements (e.g. select-all then delete).
      const steps = payload
        .split('\n')
        .flatMap((step) => ['-e', `tell application "System Events" to ${step}`])
      // The short delay lets activation land before the keystroke — without it
      // a keypress sent while Codex is still coming frontmost is dropped.
      execFile(
        'osascript',
        ['-e', 'tell application "Codex" to activate', '-e', 'delay 0.15', ...steps],
        (err, _stdout, stderr) => report(err, stderr),
      )
    }
  },
}
