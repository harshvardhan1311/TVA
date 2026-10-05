/* ============================================================================
   TVA — BATTERY ELECTROCHEMY
   ----------------------------------------------------------------------------
   Two coupled sub-models, both required by the problem statement:

   1. CHARGE KINETICS. Below +5 °C, lithium intercalation slows enough that the
      graphite anode overpotential goes negative and metallic lithium plates out
      of solution as dendrites. The charge-transfer rate follows Arrhenius:

          I_max(T) = I_ref · exp[ −(Eₐ/R)·(1/T − 1/T_ref) ]

      LOKI's Charge Lock is a pure hardware comparator + MOSFET that physically
      opens the charge path, so no software and no firmware bug can defeat it.

   2. DISCHARGE CAPACITY. Cold cells lose usable capacity well before they stop
      working. TVA models the fraction of nameplate capacity that is actually
      deliverable, which is the term that dominates the drone-endurance loss.
   ========================================================================== */

import { CONSTANTS as K } from './constants'
import { clamp, remap, smoothstep } from './format'

export interface BatterySpec {
  /** Nameplate capacity, Ah */
  capacityAh: number
  /** Nominal cell voltage, V */
  nominalV: number
  /** Cell count in series */
  cells: number
  /** Pack mass, kg */
  massKg: number
  /** Areal heat capacity, J/(kg·K) */
  capexJK: number
  /** Charge-transfer activation energy, J/mol */
  chargeEa: number
  /** Nameplate C-rate */
  cRateMax: number
}

export const DEFAULT_BATTERY: BatterySpec = {
  capacityAh: 6.6,
  nominalV: 11.1,
  cells: 3,
  massKg: 1.0,
  capexJK: 900,
  chargeEa: K.charge_Ea,
  cRateMax: 2.0,
}

export interface BatteryState {
  /** Pack temperature, °C */
  temperatureC: number
  /** State of charge, 0–1 */
  soc: number
  /** Deliverable capacity as a fraction of nameplate */
  capacityFactor: number
  /** Delivered capacity, Ah */
  usableAh: number
  /** Stored energy at the present SOC, Wh */
  energyWh: number
  /** Maximum safe charge current, A */
  chargeCurrentMaxA: number
  /** Maximum charge current as a C-rate */
  chargeCRateMax: number
  /** Charge path mechanically enabled by the hardware lock */
  chargeAllowed: boolean
  /** Anode overpotential relative to the lithium reference, V */
  anodeOverpotentialV: number
  /** Estimated lithium-plating risk, 0–1 */
  platingRisk: number
  /** Internal resistance, mΩ */
  internalResistanceMohm: number
  /** Open-circuit voltage of the pack, V */
  openCircuitV: number
  /** Terminal voltage under load, V */
  terminalV: number
  /** Instantaneous delivered power, W */
  powerW: number
  /** Internal heating, W */
  heatW: number
  /** Irreversible capacity lost to plating, fraction of nameplate */
  capacityFade: number
}

export const INITIAL_BATTERY: BatteryState = {
  temperatureC: 14,
  soc: 0.82,
  capacityFactor: 0.96,
  usableAh: 6.34,
  energyWh: 60.9,
  chargeCurrentMaxA: 13.2,
  chargeCRateMax: 2.0,
  chargeAllowed: true,
  anodeOverpotentialV: 0.06,
  platingRisk: 0,
  internalResistanceMohm: 14,
  openCircuitV: 12.4,
  terminalV: 12.3,
  powerW: 0,
  heatW: 0,
  capacityFade: 0,
}

/**
 * Maximum charge rate permitted by charge-transfer kinetics, in C.
 * Anchored at 2 C and 25 °C, with Eₐ = 22 kJ/mol.
 *  25 °C → 2.00 C   0 °C → 0.89 C   −20 °C → 0.41 C   −35 °C → 0.21 C
 */
export function maxChargeCRate(Tc: number, spec: BatterySpec = DEFAULT_BATTERY): number {
  const Tk = Math.max(200, Tc + 273.15)
  const Tref = 298.15
  const a = (spec.chargeEa / K.R_air) * (1 / Tk - 1 / Tref)
  return spec.cRateMax * Math.exp(-a)
}

/**
 * Deliverable capacity fraction.
 * Cold cells lose roughly 40 % of nameplate by −35 °C, which is the term that
 * takes a 60-minute sea-level drone flight to the 20–25 minute band quoted in
 * master report §1.
 */
export function capacityFactor(Tc: number): number {
  return clamp(0.55 + 0.45 / (1 + Math.exp(-(Tc + 8) / 9)), 0.05, 1)
}

/**
 * Anode overpotential against the Li/Li⁺ reference.
 * Charging is only safe while η ≥ 0. Below the lock set-point the comparator
 * drives the MOSFET off regardless of what the controller believes.
 */
export function anodeOverpotential(Tc: number, soc: number, spec: BatterySpec = DEFAULT_BATTERY): number {
  // Kinetic overpotential grows as SOC rises (graphite staging) and as T falls.
  const socTerm = 0.02 + 0.11 * clamp(soc, 0, 1) ** 1.6
  const kinetic = maxChargeCRate(Tc, spec)
  return socTerm * clamp(kinetic / spec.cRateMax, 0.02, 1) - 0.01
}

/** Probability-like plating risk index, 0–1. */
export function platingRisk(Tc: number, charging: boolean, soc: number): number {
  if (!charging) return 0
  const cMax = maxChargeCRate(Tc)
  // Normalise against a reference 1 C demand.
  const demand = Math.max(0.05, cMax)
  return clamp(smoothstep(remap(1 / demand, 0.8, 3.5, 0, 1)) * (0.55 + 0.45 * soc), 0, 1)
}

/** Internal resistance of the pack, mΩ. Peaks hard when the electrolyte freezes. */
export function internalResistance(Tc: number, soc: number, spec: BatterySpec = DEFAULT_BATTERY): number {
  const base = 6 + 9 * (1 - clamp(soc, 0, 1))
  const coldFactor = 1 + 3.4 / (1 + Math.exp((Tc - 5) / 4.5))
  return base * coldFactor * (spec.cells / 3)
}

/** Open-circuit voltage of the pack, V. Mildly SOC dependent. */
export function openCircuitVoltage(soc: number, spec: BatterySpec = DEFAULT_BATTERY): number {
  const curve = 3.2 + 0.95 * smoothstep(remap(soc, 0, 1, 0, 1)) - 0.35 * smoothstep(remap(soc, 0.75, 1, 0, 1))
  return curve * spec.cells
}

/**
 * Integrate the pack.
 * @param loadW electrical power the pack is delivering
 * @param charging true when the Charge Lock permits charge current to flow
 * @param chargePowerW commanded charge power from the trunk's energy budget
 */
export function stepBattery(
  prev: BatteryState,
  loadW: number,
  charging: boolean,
  chargePowerW: number,
  spec: BatterySpec = DEFAULT_BATTERY,
  dt = 60,
  thermalCouplingWK = 0.9,
  ambientC = -20,
): BatteryState {
  const capF = capacityFactor(prev.temperatureC)
  const usableAh = spec.capacityAh * capF * (1 - prev.capacityFade)
  const energyWh = usableAh * spec.nominalV

  const rMilli = internalResistance(prev.temperatureC, prev.soc, spec)
  const ocv = openCircuitVoltage(prev.soc, spec)
  const maxDischargeW = Math.max(0, (ocv * ocv) / (rMilli / 1000)) * 0.6
  const powerW = clamp(loadW, 0, maxDischargeW)
  const currentA = powerW / Math.max(ocv, 0.1)
  const terminalV = ocv - currentA * (rMilli / 1000)
  const heatW = currentA * currentA * (rMilli / 1000)

  const cRateMax = maxChargeCRate(prev.temperatureC, spec)
  const allowed = prev.temperatureC >= K.charge_lock_c
  const chargeMaxA = allowed ? spec.capacityAh * cRateMax : 0
  const chargeA = allowed ? clamp(chargePowerW / Math.max(ocv, 0.1), 0, chargeMaxA) : 0
  const chargeWh = chargeA * ocv * (dt / 3600)
  const drawWh = powerW * (dt / 3600)

  // Coulomb counting against the *deliverable* capacity, which is why a cold
  // pack reaches its empty threshold long before the nameplate Ah is gone.
  const soc = clamp(prev.soc + (chargeWh - drawWh) / Math.max(energyWh, 1e-6), 0, 1)

  // Electrochemical heating relaxes toward the die temperature.
  const capJK = Math.max(spec.massKg * spec.capexJK, 10)
  const target = prev.temperatureC + (heatW * dt) / capJK
  const relaxed = target + (prev.temperatureC - target) * Math.exp((-thermalCouplingWK * dt) / capJK)
  const temperatureC = relaxed + (ambientC - relaxed) * (1 - Math.exp((-0.05 * dt) / capJK))

  const eta = anodeOverpotential(prev.temperatureC, soc, spec)
  const risk = platingRisk(prev.temperatureC, charging && chargeA > 0.05, soc)
  // Irreversible fade accrues only while dendrites are actively forming.
  const capacityFade = clamp(prev.capacityFade + risk * 2.2e-5 * dt, 0, 0.25)

  return {
    temperatureC,
    soc,
    capacityFactor: capF,
    usableAh,
    energyWh: soc * energyWh,
    chargeCurrentMaxA: chargeMaxA,
    chargeCRateMax: cRateMax,
    chargeAllowed: allowed,
    anodeOverpotentialV: eta,
    platingRisk: risk,
    internalResistanceMohm: rMilli,
    openCircuitV: ocv,
    terminalV,
    powerW,
    heatW,
    capacityFade,
  }
}

/* ------------------------------------------------------------ DRONE ---- */

export interface EnduranceCase {
  label: string
  /** Sea-level hover endurance, min */
  seaLevelMin: number
  /** Battery mass fraction of the airframe, kg */
  packKg: number
  /** Retained lift at the operating density, 0–1 */
  liftFactor: number
}

/**
 * Decompose the endurance shortfall into an aerodynamic term and an
 * electrochemical term, and apply the LOKI mitigation to the second only.
 *
 * Scope boundary (master report §6): LOKI recovers the battery-capacity share
 * of the loss. The lift term is aerodynamic and is NOT addressed — it is shown
 * here purely so the presentation cannot overclaim.
 */
export const ENDURANCE_CASES: ReadonlyArray<EnduranceCase> = [
  { label: 'Light observation quad', seaLevelMin: 34, packKg: 1.1, liftFactor: 1 },
  { label: 'Thermal imaging quad', seaLevelMin: 26, packKg: 1.0, liftFactor: 1 },
  { label: 'Long-range fixed wing', seaLevelMin: 210, packKg: 4.2, liftFactor: 1 },
  { label: 'Cargo multirotor', seaLevelMin: 48, packKg: 9.5, liftFactor: 1 },
]

export function enduranceBreakdown(c: EnduranceCase, packTempC: number): {
  liftMin: number
  batteryMin: number
  baselineMin: number
  lokiMin: number
  liftLossMin: number
  batteryLossMin: number
  recoveredMin: number
  capacityAtTemp: number
} {
  // Hover power ∝ 1/(ρR²A) — with constant mass and rotor geometry the
  // achievable hover power falls in inverse proportion to air density.
  const liftMin = c.seaLevelMin * c.liftFactor
  const capF = capacityFactor(packTempC)
  // The baseline pack sits at ambient; the LOKI pack is held near the bank.
  const baselineMin = liftMin * capF
  const lokiMin = liftMin * capacityFactor(clamp(packTempC, -40, 25))
  return {
    liftMin,
    batteryMin: 0,
    baselineMin,
    lokiMin,
    liftLossMin: c.seaLevelMin - liftMin,
    batteryLossMin: liftMin - baselineMin,
    recoveredMin: lokiMin - baselineMin,
    capacityAtTemp: capF,
  }
}
