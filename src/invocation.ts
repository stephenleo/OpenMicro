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
  /** True when `--version`/`-V` was requested (cli prints openmicro's version and exits). */
  version: boolean
  /** True when the `doctor` subcommand was requested (cli runs the diagnostic and exits). */
  doctor: boolean
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
  const base = { kind: DEFAULT_KIND, agentArgs: [], help: false, version: false, doctor: false }
  if (args[0] === '--help' || args[0] === '-h') {
    return { ...base, help: true }
  }
  // Leading --version/-V reports openmicro's own version. To query the agent's
  // instead, name it: `openmicro claude --version`.
  if (args[0] === '--version' || args[0] === '-V' || args[0] === '-v') {
    return { ...base, version: true }
  }
  if (args[0] === 'doctor') {
    return { ...base, doctor: true }
  }
  // A leading bare word names the harness; a leading flag (or nothing) means
  // "default harness, these are its args".
  if (args.length > 0 && args[0] !== undefined && !args[0].startsWith('-')) {
    return { ...base, kind: args[0], agentArgs: args.slice(1) }
  }
  return { ...base, agentArgs: args }
}

export const USAGE = `openmicro — drive an AI agent CLI with a game controller.

Usage:
  openmicro [claude|codex] [...agent args]   Wrap the agent CLI (default: claude)
  openmicro doctor                           Diagnose your controller, write a report
  openmicro --version                        Show openmicro's version
  openmicro --help                           Show this message

The first instance to start becomes the host: it owns the controller and
aggregates agent state. Later instances register as clients and receive
forwarded keystrokes. Remap controls in ~/.openmicro/config.json.`
