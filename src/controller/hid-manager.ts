// Device detection, driver factory, and reconnect lifecycle. Exposes a single
// deduplicated ControllerEvent stream regardless of which driver is active.

import { EventEmitter } from 'node:events'
import { devices as hidDevices } from 'node-hid'
import type { Device } from 'node-hid'
import { logger } from '../logger.js'
import { Deduper } from './hal.js'
import type { ControllerHAL } from './hal.js'
import type { ControllerOutput } from './output.js'
import { DualSenseDriver } from './dualsense-driver.js'
import { DS4_PIDS, DS4_VID, parseDs4Report } from './ds4-driver.js'
import { parseGenericReport } from './generic-driver.js'
import { RawHidDriver } from './raw-hid-driver.js'
import { parseXboxReport, XBOX_PIDS, XBOX_VID } from './xbox-driver.js'
import type { ControllerEvent } from '../types.js'

export const DUALSENSE_VID = 0x054c
export const DUALSENSE_PIDS = [0x0ce6, 0x0df2] // DualSense, DualSense Edge

const RECONNECT_POLL_MS = 2000

/** Detect the best matching device: DualSense > DS4 > Xbox > generic gamepad. */
export function createDriver(): ControllerHAL | null {
  let devices: Device[]
  try {
    devices = hidDevices()
  } catch (err) {
    logger.error('HID enumeration failed', err)
    return null
  }

  if (devices.some((d) => d.vendorId === DUALSENSE_VID && DUALSENSE_PIDS.includes(d.productId))) {
    return new DualSenseDriver()
  }
  const ds4 = devices.find((d) => d.vendorId === DS4_VID && DS4_PIDS.includes(d.productId))
  if (ds4?.path) {
    return new RawHidDriver('ds4', ds4.path, parseDs4Report)
  }
  const xbox = devices.find((d) => d.vendorId === XBOX_VID && XBOX_PIDS.includes(d.productId))
  if (xbox?.path) {
    return new RawHidDriver('xbox', xbox.path, parseXboxReport)
  }
  const generic = devices.find(
    (d) => d.usagePage === 0x01 && (d.usage === 0x04 || d.usage === 0x05) && d.path,
  )
  if (generic?.path) {
    logger.warn('Unknown controller, using generic HID driver')
    return new RawHidDriver('generic-hid', generic.path, parseGenericReport)
  }
  return null
}

/**
 * Emits deduplicated ControllerEvents on 'data'. Polls for a controller until
 * one appears, and resumes polling after a disconnect — plugging a controller
 * in or waking it mid-session just works.
 */
export class HidManager extends EventEmitter {
  private driver: ControllerHAL | null = null
  private deduper = new Deduper()
  private pollTimer: ReturnType<typeof setInterval> | null = null
  private stopped = false

  /** Live output surface of the active driver (DualSense only), or undefined. */
  get output(): ControllerOutput | undefined {
    return this.driver?.output
  }

  start(): void {
    this.stopped = false
    this.attach()
  }

  stop(): void {
    this.stopped = true
    if (this.pollTimer) clearInterval(this.pollTimer)
    this.pollTimer = null
    this.driver?.stop()
    this.driver = null
  }

  private attach(): void {
    if (this.stopped) return
    this.driver = createDriver()
    if (!this.driver) {
      this.pollUntilFound()
      return
    }
    this.deduper = new Deduper()
    this.driver.on('data', (e: ControllerEvent) => {
      const filtered = this.deduper.filter(e)
      if (!filtered) return
      this.emit('data', filtered)
      if (filtered.kind === 'disconnected') {
        this.driver?.stop()
        this.driver = null
        this.pollUntilFound()
      }
    })
    this.driver.start()
  }

  private pollUntilFound(): void {
    if (this.pollTimer || this.stopped) return
    logger.info('No controller found — polling')
    this.pollTimer = setInterval(() => {
      if (createDriver()) {
        clearInterval(this.pollTimer!)
        this.pollTimer = null
        this.attach()
      }
    }, RECONNECT_POLL_MS)
    this.pollTimer.unref()
  }
}
