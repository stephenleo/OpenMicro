// Shared node-hid driver: opens a device and runs every report through a
// parse function. Xbox / DualShock 4 / generic drivers are just parse
// functions plus VID/PID lists — this class is the only HID plumbing.

import { EventEmitter } from 'node:events'
import { HID } from 'node-hid'
import { logger } from '../logger.js'
import type { ControllerHAL } from './hal.js'
import type { ControllerEvent, ControllerType } from '../types.js'

export class RawHidDriver extends EventEmitter implements ControllerHAL {
  private device: HID | null = null

  constructor(
    readonly controllerType: ControllerType,
    private readonly path: string,
    private readonly parse: (data: Buffer) => ControllerEvent[],
  ) {
    super()
  }

  start(): void {
    try {
      this.device = new HID(this.path)
      this.emit('data', {
        kind: 'connected',
        controllerType: this.controllerType,
      } satisfies ControllerEvent)
      logger.info(`${this.controllerType} controller connected`)

      this.device.on('data', (data: Buffer) => {
        try {
          // `report` carries the raw HID buffer that produced this batch of
          // events — `openmicro doctor` listens for it to capture fixtures.
          // Normal runtime consumers ignore it. Emitted before the parsed
          // events so a synchronous `data` listener can read the last report.
          this.emit('report', data)
          for (const event of this.parse(data)) this.emit('data', event)
        } catch (err) {
          logger.error(`${this.controllerType} HID parse error`, err)
        }
      })
      this.device.on('error', (err: Error) => {
        logger.error(`${this.controllerType} HID device error`, err)
        this.emit('data', { kind: 'disconnected' } satisfies ControllerEvent)
      })
    } catch (err) {
      logger.error(`${this.controllerType} driver start failed`, err)
      // Surface the failure so HidManager resumes polling and doctor's
      // connect wait fails fast instead of walking a dead checklist.
      this.emit('data', { kind: 'disconnected' } satisfies ControllerEvent)
    }
  }

  stop(): void {
    try {
      this.device?.close()
    } catch (err) {
      logger.error(`${this.controllerType} driver stop failed`, err)
    }
    this.device = null
  }
}
