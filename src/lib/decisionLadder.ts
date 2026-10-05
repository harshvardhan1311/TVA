/* ============================================================================
   TVA — DECISION LADDERS
   ----------------------------------------------------------------------------
   Master report §3 defines two ordered response ladders. TVA does not merely
   display them: it EVALUATES them against the live state, returns the step
   that actually fired, and records the numeric test that selected it. That is
   the difference between a diagram and a control system.
   ========================================================================== */

import { CONSTANTS as K } from './constants'

/* ------------------------------------------------------------- TYPES ----- */

export interface LadderStep {
  id: string
  /** 1 = first rung, highest priority */
  rank: number
  title: string
  /** What this rung does */
  action: string
  /** Which Vriksh layer performs it */
  layer: 'ROOT' | 'TRUNK' | 'BRANCH'
  /** Electrical power this rung costs, W */
  powerW: number
  /** True if the rung is currently the active one */
  active: boolean
  /** True if the rung was evaluated and passed */
  eligible: boolean
  /** The inequality that decided eligibility, shown verbatim in the UI */
  test: string
  /** Result of the test, with the measured value filled in */
  verdict: string
}

export interface LadderTrace {
  ladder: 'COLD' | 'HOT'
  headline: string
  activeId: string
  steps: LadderStep[]
  /** Electrical power currently being spent by the ladder, W */
  powerW: number
  /** True when a rung is operating with no software in the path */
  passive: boolean
}

/* ------------------------------------------------------------ COLD ------- */

export interface ColdLadderState {
  /** Battery core temperature, °C */
  batteryC: number
  /** Die temperature, °C */
  dieC: number
  /** Liquid fraction of the heat bank */
  bankFraction: number
  /** Solar array output, W */
  solarW: number
  /** Free heat available from the die, W */
  wasteHeatW: number
  /** State of charge, 0–1 */
  soc: number
  /** Altitude density ratio */
  densityRatio: number
  /** Ambient, °C */
  ambientC: number
}

/**
 * "Need Heat?  → waste heat available → draw from heat bank → solar input →
 *  electric heater (last resort)."
 */
export function coldLadder(s: ColdLadderState): LadderTrace {
  const bankDry = s.bankFraction < 0.01
  const solarUseful = s.solarW > 5
  const needHeat = s.batteryC < 5 || s.dieC < 0

  const steps: LadderStep[] = [
    {
      id: 'waste',
      rank: 1,
      title: 'Waste heat available',
      action: 'Recuperate die heat through the methanol heat pipes into the bank.',
      layer: 'BRANCH',
      powerW: 0,
      active: false,
      eligible: s.wasteHeatW > 1,
      test: 'Q̇_waste = P_load − Q̇_reject > 1 W',
      verdict: `Q̇_waste = ${s.wasteHeatW.toFixed(1)} W`,
    },
    {
      id: 'bank',
      rank: 2,
      title: 'Draw from the PCM heat bank',
      action: 'Release latent heat from the paraffin bank to hold the bay above +5 °C.',
      layer: 'ROOT',
      powerW: 0,
      eligible: !bankDry,
      active: false,
      test: 'f_liquid > 1 %',
      verdict: bankDry ? 'Bank exhausted — f = 0.0 %' : `f_liquid = ${(s.bankFraction * 100).toFixed(1)} %`,
    },
    {
      id: 'solar',
      rank: 3,
      title: 'Solar input',
      action: 'Divert array output to the film heater or the pack before it is wasted.',
      layer: 'TRUNK',
      powerW: 0,
      eligible: solarUseful,
      active: false,
      test: 'P_array > 5 W',
      verdict: solarUseful ? `P_array = ${s.solarW.toFixed(1)} W` : 'Array below useful output (night)',
    },
    {
      id: 'heater',
      rank: 4,
      title: 'Electric film heater — last resort',
      action: 'Energise the polyimide heater in its aerogel sleeve.',
      layer: 'BRANCH',
      powerW: 18,
      eligible: bankDry && needHeat,
      active: false,
      test: 'f_liquid = 0 %  AND  (T_batt < +5 °C  OR  T_die < 0 °C)',
      verdict: bankDry
        ? needHeat
          ? `Rung active — T_batt = ${s.batteryC.toFixed(1)} °C`
          : `Standby — T_batt = ${s.batteryC.toFixed(1)} °C is acceptable`
        : 'Not reached — the bank still holds charge',
    },
    {
      id: 'throttle',
      rank: 5,
      title: 'Processor throttle',
      action: 'Back off workload. This is the last thing the trunk is ever allowed to do.',
      layer: 'TRUNK',
      powerW: 0,
      eligible: false,
      active: false,
      test: 'Only after every rung above has failed',
      verdict: 'Never reached in the current state',
    },
  ]

  let activeId = 'standby'
  if (needHeat) {
    if (s.wasteHeatW > 1) activeId = 'waste'
    else if (!bankDry) activeId = 'bank'
    else if (solarUseful && s.soc > 0.15) activeId = 'solar'
    else activeId = 'heater'
  }
  steps.forEach((st) => {
    st.active = st.id === activeId
  })

  const powerW = activeId === 'heater' ? 18 : 0
  return {
    ladder: 'COLD',
    headline:
      activeId === 'standby'
        ? 'No heating demand — the bay is above the charge-lock set-point.'
        : `Cold ladder engaged at rung "${steps.find((s2) => s2.active)?.title}".`,
    activeId,
    steps,
    powerW,
    passive: activeId === 'waste' || activeId === 'bank',
  }
}

/* ------------------------------------------------------------ HOT ------- */

export interface HotLadderState {
  dieC: number
  bankFraction: number
  bankC: number
  solarW: number
  radiatorAreaM2: number
  densityRatio: number
  ambientC: number
  loadW: number
  soc: number
}

/**
 * "Too hot? → heat bank absorbs → heat gate opens to radiator → fan speed
 *  adjusted for air density → processor throttling (last resort)."
 */
export function hotLadder(s: HotLadderState): LadderTrace {
  const bankFull = s.bankFraction >= 0.99
  const gateOpen = s.dieC >= K.wax_open_c
  const needCooling = s.dieC > 55

  const steps: LadderStep[] = [
    {
      id: 'bank',
      rank: 1,
      title: 'Heat bank absorbs',
      action: 'Methanol heat pipes move die heat into the paraffin bank, melting it above +15 °C.',
      layer: 'BRANCH',
      powerW: 0,
      active: false,
      eligible: !bankFull,
      test: 'f_liquid < 100 %',
      verdict: bankFull ? 'Bank fully liquid — no capacity left' : `f_liquid = ${(s.bankFraction * 100).toFixed(1)} %`,
    },
    {
      id: 'gate',
      rank: 2,
      title: 'Wax heat gate opens to the radiator',
      action: 'The 40 °C wax element opens a > 125:1 conductance path to the external radiator.',
      layer: 'ROOT',
      powerW: 0,
      eligible: true,
      active: false,
      test: 'T_die ≥ +40 °C',
      verdict: gateOpen ? `OPEN — T_die = ${s.dieC.toFixed(1)} °C, R_th = 0.8 K/W` : `Closed — T_die = ${s.dieC.toFixed(1)} °C, R_th = 100 K/W`,
    },
    {
      id: 'fan',
      rank: 3,
      title: 'Fan speed compensated for air density',
      action: 'Blower rpm raised by 1/ρ_rel to restore sea-level mass flow.',
      layer: 'BRANCH',
      powerW: 6.2,
      eligible: true,
      active: false,
      test: 'ρ/ρ₀ ≤ 1 and T_die > 45 °C',
      verdict: `ρ/ρ₀ = ${(s.densityRatio * 100).toFixed(1)} % → N = ${(1 / Math.max(s.densityRatio, 1e-4)).toFixed(2)}× N₀`,
    },
    {
      id: 'throttle',
      rank: 4,
      title: 'Processor throttling — last resort',
      action: 'Reduce clock until the die is back inside its rating.',
      layer: 'TRUNK',
      powerW: -s.loadW * 0.4,
      eligible: true,
      active: false,
      test: 'T_die > 78 °C for > 60 s',
      verdict: s.dieC > 78 ? `THROTTLED — T_die = ${s.dieC.toFixed(1)} °C` : `Not required — T_die = ${s.dieC.toFixed(1)} °C`,
    },
  ]

  let activeId = 'nominal'
  if (needCooling) {
    if (!bankFull) activeId = 'bank'
    else if (gateOpen) activeId = 'gate'
    else activeId = 'fan'
  }
  steps.forEach((st) => {
    st.active = st.id === activeId
  })

  const powerW = activeId === 'fan' ? 6.2 : 0
  return {
    ladder: 'HOT',
    headline:
      activeId === 'nominal'
        ? 'Die is inside its rating — no cooling ladder engaged.'
        : `Hot ladder engaged at rung "${steps.find((s2) => s2.active)?.title}".`,
    activeId,
    steps,
    powerW,
    // The gate rung is the one that survives total controller failure.
    passive: activeId === 'gate' || activeId === 'bank',
  }
}
