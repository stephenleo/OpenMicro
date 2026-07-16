// Controller output surface. Only DualSense implements this — other drivers
// leave `output` undefined, callers use `driver.output?.setLightbar(...)`.
// No rumble: Codex Micro has no haptics, and parity is strict.

export interface ControllerOutput {
  setLightbar(color: { r: number; g: number; b: number }): void
  setPlayerLeds(bitmask: number): void
}
