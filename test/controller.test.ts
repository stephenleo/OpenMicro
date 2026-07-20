import { EventEmitter } from 'node:events'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const hid = vi.hoisted(() => ({
  close: vi.fn(),
  construct: vi.fn(),
  devices: vi.fn(),
}))

vi.mock('node-hid', () => ({
  devices: hid.devices,
  HID: class extends EventEmitter {
    constructor(path: string) {
      super()
      hid.construct(path)
    }

    close(): void {
      hid.close()
    }
  },
}))

import { HidManager } from '../src/controller/index.js'

describe('HidManager lifecycle', () => {
  beforeEach(() => {
    vi.useRealTimers()
    hid.close.mockClear()
    hid.construct.mockClear()
    hid.devices.mockReset()
  })

  it('owns one device and releases it across idempotent start/stop cycles', () => {
    hid.devices.mockReturnValue([
      { path: 'test-pad', productId: 1, usage: 5, usagePage: 1, vendorId: 1 },
    ])
    const manager = new HidManager()

    manager.start()
    manager.start()
    expect(hid.construct).toHaveBeenCalledTimes(1)

    manager.stop()
    manager.stop()
    expect(hid.close).toHaveBeenCalledTimes(1)

    manager.start()
    expect(hid.construct).toHaveBeenCalledTimes(2)
    manager.stop()
    expect(hid.close).toHaveBeenCalledTimes(2)
  })

  it('stops reconnect polling', () => {
    vi.useFakeTimers()
    hid.devices.mockReturnValue([])
    const manager = new HidManager()

    manager.start()
    expect(hid.devices).toHaveBeenCalledTimes(1)
    manager.stop()
    vi.advanceTimersByTime(4000)

    expect(hid.devices).toHaveBeenCalledTimes(1)
  })
})
