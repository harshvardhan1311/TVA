import { useEffect, useRef } from 'react'
import { useSim } from '../sim/store'

/**
 * Drives the simulation clock.
 *
 * A single requestAnimationFrame loop advances the physics at a fixed
 * `dt` per tick with catch-up, so the model integrates at a constant step
 * regardless of display refresh rate. Several ticks may run per frame at high
 * time scales; the cap prevents a backgrounded tab from stalling the browser
 * when it is restored.
 */
export function useSimulation(): void {
  const advance = useSim((s) => s.advance)
  const running = useSim((s) => s.config.running)
  const timeScale = useSim((s) => s.config.timeScale)

  const acc = useRef(0)
  const last = useRef(0)

  useEffect(() => {
    if (!running) return
    let raf = 0
    last.current = performance.now()
    acc.current = 0

    const frame = (now: number) => {
      const dtWall = Math.min((now - last.current) / 1000, 0.25)
      last.current = now
      acc.current += dtWall * timeScale

      // 30 s of simulated time per tick (BASE_DT).
      const STEP = 30
      let steps = 0
      while (acc.current >= STEP && steps < 600) {
        advance()
        acc.current -= STEP
        steps++
      }
      raf = requestAnimationFrame(frame)
    }

    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [advance, running, timeScale])
}
