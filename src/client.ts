// Client-instance side of the singleton: when another openmicro already owns
// the port, this instance registers itself and receives forwarded keystrokes
// for its own pty over SSE.

import { logger } from './logger.js'
import { HOST_URL } from './ports.js'

/** True if the process listening on the singleton port is an openmicro host. */
export async function isOpenmicroHost(): Promise<boolean> {
  try {
    const res = await fetch(`${HOST_URL}/health`, { signal: AbortSignal.timeout(1000) })
    const body = (await res.json()) as { app?: string }
    return body.app === 'openmicro'
  } catch {
    return false
  }
}

/**
 * Register with the host and stream forwarded keystrokes into `write`.
 *
 * Args:
 *     wrapperId (string): This instance's OPENMICRO_INSTANCE_ID, for hook ownership.
 *     kind (string): Harness kind, so the host classifies this session's hooks correctly.
 *     write (function): Sink for decoded keystroke bytes (this instance's pty).
 *
 * Returns:
 *     Promise<void>: Resolves when the host connection closes (host exited).
 */
export async function runAsClient(
  wrapperId: string,
  kind: string,
  write: (bytes: string) => void,
): Promise<void> {
  const registration = await fetch(`${HOST_URL}/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cwd: process.cwd(), pid: process.pid, wrapperId, kind }),
  })
  const { instanceId } = (await registration.json()) as { instanceId: string }
  logger.info('running as client instance', { instanceId, kind })

  const stream = await fetch(`${HOST_URL}/instance/${instanceId}`)
  if (!stream.body) return

  const decoder = new TextDecoder()
  let buffer = ''
  for await (const chunk of stream.body) {
    buffer += decoder.decode(chunk as Uint8Array, { stream: true })
    let sep
    while ((sep = buffer.indexOf('\n\n')) !== -1) {
      const frame = buffer.slice(0, sep)
      buffer = buffer.slice(sep + 2)
      const data = frame
        .split('\n')
        .filter((l) => l.startsWith('data: '))
        .map((l) => l.slice(6))
        .join('')
      if (!data) continue
      try {
        const msg = JSON.parse(data) as { type?: string; data?: string }
        if (msg.type === 'keys' && msg.data) {
          write(Buffer.from(msg.data, 'base64').toString('utf8'))
        }
      } catch (err) {
        logger.warn('client: bad frame from host', err)
      }
    }
  }
  logger.info('host connection closed')
}
