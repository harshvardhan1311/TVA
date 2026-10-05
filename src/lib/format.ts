/* ============================================================================
   TVA — FORMATTING HELPERS
   Instrument-panel number presentation. Everything numeric in the UI goes
   through here so units, precision and sign conventions stay consistent.
   ========================================================================== */

export const clamp = (v: number, lo: number, hi: number): number =>
  v < lo ? lo : v > hi ? hi : v

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t

export const invLerp = (a: number, b: number, v: number): number =>
  a === b ? 0 : (v - a) / (b - a)

/** Map a value from one range to another, clamped. */
export const remap = (
  v: number,
  inLo: number,
  inHi: number,
  outLo: number,
  outHi: number,
): number => lerp(outLo, outHi, clamp(invLerp(inLo, inHi, v), 0, 1))

/** Smoothstep easing on a normalised 0..1 input. */
export const smoothstep = (t: number): number => {
  const x = clamp(t, 0, 1)
  return x * x * (3 - 2 * x)
}

export const M_TO_FT = 3.280839895

/* ------------------------------------------------------------ NUMBERS --- */

/** Fixed-decimal with explicit sign for deltas. */
export function fx(v: number, dp = 1): string {
  if (!Number.isFinite(v)) return '—'
  return v.toFixed(dp)
}

/** Temperature with a forced sign, the instrument convention. */
export function fdegC(v: number, dp = 1): string {
  if (!Number.isFinite(v)) return '—'
  return `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(dp)}`
}

export function fdegCUnit(v: number, dp = 1): string {
  return `${fdegC(v, dp)} °C`
}

export function fnum(v: number, dp = 1): string {
  if (!Number.isFinite(v)) return '—'
  return v.toLocaleString('en-US', {
    minimumFractionDigits: dp,
    maximumFractionDigits: dp,
  })
}

export function fint(v: number): string {
  if (!Number.isFinite(v)) return '—'
  return Math.round(v).toLocaleString('en-US')
}

export function ffeet(metres: number): string {
  return `${fint(metres * M_TO_FT)}`
}

export function fpct(v: number, dp = 1): string {
  return `${fnum(v * 100, dp)}`
}

export function fxMult(v: number, dp = 2): string {
  return `${fnum(v, dp)}×`
}

export function fWatts(v: number, dp = 1): string {
  return `${fnum(v, dp)} W`
}

/** Watt-hours. Pass joules through {@link fWhFromJ}. */
export function fWh(wattHours: number, dp = 1): string {
  return `${fnum(wattHours, dp)} Wh`
}

/** Kilowatt-hours. */
export function fkWh(kwh: number, dp = 2): string {
  return `${fnum(kwh, dp)} kWh`
}

/** Watt-hours from raw joules — the unit most of the thermal state carries. */
export function fWhFromJ(joules: number, dp = 1): string {
  return fWh(joules / 3600, dp)
}

/** Ratio in 0–1 rendered as a percentage. */
export function pct(v: number, dp = 1): string {
  return `${fnum(clamp(v, -9.99, 99.99) * 100, dp)}%`
}

export function fkJ(j: number, dp = 1): string {
  return `${fnum(j / 1000, dp)} kJ`
}

/** Signed engineering value with unit, e.g. "+4.21 kPa". */
export function fsigned(v: number, unit: string, dp = 2): string {
  return `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(dp)} ${unit}`
}

/** Compact SI prefix, for large energies. */
export function fEnergy(joules: number): { value: string; unit: string } {
  const a = Math.abs(joules)
  if (a >= 1e6) return { value: fnum(joules / 1e6, 2), unit: 'MJ' }
  if (a >= 1e3) return { value: fnum(joules / 1e3, 1), unit: 'kJ' }
  return { value: fnum(joules, 0), unit: 'J' }
}

/* ------------------------------------------------------------- CLOCK ---- */

/** Mission-elapsed clock as DD:HH:MM:SS. */
export function fDuration(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds))
  const d = Math.floor(s / 86400)
  const h = Math.floor((s % 86400) / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const p2 = (n: number) => String(n).padStart(2, '0')
  return d > 0 ? `${d}d ${p2(h)}:${p2(m)}:${p2(sec)}` : `${p2(h)}:${p2(m)}:${p2(sec)}`
}

/** Simulation clock-of-day as HH:MM. */
export function fClock(hours: number): string {
  const h = Math.floor(((hours % 24) + 24) % 24)
  const m = Math.floor((((hours % 24) + 24) % 24 - h) * 60)
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/* ------------------------------------------------------------- TONE ----- */

export type Tone = 'ok' | 'warn' | 'crit' | 'info' | 'accent' | 'violet' | 'neutral'

/** Threshold → tone mapper. `edges` must be ascending; the last edge is the ceiling. */
export function toneFor(value: number, edges: [number, number, number, number]): Tone {
  const [t3, t2, t1, t0] = edges
  if (value <= t0) return 'crit'
  if (value <= t1) return 'warn'
  if (value <= t2) return 'info'
  if (value <= t3) return 'ok'
  return 'accent'
}

/** Inverse: low-is-good thresholds. */
export function toneForLow(
  value: number,
  edges: [number, number, number, number],
): Tone {
  const [t3, t2, t1, t0] = edges
  if (value >= t0) return 'ok'
  if (value >= t1) return 'info'
  if (value >= t2) return 'warn'
  if (value >= t3) return 'crit'
  return 'crit'
}

/* --------------------------------------------------------- PHYSICS ----- */

/** Convert a linear 0..1 position through a 5-stop instrument ramp. */
export function rampColor(t: number, stops: [string, string, string, string, string]): string {
  const x = clamp(t, 0, 1) * (stops.length - 1)
  const i = Math.min(stops.length - 2, Math.floor(x))
  return mixHex(stops[i], stops[i + 1], x - i)
}

export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  const v = parseInt(
    h.length === 3
      ? h
          .split('')
          .map((c) => c + c)
          .join('')
      : h,
    16,
  )
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255]
}

export function mixHex(a: string, b: string, t: number): string {
  const [ar, ag, ab] = hexToRgb(a)
  const [br, bg, bb] = hexToRgb(b)
  const k = clamp(t, 0, 1)
  return `rgb(${Math.round(lerp(ar, br, k))},${Math.round(lerp(ag, bg, k))},${Math.round(
    lerp(ab, bb, k),
  )})`
}

/** Resolve a CSS custom property from the document root (theme-aware colours). */
export function cssVar(name: string, fallback = '#888'): string {
  if (typeof window === 'undefined') return fallback
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return v || fallback
}

/* ------------------------------------------------------------- ARRAY ---- */

export function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0
}

export function stddev(xs: number[]): number {
  if (xs.length < 2) return 0
  const m = mean(xs)
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1))
}

export function minMax(xs: number[]): { min: number; max: number } {
  if (!xs.length) return { min: 0, max: 1 }
  let min = xs[0]
  let max = xs[0]
  for (const x of xs) {
    if (x < min) min = x
    if (x > max) max = x
  }
  return { min, max }
}

/** Fixed-length ring buffer backed by a Float64Array. Allocation-free after init. */
export class Ring {
  readonly buf: Float64Array
  readonly capacity: number
  private head = 0
  private n = 0

  constructor(capacity: number) {
    this.capacity = capacity
    this.buf = new Float64Array(capacity)
  }

  push(v: number): void {
    this.buf[this.head] = v
    this.head = (this.head + 1) % this.capacity
    if (this.n < this.capacity) this.n++
  }

  get length(): number {
    return this.n
  }

  /** Oldest-to-newest ordered copy. */
  toArray(): number[] {
    const out = new Array<number>(this.n)
    const start = (this.head - this.n + this.capacity) % this.capacity
    for (let i = 0; i < this.n; i++) out[i] = this.buf[(start + i) % this.capacity]
    return out
  }

  /** The n most recent values, oldest first. */
  last(n: number): number[] {
    const take = Math.min(n, this.n)
    return this.toArray().slice(this.n - take)
  }

  get lastValue(): number {
    return this.n ? this.buf[(this.head - 1 + this.capacity) % this.capacity] : 0
  }

  clear(): void {
    this.head = 0
    this.n = 0
  }
}
