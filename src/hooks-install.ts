// Idempotent hook registration for Claude Code (~/.claude/settings.json) and
// Codex (~/.codex/hooks.json). Merge/purge/atomic-write logic ported from
// vibesense. The hook command is a curl POST that no-ops harmlessly when
// open-micro isn't running, so hooks never need uninstalling.
//
// COEXISTENCE WITH VIBESENSE: vibesense's Claude installer identifies "its own"
// entries by the bare substring `/hook/` and purges everything matching it. If
// open-micro used `/hook/` too, vibesense would delete our entries on its next
// run. So open-micro posts to `/om-hook/` (HOOK_PATH) — which does NOT contain
// the substring `/hook/` — and identifies its own entries by the full base-URL
// marker `127.0.0.1:48762/om-hook/`. Neither tool matches the other's entries.

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { logger } from './logger.js'
import { HOST_PORT, HOOK_URL } from './ports.js'

interface HookEntry {
  type: string
  command: string
}

interface HookGroup {
  matcher?: string
  hooks: HookEntry[]
}

interface HookSettings {
  hooks?: Record<string, HookGroup[] | undefined>
  [key: string]: unknown
}

export type HookWriteResult = 'changed' | 'unchanged' | 'failed'

interface HookFileOptions {
  target: string
  temporaryPath: string
  parseWarning: string
  writeWarning: string
  successMessage: string
  merge(settings: HookSettings): boolean
}

/** Shared read/merge/atomic-write lifecycle for every harness hook file. */
function updateHookFile(options: HookFileOptions): HookWriteResult {
  let settings: HookSettings = {}
  try {
    settings = JSON.parse(fs.readFileSync(options.target, 'utf8')) as HookSettings
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      logger.warn(options.parseWarning, err)
      return 'failed'
    }
  }

  if (!options.merge(settings)) return 'unchanged'

  try {
    fs.mkdirSync(path.dirname(options.target), { recursive: true })
    fs.writeFileSync(options.temporaryPath, JSON.stringify(settings, null, 2) + '\n', 'utf8')
    fs.renameSync(options.temporaryPath, options.target)
    logger.info(options.successMessage, { target: options.target })
    return 'changed'
  } catch (err) {
    try {
      fs.unlinkSync(options.temporaryPath)
    } catch {
      // Nothing to clean up.
    }
    logger.warn(options.writeWarning, err)
    return 'failed'
  }
}

// Full base-URL marker: recognizes our own entries on re-runs without matching
// vibesense's (different port) or any bare `/hook/` webhook.
const COMMAND_MARKER = `127.0.0.1:${HOST_PORT}${new URL(HOOK_URL).pathname}`

function hookCommand(event: string): string {
  return `curl -s --max-time 1 -X POST ${HOOK_URL}${event} -H 'Content-Type: application/json' -d @- >/dev/null 2>&1 || true`
}

/** Event name → matcher (undefined = all). PreToolUse only fires for AskUserQuestion. */
const HOOK_EVENTS: Record<string, string | undefined> = {
  UserPromptSubmit: undefined,
  Stop: undefined,
  Notification: undefined,
  PreToolUse: 'AskUserQuestion',
  PostToolUse: undefined, // resume signal after question answers / permission grants
  SessionEnd: undefined,
}

function isOurs(group: HookGroup): boolean {
  return (
    group.hooks?.some((h) => typeof h.command === 'string' && h.command.includes(COMMAND_MARKER)) ??
    false
  )
}

/**
 * Merge open-micro Claude hook entries into settingsPath (default
 * ~/.claude/settings.json), replacing stale open-micro entries and preserving
 * everything else. Atomic write via tmp + rename. Never throws.
 *
 * Args:
 *     settingsPath (string | undefined): Override target path (tests). Defaults to ~/.claude/settings.json.
 *
 * Returns:
 *     HookWriteResult: 'changed' | 'unchanged' | 'failed'.
 */
export function installClaudeHooks(settingsPath?: string): HookWriteResult {
  const target = settingsPath ?? path.join(os.homedir(), '.claude', 'settings.json')

  return updateHookFile({
    target,
    temporaryPath: `${target}.open-micro-tmp`,
    parseWarning: 'hooks-install: could not parse settings.json — leaving it untouched',
    writeWarning: 'hooks-install: failed to write settings.json',
    successMessage: 'hooks-install: Claude Code hooks registered',
    merge(settings) {
      if (!settings.hooks || typeof settings.hooks !== 'object') settings.hooks = {}

      let changed = false
      for (const [event, matcher] of Object.entries(HOOK_EVENTS)) {
        const groups = (settings.hooks[event] ?? []).filter((g) => g && Array.isArray(g.hooks))
        const foreign = groups.filter((g) => !isOurs(g))
        const desired: HookGroup = {
          ...(matcher !== undefined ? { matcher } : {}),
          hooks: [{ type: 'command', command: hookCommand(event) }],
        }
        const existingOurs = groups.filter(isOurs)
        const upToDate =
          existingOurs.length === 1 && JSON.stringify(existingOurs[0]) === JSON.stringify(desired)
        if (!upToDate) {
          settings.hooks[event] = [...foreign, desired]
          changed = true
        }
      }
      return changed
    },
  })
}

const CODEX_HOOK_EVENTS = ['UserPromptSubmit', 'PermissionRequest', 'PostToolUse', 'Stop'] as const
const OM_HEADER = 'X-Open-Micro-Instance-Id'

function codexHookCommand(event: string): string {
  return `curl -s --max-time 1 -X POST ${HOOK_URL}${event} -H 'Content-Type: application/json' -H "${OM_HEADER}: $OPEN_MICRO_INSTANCE_ID" -d @- >/dev/null 2>&1 || true; printf '{}'`
}

function isCodexOurs(group: unknown): boolean {
  if (!group || typeof group !== 'object') return false
  const hooks = (group as { hooks?: unknown }).hooks
  if (!Array.isArray(hooks)) return false
  return hooks.some((hook: unknown) => {
    if (!hook || typeof hook !== 'object') return false
    const command = (hook as { command?: unknown }).command
    return (
      typeof command === 'string' &&
      (command.includes(OM_HEADER) || command.includes(COMMAND_MARKER))
    )
  })
}

/**
 * Register Codex hooks. Codex trust is definition-hash based, so unchanged
 * input must produce no write at all.
 *
 * Args:
 *     hooksPath (string | undefined): Override target path (tests). Defaults to $CODEX_HOME/hooks.json.
 *
 * Returns:
 *     HookWriteResult: 'changed' | 'unchanged' | 'failed'.
 */
export function installCodexHooks(hooksPath?: string): HookWriteResult {
  const codexHome = process.env.CODEX_HOME ?? path.join(os.homedir(), '.codex')
  const target = hooksPath ?? path.join(codexHome, 'hooks.json')

  return updateHookFile({
    target,
    temporaryPath: `${target}.${process.pid}.open-micro-tmp`,
    parseWarning: 'hooks-install: could not parse Codex hooks.json — leaving it untouched',
    writeWarning: 'hooks-install: failed to write Codex hooks.json',
    successMessage: 'hooks-install: Codex hooks registered',
    merge(settings) {
      if (!settings.hooks || typeof settings.hooks !== 'object') settings.hooks = {}
      const before = JSON.stringify(settings)

      // Purge only positively identified open-micro entries. Preserve every
      // foreign array element verbatim, including extension shapes we do not know.
      for (const [event, value] of Object.entries(settings.hooks)) {
        if (!Array.isArray(value)) continue
        const foreign = value.filter((group) => !isCodexOurs(group))
        if (foreign.length > 0) {
          settings.hooks[event] = foreign as HookGroup[]
        } else {
          delete settings.hooks[event]
        }
      }

      for (const event of CODEX_HOOK_EVENTS) {
        const groups = Array.isArray(settings.hooks[event]) ? settings.hooks[event] : []
        settings.hooks[event] = [
          ...groups,
          { hooks: [{ type: 'command', command: codexHookCommand(event) }] },
        ]
      }

      return JSON.stringify(settings) !== before
    },
  })
}
