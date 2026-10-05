/* ============================================================================
   TVA — LIFE GUARD: THERMAL FATIGUE
   ----------------------------------------------------------------------------
   The Branches layer's health branch. Two stages:

   1. RAINFLOW CYCLE COUNTING (ASTM E1049 / IEC 62660 method B). A diurnal
      temperature history is reduced to a closed-cycle range histogram, which
      is the standard preprocessing for strain-life work on assemblies that see
      a slow thermal cycle rather than a mechanical one.

   2. NORRIS–LANDZBERG strain-life model, the accepted model for thermomechanical
      fatigue of solder joints:

          N_f = A · (ΔT)^−n · f^m · exp(Eₐ / k_B · T_max)

      so the acceleration factor between two assemblies is

          AF = (ΔT_u/ΔT_L)^n · (f_L/f_u)^m · exp[(Eₐ/k_B)(1/T_L − 1/T_u)]

      with n = 2.65, m = 0.136 and Eₐ = 11.75 kJ/mol for SAC305.

      NOTE ON SIGN. The Arrhenius factor must EXCEED 1 for the cooler assembly,
      because accumulated damage rises with peak temperature. Master report and
      the preliminary CFD workbench agree on the exponent but the preliminary
      expression has the temperature difference reversed, which yields a factor
      below 1 — physically backwards. TVA implements the corrected form and
      records the decision in DISCREPANCIES (see lib/constants.ts).
   ========================================================================== */

import { CONSTANTS as K } from './constants'

/* ---------------------------------------------------------- RAINFLOW ---- */

export interface CycleRange {
  /** Half-range of the closed cycle, K */
  rangeK: number
  /** Number of full cycles counted in this bin */
  count: number
}

/**
 * Simplified ASTM E1049 rainflow counting.
 *
 * Turning points are extracted, then successive four-point half cycles are
 * paired into full cycles. A residual half cycle is returned separately as
 * `residual` so the caller can report incomplete rather than silently
 * discarded history.
 */
export function rainflow(series: number[], bins = 24): {
  histogram: CycleRange[]
  residual: { rangeK: number; meanK: number; count: number } | null
  meanK: number
  minK: number
  maxK: number
} {
  // 1. Turning points.
  const tp: number[] = []
  for (let i = 1; i < series.length - 1; i++) {
    const a = series[i - 1]
    const b = series[i]
    const c = series[i + 1]
    if ((b >= a && b > c) || (b <= a && b < c)) tp.push(b)
  }
  if (tp.length < 3) {
    return { histogram: [], residual: null, meanK: 0, minK: 0, maxK: 0 }
  }

  const minK = Math.min(...tp)
  const maxK = Math.max(...tp)
  const meanK = tp.reduce((a, b) => a + b, 0) / tp.length

  // 2. Pair half cycles.
  const counts = new Array<number>(bins).fill(0)
  const stack: number[] = []
  let residualRange = 0
  let residualCount = 0

  for (const p of tp) {
    stack.push(p)
    while (stack.length >= 4) {
      const [s0, s1, s2, s3] = stack.slice(stack.length - 4)
      const r1 = Math.abs(s1 - s0)
      const r2 = Math.abs(s2 - s1)
      const r3 = Math.abs(s3 - s2)
      if (r2 <= r1 && r2 <= r3) {
        addBin(counts, bins, 0.5 * (r1 + r2), maxK)
        stack.splice(stack.length - 3, 2)
      } else break
    }
  }
  // 3. What is left is an unclosed residual.
  if (stack.length >= 2) {
    residualRange = 0.5 * Math.abs(stack[stack.length - 1] - stack[stack.length - 2])
    residualCount = 1
  }

  const width = maxK > 0 ? maxK / bins : 1
  const histogram: CycleRange[] = counts
    .map((count, i) => ({ rangeK: width * (i + 0.5), count }))
    .filter((h) => h.count > 0)

  return {
    histogram,
    residual: residualCount ? { rangeK: residualRange, meanK, count: residualCount } : null,
    meanK,
    minK,
    maxK,
  }
}

function addBin(counts: number[], bins: number, range: number, maxK: number): void {
  if (range <= 0) return
  const idx = Math.min(bins - 1, Math.max(0, Math.floor((range / maxK) * bins)))
  counts[idx] += 1
}

/* --------------------------------------------------- NORRIS–LANDZBERG --- */

export interface FatigueModel {
  /** Strain-life exponent n */
  n: number
  /** Frequency exponent m */
  m: number
  /** Activation energy, J/mol */
  Ea: number
  /** Cycles to failure at a 1 K range, 1 Hz, at 298.15 K */
  cyclesAtReference: number
  /** Reference temperature, K */
  Tref: number
}

export const SAC305: FatigueModel = {
  n: K.nl_exponent,
  m: K.nl_freq_exponent,
  Ea: K.nl_Ea,
  // Normalisation constant. Chosen so that a 40 K cycle at 1 Hz and 25 °C gives
  // N_f ≈ 5×10⁴ cycles, which is the published order of magnitude for SAC305.
  // It is a SCALING CONSTANT, NOT a prediction: the absolute life figure is
  // uncalibrated until protocol E3 measures a real assembled joint. Only the
  // RATIO between two assemblies is defensible, and that is what the team
  // publishes.
  cyclesAtReference: 7.7e6,
  Tref: 298.15,
}

/**
 * Design service life used to normalise remaining life, in daily cycles.
 * Twenty years at one diurnal cycle per day.
 */
export const DESIGN_CYCLES = 7305

/** Cycles to failure for a single closed cycle. */
export function cyclesToFailure(
  rangeK: number,
  frequencyHz: number,
  tMaxC: number,
  model: FatigueModel = SAC305,
): number {
  const rangeTerm = Math.pow(Math.max(rangeK, 0.05), -model.n)
  const freqTerm = Math.pow(Math.max(frequencyHz, 1e-8), model.m)
  const arrhenius = Math.exp((model.Ea / K.kB) / Math.max(tMaxC + 273.15, 200))
  return model.cyclesAtReference * rangeTerm * freqTerm * arrhenius
}

/** Miner damage fraction contributed by `count` cycles. */
export function minerDamage(
  count: number,
  rangeK: number,
  frequencyHz: number,
  tMaxC: number,
  model: FatigueModel = SAC305,
): number {
  return count / Math.max(cyclesToFailure(rangeK, frequencyHz, tMaxC, model), 1)
}

export interface FatigueComparison {
  /** Unprotected acceleration factor, ΔT term only — the published claim */
  afDeltaOnly: number
  /** Full Norris–Landzberg form including the Arrhenius T_max term */
  afFull: number
  /** Arrhenius contribution on its own */
  afArrhenius: number
  /** Frequency contribution (1.0 when the diurnal period is unchanged) */
  afFrequency: number
  nUnprotected: number
  nLoki: number
  /** Conservative published lifetime multiplier */
  publishedMultiplier: number
}

export function compareFatigue(
  dTUnprotected: number,
  dTLoki: number,
  tMaxUnprotectedC: number,
  tMaxLokiC: number,
  frequencyLokiHz = 1.157e-5,
  frequencyUnprotectedHz = 1.157e-5,
  model: FatigueModel = SAC305,
): FatigueComparison {
  const afDeltaOnly = Math.pow(dTUnprotected / dTLoki, model.n)
  const afFrequency = Math.pow(frequencyLokiHz / frequencyUnprotectedHz, model.m)
  const afArrhenius = Math.exp(
    (model.Ea / K.kB) * (1 / (tMaxLokiC + 273.15) - 1 / (tMaxUnprotectedC + 273.15)),
  )
  const nUnprotected = cyclesToFailure(
    dTUnprotected,
    frequencyUnprotectedHz,
    tMaxUnprotectedC,
    model,
  )
  const nLoki = cyclesToFailure(dTLoki, frequencyLokiHz, tMaxLokiC, model)
  return {
    afDeltaOnly,
    afArrhenius,
    afFrequency,
    afFull: afDeltaOnly * afFrequency * afArrhenius,
    nUnprotected,
    nLoki,
    // Master report publishes the conservative ΔT-only figure.
    publishedMultiplier: afDeltaOnly,
  }
}

/**
 * Cumulative damage and remaining-life score from a rainflow histogram.
 * @param designCycles service-life allowance in cycles; defaults to 20 years
 *                      at one diurnal cycle per day.
 */
export function healthFromHistogram(
  histogram: CycleRange[],
  frequencyHz: number,
  tMaxC: number,
  designCycles = DESIGN_CYCLES,
  model: FatigueModel = SAC305,
): { damage: number; lifeUsedPct: number; lifeRemainingPct: number; criticalRangeK: number } {
  let damage = 0
  let criticalRangeK = 0
  let best = 0
  for (const h of histogram) {
    const d = minerDamage(h.count, h.rangeK, frequencyHz, tMaxC, model)
    damage += d
    if (d > best) {
      best = d
      criticalRangeK = h.rangeK
    }
  }
  const used = clamp01(damage / designCycles)
  return {
    damage,
    lifeUsedPct: used * 100,
    lifeRemainingPct: (1 - used) * 100,
    criticalRangeK,
  }
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)

/* --------------------------------------------------------------- SCORE -- */

export interface LifeScore {
  /** 0–100 remaining-life health score */
  score: number
  status: 'NOMINAL' | 'DEGRADED' | 'MARGINAL' | 'CRITICAL'
  /** Equivalent accumulated cycles, Miner sum */
  equivalentCycles: number
  /** Range that dominates the damage, K */
  criticalRangeK: number
  /** Diurnal swing actually achieved by the assembly, K */
  achievedSwingK: number
  swingReductionPct: number
}

export function lifeScore(
  historyC: number[],
  unprotectedSwingK: number,
  designCycles = DESIGN_CYCLES,
  model: FatigueModel = SAC305,
): LifeScore {
  const { histogram } = rainflow(historyC)
  const dailyFreq = 1 / 86400
  const tMax = Math.max(...historyC)
  const { lifeRemainingPct, criticalRangeK, damage } = healthFromHistogram(
    histogram,
    dailyFreq,
    tMax,
    designCycles,
    model,
  )
  const achieved = Math.max(...historyC) - Math.min(...historyC)
  const status: LifeScore['status'] =
    lifeRemainingPct > 70 ? 'NOMINAL' : lifeRemainingPct > 40 ? 'DEGRADED' : lifeRemainingPct > 12 ? 'MARGINAL' : 'CRITICAL'
  return {
    score: clamp01(lifeRemainingPct / 100) * 100,
    status,
    equivalentCycles: damage * designCycles,
    criticalRangeK,
    achievedSwingK: achieved,
    swingReductionPct: (1 - achieved / Math.max(unprotectedSwingK, 1e-6)) * 100,
  }
}
