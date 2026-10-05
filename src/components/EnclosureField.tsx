/* ============================================================================
   TVA — ENCLOSURE FIELD VIEW
   ----------------------------------------------------------------------------
   A cross-section of the LOKI enclosure rendered on a canvas, with a
   physically motivated field overlaid on the schematic.

   Scope note: the four-node network in lib/thermal.ts is the solver of record.
   The raster below is an analytic reconstruction of that solution — a Gaussian
   blend of the four node temperatures plus a duct decay term — so it is always
   consistent with the numbers on the panels. It is a view, not a second solver.
   ========================================================================== */

import { useEffect, useMemo, useRef } from 'react'
import { useSize } from '../hooks'
import { usePalette, rampAt } from './palette'
import type { SimState } from '../sim/types'
import { fx, fdegC } from '../lib/format'

/* Grid resolution of the field raster. Deliberately coarse: it is upscaled
   with nearest-neighbour so the cells read as sampled data, not as a blur. */
const GW = 112
const GH = 66

/** Number of advected tracer particles drawn over the schematic. */
const TRACER_COUNT = 76

interface Tracer {
  x: number
  y: number
  life: number
}

export interface FieldLayerProps {
  state: SimState
  /** Operator-set ambient air temperature, °C — not the standard profile. */
  ambientC: number
  /** Protected equipment dissipation, W. */
  loadW: number
  /** Aerogel blanket thickness in metres, for the jacket annotation. */
  insulationT: number
  showFlow: boolean
  showTracers: boolean
}

/* ============================================================ FIELD SAMPLE = */

interface FieldInput {
  die: number
  pcm: number
  radiator: number
  battery: number
  ambientC: number
  gateOpen: boolean
}

/** Analytic cross-section field, normalised 0–1 on both axes. */
function sample(x: number, y: number, f: FieldInput): number {
  // Jacket interior, matching the schematic outline in SVG.
  const inside = x > 0.08 && x < 0.92 && y > 0.13 && y < 0.87
  if (!inside) return f.ambientC

  const wDie = gauss(x, y, 0.235, 0.285, 0.165)
  const wBank = gauss(x, y, 0.25, 0.71, 0.21)
  // The radiator only bleeds into the cavity while the wax valve is open.
  const wRad = gauss(x, y, 0.735, 0.5, 0.185) * (f.gateOpen ? 1 : 0.12)
  const wBatt = gauss(x, y, 0.73, 0.795, 0.135)

  const sum = wDie + wBank + wRad + wBatt
  if (sum < 1e-4) {
    // Free volume between the sources: duct air warms with distance from the die.
    const duct = Math.exp(-Math.hypot(x - 0.235, y - 0.35) * 3.1)
    return f.ambientC + (f.die - f.ambientC) * duct * 0.5
  }
  return (f.die * wDie + f.pcm * wBank + f.radiator * wRad + f.battery * wBatt) / sum
}

function gauss(x: number, y: number, cx: number, cy: number, r: number): number {
  const d = Math.hypot((x - cx) / r, (y - cy) / r)
  return Math.exp(-2.2 * d * d)
}

/* =========================================================== COMPONENT ==== */

export function EnclosureField({
  state,
  ambientC,
  loadW,
  insulationT,
  showFlow,
  showTracers,
}: FieldLayerProps) {
  const [measure, size] = useSize<HTMLDivElement>()
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const p = usePalette()

  const w = Math.max(Math.round(size.width), 320)
  const h = Math.max(Math.round(size.height), 260)

  const input = useMemo<FieldInput>(
    () => ({
      die: state.thermal.die,
      pcm: state.thermal.pcm,
      radiator: state.thermal.radiator,
      battery: state.thermal.battery,
      ambientC,
      gateOpen: state.thermal.gateOpen,
    }),
    [
      state.thermal.die,
      state.thermal.pcm,
      state.thermal.radiator,
      state.thermal.battery,
      ambientC,
      state.thermal.gateOpen,
    ],
  )

  const minT = Math.min(ambientC, -40)
  const maxT = Math.max(state.thermal.die, 45)

  /* --- Raster: nearest-neighbour upscale of a small ImageData buffer ------ */
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    canvas.width = Math.round(w * dpr)
    canvas.height = Math.round(h * dpr)
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, w, h)

    const src = document.createElement('canvas')
    src.width = GW
    src.height = GH
    const sctx = src.getContext('2d')
    if (!sctx) return
    const img = sctx.createImageData(GW, GH)
    const span = Math.max(1e-6, maxT - minT)

    for (let j = 0; j < GH; j++) {
      for (let i = 0; i < GW; i++) {
        const t = (sample(i / (GW - 1), j / (GH - 1), input) - minT) / span
        const [r, g, b] = rampRgb(rampAt(p.field, t))
        const o = (j * GW + i) * 4
        img.data[o] = r
        img.data[o + 1] = g
        img.data[o + 2] = b
        img.data[o + 3] = 235
      }
    }
    sctx.putImageData(img, 0, 0)

    // Upscale with smoothing disabled so the cells stay legible as cells.
    const cell = Math.ceil(Math.max(w / GW, h / GH))
    const gridW = cell * GW
    const gridH = cell * GH
    ctx.imageSmoothingEnabled = false
    ctx.drawImage(src, (w - gridW) / 2, (h - gridH) / 2, gridW, gridH)
  }, [w, h, input, minT, maxT, p.field])

  /* --- Tracers: advected on rAF, seeded deterministically ---------------- */
  /* The circle count is a constant, not derived from the ref, so the elements
     exist on the very first paint; seeding happens in the effect below and the
     loop reads the live state through a ref so a new telemetry sample does not
     restart the animation. */
  const tracerRef = useRef<Tracer[]>([])
  const tracerSvgRef = useRef<SVGGElement | null>(null)
  const stateRef = useRef(state)
  const rndRef = useRef<() => number>(() => 0.5)

  useEffect(() => {
    stateRef.current = state
  }, [state])

  useEffect(() => {
    if (!showTracers) return
    let seed = 20260115
    const rnd = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0
      return seed / 4294967296
    }
    rndRef.current = rnd
    tracerRef.current = Array.from({ length: TRACER_COUNT }, () => ({
      x: 0.14 + rnd() * 0.34,
      y: 0.24 + rnd() * 0.5,
      life: rnd(),
    }))

    let raf = 0
    let last = performance.now()
    const step = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05)
      last = now
      const s = stateRef.current
      const group = tracerSvgRef.current
      if (group && w > 0 && h > 0) {
        const dots = group.children
        for (let i = 0; i < tracerRef.current.length; i++) {
          const t = tracerRef.current[i]
          const [vx, vy] = ductVelocity(t.x, t.y, s)
          t.x += vx * dt * 0.35
          t.y += vy * dt * 0.35
          t.life -= dt * 0.22
          if (t.x > 0.9 || t.life <= 0) {
            t.x = 0.14
            t.y = 0.24 + rnd() * 0.5
            t.life = 1
          }
          const el = dots[i] as SVGCircleElement | undefined
          if (el) {
            el.setAttribute('cx', (t.x * w).toFixed(1))
            el.setAttribute('cy', (t.y * h).toFixed(1))
            el.setAttribute('opacity', (0.15 + 0.5 * Math.abs(vx)).toFixed(2))
          }
        }
      }
      raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [showTracers, w, h])

  return (
    <div ref={measure} className="viewport">
      <canvas ref={canvasRef} className="viewport__canvas" style={{ width: w, height: h }} />

      <svg className="viewport__svg" width={w} height={h} aria-hidden="true">
        {showTracers && (
          <g ref={tracerSvgRef} fill="var(--accent)">
            {Array.from({ length: TRACER_COUNT }, (_, i) => (
              <circle key={i} r={1.6} cx={-10} cy={-10} opacity={0} />
            ))}
          </g>
        )}
        <Schematic state={state} w={w} h={h} insulationT={insulationT} loadW={loadW} />
        {showFlow && <FlowLines state={state} w={w} h={h} />}
      </svg>

      {/* Colour key for the field raster, so a hue is never a mystery. */}
      <div className="vp-legend">
        <span className="vp-legend__k">FIELD</span>
        <span className="vp-legend__ramp" />
        <span className="vp-legend__ends mono">
          <b>{minT.toFixed(0)}°</b>
          <b>{maxT.toFixed(0)}°</b>
        </span>
      </div>

      <div className="viewport__brackets">
        <span />
        <span />
        <span />
        <span />
      </div>
    </div>
  )
}

/* ============================================================ SCHEMATIC ==== */

function Schematic({
  state,
  w,
  h,
  insulationT,
  loadW,
}: {
  state: SimState
  w: number
  h: number
  insulationT: number
  loadW: number
}) {
  const x0 = w * 0.08
  const y0 = h * 0.13
  const bw = w * 0.84
  const bh = h * 0.74

  const dieX = x0 + bw * 0.14
  const dieY = y0 + bh * 0.14
  const dieW = bw * 0.23
  const dieH = bh * 0.24

  const bankX = x0 + bw * 0.11
  const bankY = y0 + bh * 0.57
  const bankW = bw * 0.29
  const bankH = bh * 0.3

  const radX = x0 + bw * 0.6
  const radY = y0 + bh * 0.33
  const radW = bw * 0.27
  const radH = bh * 0.3

  const batX = x0 + bw * 0.58
  const batY = y0 + bh * 0.71
  const batW = bw * 0.3
  const batH = bh * 0.15

  const dieHot = state.thermal.die > 40
  const bankFrac = state.pcm.liquidFraction
  const batCold = state.battery.temperatureC < 5
  const label = {
    fontSize: 8.5,
    fontFamily: 'var(--font-mono)',
    letterSpacing: '0.08em',
  } as const

  return (
    <g>
      {/* Outer shell: a soft body plus the aerogel boundary, so the enclosure
          reads as a machined object with wall thickness rather than a dashed
          rectangle drawn on a raster. */}
      <rect
        x={x0 - 6}
        y={y0 - 6}
        width={bw + 12}
        height={bh + 12}
        rx={14}
        fill="var(--surface-inset)"
        fillOpacity={0.34}
        stroke="var(--glass-line)"
        strokeWidth={1}
      />
      <rect
        x={x0}
        y={y0}
        width={bw}
        height={bh}
        rx={8}
        fill="none"
        stroke="var(--accent)"
        strokeWidth={1.4}
        strokeDasharray="7 4"
        opacity={0.8}
      />
      {/* Corner mounts. */}
      {[
        [x0, y0],
        [x0 + bw, y0],
        [x0, y0 + bh],
        [x0 + bw, y0 + bh],
      ].map(([mx, my], k) => (
        <circle key={k} cx={mx} cy={my} r={2.6} fill="var(--hairline-strong)" />
      ))}
      <text x={x0 + 4} y={y0 - 11} {...label} fill="var(--accent)">
        AEROGEL JACKET · {(insulationT * 1000).toFixed(0)} mm
      </text>

      {/* Equipment die, with a pulse when it is genuinely hot. */}
      {dieHot && (
        <rect
          x={dieX - 5}
          y={dieY - 5}
          width={dieW + 10}
          height={dieH + 10}
          rx={8}
          fill="none"
          stroke="var(--warn)"
          strokeWidth={1.2}
          className="pulse"
        />
      )}
      <rect
        x={dieX}
        y={dieY}
        width={dieW}
        height={dieH}
        rx={5}
        fill="var(--crit-soft)"
        stroke="var(--crit)"
        strokeWidth={1.3}
      />
      <text
        x={dieX + dieW / 2}
        y={dieY + dieH / 2 + 3.5}
        fontSize={10}
        fontFamily="var(--font-mono)"
        fontWeight={700}
        fill="var(--text)"
        textAnchor="middle"
      >
        {fdegC(state.thermal.die)} °C
      </text>
      <text x={dieX} y={dieY - 5} {...label} fill="var(--text-3)">
        EQUIPMENT · {fx(loadW, 0)} W
      </text>

      {/* Heat pipe: die → bank. Glows only while it is actually transporting. */}
      {state.thermal.pipeW > 0.3 && (
        <path
          d={`M ${dieX + dieW / 2} ${dieY + dieH} L ${dieX + dieW / 2} ${bankY}`}
          stroke={state.thermal.pipeW > 0.3 ? 'var(--warn)' : 'var(--hairline-strong)'}
          strokeWidth={7}
          fill="none"
          opacity={0.18}
          filter="blur(2px)"
        />
      )}
      <path
        d={`M ${dieX + dieW / 2} ${dieY + dieH} L ${dieX + dieW / 2} ${bankY}`}
        stroke={state.thermal.pipeW > 0.3 ? 'var(--warn)' : 'var(--hairline-strong)'}
        strokeWidth={3}
        fill="none"
        opacity={state.thermal.pipeW > 0.3 ? 0.9 : 0.4}
      />
      <text
        x={dieX + dieW / 2 + 6}
        y={(dieY + dieH + bankY) / 2}
        {...label}
        fill={state.thermal.pipeW > 0.3 ? 'var(--warn)' : 'var(--text-3)'}
      >
        HEAT PIPE {fx(state.thermal.pipeW)} W
      </text>

      {/* PCM bank with liquid-fraction fill */}
      <rect
        x={bankX}
        y={bankY}
        width={bankW}
        height={bankH}
        rx={5}
        fill="var(--ok-soft)"
        stroke="var(--ok)"
        strokeWidth={1.3}
      />
      <rect
        x={bankX + 2}
        y={bankY + bankH * (1 - bankFrac) + 2}
        width={bankW - 4}
        height={Math.max(0, bankH * bankFrac - 4)}
        rx={3}
        fill="var(--ok)"
        opacity={0.34}
      />
      <text
        x={bankX + bankW / 2}
        y={bankY + bankH / 2 + 3.5}
        fontSize={10}
        fontFamily="var(--font-mono)"
        fontWeight={700}
        fill="var(--text)"
        textAnchor="middle"
      >
        {fdegC(state.thermal.pcm)} °C
      </text>
      <text x={bankX} y={bankY - 5} {...label} fill="var(--ok)">
        PCM BANK · {(bankFrac * 100).toFixed(0)} % LIQUID
      </text>

      {/* Wax gate + radiator */}
      <path
        d={`M ${dieX + dieW} ${dieY + dieH * 0.5} L ${radX} ${radY + radH / 2}`}
        stroke={state.thermal.gateOpen ? 'var(--warn)' : 'var(--hairline-strong)'}
        strokeWidth={state.thermal.gateOpen ? 3.2 : 1.2}
        strokeDasharray={state.thermal.gateOpen ? undefined : '4 4'}
        fill="none"
      />
      <text
        x={radX - 6}
        y={radY + radH / 2 - 8}
        {...label}
        fill={state.thermal.gateOpen ? 'var(--warn)' : 'var(--text-3)'}
        textAnchor="end"
      >
        WAX GATE {state.thermal.gateOpen ? 'OPEN' : 'SEALED'}
      </text>

      <rect
        x={radX}
        y={radY}
        width={radW}
        height={radH}
        rx={5}
        fill="var(--info-soft)"
        stroke="var(--info)"
        strokeWidth={1.3}
      />
      {Array.from({ length: 9 }, (_, k) => (
        <line
          key={k}
          x1={radX + 4 + (k * (radW - 8)) / 8}
          y1={radY + 4}
          x2={radX + 4 + (k * (radW - 8)) / 8}
          y2={radY + radH - 4}
          stroke="var(--info)"
          strokeWidth={0.8}
          opacity={0.5}
        />
      ))}
      <text
        x={radX + radW / 2}
        y={radY + radH + 13}
        {...label}
        fill="var(--info)"
        textAnchor="middle"
      >
        RADIATOR · {fx(state.thermal.radLossW)} W
      </text>

      {/* Battery bay */}
      {/* Battery bay — pulses while the pack is below the charge-lock threshold,
          because that is the one state an operator has to notice. */}
      {batCold && (
        <rect
          x={batX - 5}
          y={batY - 5}
          width={batW + 10}
          height={batH + 10}
          rx={8}
          fill="none"
          stroke="var(--info)"
          strokeWidth={1.2}
          className="pulse"
        />
      )}
      <rect
        x={batX}
        y={batY}
        width={batW}
        height={batH}
        rx={5}
        fill={batCold ? 'var(--crit-soft)' : 'var(--ok-soft)'}
        stroke={batCold ? 'var(--crit)' : 'var(--ok)'}
        strokeWidth={1.3}
      />
      <text
        x={batX + batW / 2}
        y={batY + batH / 2 + 3.5}
        fontSize={10}
        fontFamily="var(--font-mono)"
        fontWeight={700}
        fill="var(--text)"
        textAnchor="middle"
      >
        {fdegC(state.battery.temperatureC)} °C
      </text>
      <text
        x={batX}
        y={batY - 5}
        {...label}
        fill={batCold ? 'var(--crit)' : 'var(--ok)'}
      >
        BATTERY BAY · {state.battery.chargeAllowed ? 'LOCK ARMED' : 'LOCK ENGAGED'}
      </text>

      {dieHot && (
        <text
          x={x0 + bw}
          y={y0 + bh + 15}
          {...label}
          fill="var(--warn)"
          textAnchor="end"
        >
          ▲ HEAT GATE DUMPING TO RADIATOR
        </text>
      )}
    </g>
  )
}

/* ============================================================ FLOW LINES == */

function FlowLines({ state, w, h }: { state: SimState; w: number; h: number }) {
  const seeds = useMemo(() => {
    const out: { x: number; y: number }[] = []
    for (let k = 0; k < 13; k++) {
      for (let s = 0; s < 14; s++) {
        out.push({ x: 0.14 + (s / 13) * 0.3, y: 0.2 + (k / 12) * 0.6 })
      }
    }
    return out
  }, [])

  return (
    <g stroke="var(--accent)" strokeWidth={0.9} opacity={0.28} fill="none">
      {seeds.map((s, i) => {
        const [vx, vy] = ductVelocity(s.x, s.y, state)
        return (
          <line
            key={i}
            x1={s.x * w}
            y1={s.y * h}
            x2={(s.x + vx * 0.026) * w}
            y2={(s.y + vy * 0.026) * h}
          />
        )
      })}
    </g>
  )
}

/* =========================================================== TRACER FIELD == */

/** Duct velocity in normalised cross-section coordinates, units s⁻¹. */
function ductVelocity(x: number, y: number, state: SimState): [number, number] {
  const jet = Math.exp(-Math.pow((y - 0.42) / 0.17, 2))
  const fan = state.thermal.fanW > 0.05 ? 1 : 0.2
  const gate = state.thermal.gateOpen ? 0.85 : 0
  const u = (0.85 * fan + 0.55 * gate) * jet * (x < 0.55 ? 1 : 0.35)
  const v = 0.3 * Math.sin(x * 9) * jet * fan - 0.22 * gate * jet
  return [u, v]
}

/* ============================================================== RAMP RGB == */

/** `rampAt` returns `rgb(r,g,b)` or a hex; normalise both to integers. */
function rampRgb(color: string): [number, number, number] {
  const nums = color.match(/\d+/g)
  if (nums && nums.length >= 3) return [Number(nums[0]), Number(nums[1]), Number(nums[2])]
  const h = color.replace('#', '')
  const v = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16)
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255]
}
