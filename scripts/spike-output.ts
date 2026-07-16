// Hardware spike: connects to a DualSense via the existing HAL/driver stack,
// cycles the lightbar through the 5 agent-state colors, then walks the
// player LED bitmask. Run with: npx tsx scripts/spike-output.ts
//
// ponytail: throwaway verification script, not part of the app — no tests,
// no error recovery beyond logging.

import { createDriver } from '../src/controller/hid-manager.js'
import { STATE_COLOR } from '../src/feedback.js'
import type { ControllerEvent } from '../src/types.js'

const CONNECT_TIMEOUT_MS = 5000
const STEP_DELAY_MS = 1500

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function main(): Promise<void> {
  const driver = createDriver()
  if (!driver || driver.controllerType !== 'dualsense') {
    console.log(`No DualSense detected (found: ${driver?.controllerType ?? 'nothing'}).`)
    console.log('Hardware verification pending — plug in a DualSense and re-run.')
    return
  }

  const connected = new Promise<boolean>((resolve) => {
    const timer = setTimeout(() => resolve(false), CONNECT_TIMEOUT_MS)
    driver.on('data', (e: ControllerEvent) => {
      if (e.kind === 'connected') {
        clearTimeout(timer)
        resolve(true)
      }
    })
  })
  driver.start()

  if (!(await connected)) {
    console.log(`Timed out waiting for DualSense connection after ${CONNECT_TIMEOUT_MS}ms.`)
    driver.stop()
    return
  }
  console.log('DualSense connected.')

  const output = driver.output
  if (!output) {
    console.log('driver.output is undefined even though controllerType is dualsense — bug.')
    driver.stop()
    return
  }

  console.log('Cycling lightbar through state colors...')
  for (const [state, color] of Object.entries(STATE_COLOR)) {
    console.log(`  ${state}: rgb(${color.r}, ${color.g}, ${color.b})`)
    output.setLightbar(color)
    await sleep(STEP_DELAY_MS)
  }

  console.log('Walking player LED bitmask...')
  for (let i = 0; i < 5; i++) {
    const bitmask = 1 << i
    console.log(`  LED ${i}: bitmask 0b${bitmask.toString(2).padStart(5, '0')}`)
    output.setPlayerLeds(bitmask)
    await sleep(STEP_DELAY_MS)
  }
  console.log('All LEDs on, then off.')
  output.setPlayerLeds(0b11111)
  await sleep(STEP_DELAY_MS)
  output.setPlayerLeds(0)
  await sleep(200) // let the final report flush before disposing

  driver.stop()
  console.log('Done.')
}

main().catch((err: unknown) => {
  console.error(err)
  process.exitCode = 1
})
