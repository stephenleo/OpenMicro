// Command-line parsing: `openmicro [claude|codex] [...userArgs]`.
//
// The first token is a harness kind only when it is a bare word (not a flag);
// otherwise everything is passed straight to the default harness (claude). The
// kind is NOT validated here — the cli resolves it via harnessFor, which throws
// a clear "unknown harness" error listing the registered kinds.

export interface ParsedInvocation {
  /** Harness kind to run. Defaults to 'claude'. Validated later by harnessFor. */
  kind: string
  /** Arguments forwarded verbatim to the agent CLI. */
  agentArgs: string[]
  /** True when `--help`/`-h` was requested (cli prints usage and exits). */
  help: boolean
}

const DEFAULT_KIND = 'claude'

/**
 * Parse process argv (already sliced past node + script).
 *
 * Args:
 *     args (string[]): Raw user arguments.
 *
 * Returns:
 *     ParsedInvocation: kind + forwarded args + help flag.
 */
export function parseInvocation(args: string[]): ParsedInvocation {
  if (args[0] === '--help' || args[0] === '-h') {
    return { kind: DEFAULT_KIND, agentArgs: [], help: true }
  }
  // A leading bare word names the harness; a leading flag (or nothing) means
  // "default harness, these are its args".
  if (args.length > 0 && args[0] !== undefined && !args[0].startsWith('-')) {
    return { kind: args[0], agentArgs: args.slice(1), help: false }
  }
  return { kind: DEFAULT_KIND, agentArgs: args, help: false }
}

export const USAGE = `openmicro — drive an AI agent CLI with a game controller.

Usage:
  openmicro [claude|codex] [...agent args]   Wrap the agent CLI (default: claude)
  openmicro --help                           Show this message

The first instance to start becomes the host: it owns the controller and
aggregates agent state. Later instances register as clients and receive
forwarded keystrokes. Remap controls in ~/.openmicro/config.json.`
