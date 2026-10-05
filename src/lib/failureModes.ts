/* ============================================================================
   TVA — FAILURE MODE REGISTER
   ----------------------------------------------------------------------------
   The eight failure modes named in master report §1, each wired to the live
   state so the risk readout moves when the operator moves a slider.

   Risk is scored as a 0–100 index, not as a probability. A probability would
   be dishonest: TVA has no field data, and the master report explicitly
   forbids presenting planned work as results. The index is a normalised
   severity-exposure figure derived from published models.
   ========================================================================== */

import { clamp, remap, smoothstep, fdegC } from './format'
import { capacityFactor } from './battery'
import { fanPowerMultiplier, naturalConvectionFactor, iecCorrectionFactor } from './atmosphere'
import { PROVENANCE_META, type Provenance } from './constants'

export type FailureId =
  | 'overheat'
  | 'arcing'
  | 'battery'
  | 'fatigue'
  | 'radiation'
  | 'comms'
  | 'endurance'
  | 'display'

export type Layer = 'ROOT' | 'TRUNK' | 'BRANCH'

export interface FailureMode {
  id: FailureId
  index: number
  name: string
  /** One-line mechanism, in the language of the problem statement */
  mechanism: string
  /** The layer of the Vriksh architecture that addresses it */
  countermeasure: string
  layer: Layer
  /** Modules that make up the countermeasure */
  modules: string[]
  /** Standard or model behind the risk score */
  basis: string
  provenance: Provenance
}

export const FAILURE_MODES: ReadonlyArray<FailureMode> = [
  {
    id: 'overheat',
    index: 1,
    name: 'Severe overheating',
    mechanism:
      'Thin air carries heat away poorly, so processors and power electronics overheat despite freezing external conditions.',
    countermeasure: 'Smart Cooling scales blower speed to live air density; the wax gate dumps to the radiator.',
    layer: 'BRANCH',
    modules: ['Smart Cooling', 'Heat Gate', 'PCM Heat Bank'],
    basis: 'Q̇ = ṁ·c_p·ΔT with ṁ = ρ·V̇; natural convection scales √ρ',
    provenance: 'DERIVED',
  },
  {
    id: 'arcing',
    index: 2,
    name: 'Sparking and arcing',
    mechanism:
      'Reduced air density lowers dielectric strength, so high-voltage electricity jumps gaps that are safe at sea level.',
    countermeasure:
      'Spark Guard applies the IEC 60664-1 altitude correction, detects micro-discharge and reduces the rail before propagation.',
    layer: 'BRANCH',
    modules: ['Spark Guard'],
    basis: 'Paschen breakdown, IEC 60664-1 Table 2, Peek surface enhancement',
    provenance: 'DERIVED',
  },
  {
    id: 'battery',
    index: 3,
    name: 'Battery degradation',
    mechanism:
      'Sub-zero temperatures reduce capacity, slow charging, and drive the anode overpotential negative, plating lithium dendrites.',
    countermeasure:
      'Hardware Charge Lock physically blocks charge below +5 °C; Battery Warmer prioritises banked heat.',
    layer: 'ROOT',
    modules: ['Charge Lock', 'Battery Warmer', 'PCM Heat Bank'],
    basis: 'Arrhenius charge-transfer kinetics; η_anode = φ_s − φ_l − U_eq ≥ 0',
    provenance: 'DERIVED',
  },
  {
    id: 'fatigue',
    index: 4,
    name: 'Thermal fatigue and cracking',
    mechanism:
      'Extreme daily temperature swings induce cyclic expansion and contraction, fracturing solder joints and warping boards.',
    countermeasure:
      'Life Guard rainflow-counts the cycle and applies the Norris–Landzberg strain-life model to score remaining life.',
    layer: 'BRANCH',
    modules: ['Life Guard', 'Aerogel Jacket', 'PCM Heat Bank'],
    basis: 'Norris–Landzberg N ∝ ΔT^−2.65, ASTM E1049 rainflow',
    provenance: 'DERIVED',
  },
  {
    id: 'radiation',
    index: 5,
    name: 'Radiation vulnerability',
    mechanism:
      'Thinner air offers less natural shielding from UV and cosmic rays, increasing memory bit errors.',
    countermeasure:
      'Aerogel jacket carries a UV-stable barrier; ECC memory and scrub duty cycles are sized in the trunk budget.',
    layer: 'ROOT',
    modules: ['Aerogel Jacket', 'Trunk Energy Budget'],
    basis: 'Atmospheric column depth scales with ρ; bit-error rate tracks fluence',
    provenance: 'DERIVED',
  },
  {
    id: 'comms',
    index: 6,
    name: 'Communications failure',
    mechanism: 'Ice accumulation on antennas weakens signal transmission and raises feed-point impedance.',
    countermeasure:
      'Rime-ice accretion is modelled from the ambient/dew-point state; the trunk holds the relay buffer while the link is degraded.',
    layer: 'BRANCH',
    modules: ['SHT40 dew-point sensing', 'Comms Relay Buffer'],
    basis: 'IWC SHAF ice accretion, ASCE 7 rime-ice load',
    provenance: 'DERIVED',
  },
  {
    id: 'endurance',
    index: 7,
    name: 'Compromised drone endurance',
    mechanism:
      'Reduced lift in thin air coupled with a cold-drained battery slashes flight time from ~60 min to 20–25 min.',
    countermeasure:
      'Battery Warmer holds the pack near +15 °C, recovering the electrochemical share of the loss only.',
    layer: 'BRANCH',
    modules: ['Battery Warmer', 'PCM Heat Bank'],
    basis: 'Hover power ∝ 1/(ρR²A); usable capacity falls with cell temperature',
    provenance: 'DERIVED',
  },
  {
    id: 'display',
    index: 8,
    name: 'Display malfunction',
    mechanism:
      'Liquid crystal displays become sluggish or fail outright as their viscosity rises below freezing.',
    countermeasure:
      'Aerogel jacket holds the display above +5 °C; the trunk pre-conditions the panel before it is powered.',
    layer: 'ROOT',
    modules: ['Aerogel Jacket', 'PCM Heat Bank'],
    basis: 'LC response time follows an Arrhenius viscosity law',
    provenance: 'DERIVED',
  },
]

/* ------------------------------------------------------------- INPUTS ---- */

export interface FailureInputs {
  /** Altitude, m */
  altitudeM: number
  /** Ambient air temperature, °C */
  ambientC: number
  /** Relative humidity, 0–1 */
  humidity: number
  /** Equipment dissipation, W */
  loadW: number
  /** Die temperature, °C */
  dieC: number
  /** Battery core temperature, °C */
  batteryC: number
  /** PV bank liquid fraction */
  bankFraction: number
  /** Achieved internal diurnal swing, K */
  swingK: number
  /** High-voltage rail, V (0 if the asset is not HV) */
  hvVoltage: number
  /** Installed dielectric margin, × */
  hvMargin: number
  /** Precipitation intensity, mm/h (rime icing only above 0 °C wet-bulb) */
  precipMmH: number
  /** Airborne particulate, mg/m³ (dust loading of the radiator) */
  dustMgM3: number
  /** LOKI retrofit fitted */
  lokiFitted: boolean
  /** Spark Guard module fitted */
  sparkGuardFitted: boolean
}

/* -------------------------------------------------------------- SCORE ---- */

export interface FailureReading {
  id: FailureId
  /** Normalised risk index, 0–100 */
  risk: number
  /** Risk with the retrofit removed, 0–100 */
  riskUnprotected: number
  /** Fraction of the exposure the retrofit removes, 0–1 */
  mitigation: number
  status: 'MITIGATED' | 'CONTROLLED' | 'ELEVATED' | 'SEVERE'
  /** The one number that drives this reading */
  driver: string
  driverValue: number
  driverUnit: string
  note: string
}

export function assessFailureModes(x: FailureInputs): FailureReading[] {
  return FAILURE_MODES.map((m) => ASSESS[m.id](x))
}

/* --- 1. Overheating ------------------------------------------------------ */
const overheat: (x: FailureInputs) => FailureReading = (x) => {
  const dr = ratioAt(x.altitudeM)
  const ncf = naturalConvectionFactor(dr)
  const fpm = fanPowerMultiplier(dr)
  const thermalHeadroom = 95 - x.dieC
  const rUnprot = clamp(100 - thermalHeadroom * 1.05 - ncf * 22, 0, 100)
  const r = x.lokiFitted ? clamp(rUnprot - (1 - ncf) * 55 - 26, 0, 100) : rUnprot
  return reading('overheat', r, rUnprot, {
    driver: 'Convection derating',
    driverValue: ncf * 100,
    driverUnit: '% of sea level',
    note: `Forced convection collapses to ${(dr * 100).toFixed(1)} % of sea level at ${Math.round(x.altitudeM)} m. Restoring it costs ${fpm.toFixed(2)}× the fan power.`,
  })
}

/* --- 2. Arcing ----------------------------------------------------------- */
const arcing: (x: FailureInputs) => FailureReading = (x) => {
  const dr = ratioAt(x.altitudeM)
  const k = iecCorrectionFactor(x.altitudeM)
  const rUnprot = clamp(100 - (x.hvMargin / k - 0.6) * 62, 0, 100)
  const r = x.sparkGuardFitted ? clamp(rUnprot - 34, 0, 100) : rUnprot
  return reading('arcing', r, rUnprot, {
    driver: 'Clearance correction factor',
    driverValue: k,
    driverUnit: '× K required',
    note:
      x.hvVoltage < 300
        ? 'Asset is below the 300 V Spark Guard scope floor — no rating is claimed.'
        : `IEC 60664-1 requires every clearance to grow by ${k.toFixed(2)}× at this altitude. Installed margin is ${x.hvMargin.toFixed(2)}×. Density is ${(dr * 100).toFixed(1)} % of sea level.`,
  })
}

/* --- 3. Battery ---------------------------------------------------------- */
const battery: (x: FailureInputs) => FailureReading = (x) => {
  const cap = capacityFactor(x.batteryC)
  const rUnprot = clamp((1 - cap) * 145 + (x.batteryC < 0 ? 22 : 0), 0, 100)
  const r = x.lokiFitted ? clamp(rUnprot * (x.bankFraction > 0.02 ? 0.18 : 0.42), 0, 100) : rUnprot
  return reading('battery', r, rUnprot, {
    driver: 'Deliverable capacity',
    driverValue: cap * 100,
    driverUnit: '% of nameplate',
    note: `At ${fdegC(x.batteryC)} °C the pack delivers ${(cap * 100).toFixed(0)} % of nameplate. The hardware Charge Lock blocks charge below +5 °C regardless of firmware.`,
  })
}

/* --- 4. Thermal fatigue -------------------------------------------------- */
const fatigue: (x: FailureInputs) => FailureReading = (x) => {
  const swing = Math.max(x.swingK, 0.5)
  const rUnprot = clamp(remap(swing, 20, 60, 8, 96), 0, 100)
  const r = x.lokiFitted ? clamp(rUnprot * 0.31, 0, 100) : rUnprot
  return reading('fatigue', r, rUnprot, {
    driver: 'Diurnal internal swing',
    driverValue: swing,
    driverUnit: 'K peak-to-peak',
    note: `Norris–Landzberg gives N ∝ ΔT^−2.65. Halving the swing from 60 K to ${swing.toFixed(0)} K is a ${Math.pow(60 / swing, 2.65).toFixed(2)}× acceleration factor on solder life.`,
  })
}

/* --- 5. Radiation -------------------------------------------------------- */
const radiation: (x: FailureInputs) => FailureReading = (x) => {
  const dr = Math.max(ratioAt(x.altitudeM), 1e-3)
  // Overburden ∝ ρ, so the unshielded flux scales roughly as ρ^−2.5.
  const fluxRatio = Math.pow(1 / dr, 2.5)
  const shieldFactor = x.lokiFitted ? 1.34 : 1.0
  const r = clamp((fluxRatio / shieldFactor - 0.7) * 46, 0, 100)
  const rUnprot = clamp((fluxRatio - 0.7) * 46, 0, 100)
  return reading('radiation', r, rUnprot, {
    driver: 'Unshielded flux ratio',
    driverValue: fluxRatio,
    driverUnit: '× sea level',
    note: `Atmospheric overburden falls with density, giving roughly ${fluxRatio.toFixed(2)}× the sea-level unshielded flux. UV exposure is handled by the jacket's barrier layer; single-event upsets are handled by ECC and scrub duty cycles.`,
  })
}

/* --- 6. Comms / rime ice ------------------------------------------------- */
const comms: (x: FailureInputs) => FailureReading = (x) => {
  // Rime ice accretes when the surface is below 0 °C and supercooled droplets
  // are present. Liquid-water content tracks the wet-bulb depression.
  const wetBulb = x.ambientC - smoothstep(remap(x.humidity, 0.5, 1.0, 0, 1)) * 4.5
  const accretionRate = wetBulb < 0 ? x.precipMmH * smoothstep(remap(-wetBulb, 0, 6, 0, 1)) : 0
  const iceLoadMm = clamp(accretionRate * 2.4, 0, 40)
  const rUnprot = clamp(remap(iceLoadMm, 0.4, 14, 0, 92), 0, 100)
  const r = x.lokiFitted ? clamp(rUnprot - 26, 0, 100) : rUnprot
  return reading('comms', r, rUnprot, {
    driver: 'Rime ice accretion',
    driverValue: iceLoadMm,
    driverUnit: 'mm on the element',
    note:
      iceLoadMm < 0.2
        ? 'No accretion: the element is above the rime-formation threshold.'
        : `Wet bulb ${fdegC(wetBulb)} °C with ${x.precipMmH.toFixed(1)} mm/h gives ${iceLoadMm.toFixed(1)} mm of rime. Feed-point impedance rises and the trunk holds the relay buffer to keep the link up.`,
  })
}

/* --- 7. Drone endurance -------------------------------------------------- */
const endurance: (x: FailureInputs) => FailureReading = (x) => {
  const dr = ratioAt(x.altitudeM)
  const liftFactor = dr // hover power ∝ 1/ρ
  const seaLevel = 60
  const liftMin = seaLevel * liftFactor
  const baselineMin = liftMin * capacityFactor(x.ambientC)
  const lokiMin = liftMin * capacityFactor(x.batteryC)
  const rUnprot = clamp(100 - (baselineMin / seaLevel) * 118, 0, 100)
  const r = x.lokiFitted ? clamp(100 - (lokiMin / seaLevel) * 118, 0, 100) : rUnprot
  return reading('endurance', r, rUnprot, {
    driver: 'Endurance recovered',
    driverValue: lokiMin,
    driverUnit: 'min hover',
    note: `Lift alone costs ${(seaLevel - liftMin).toFixed(1)} min; the cold pack costs a further ${(liftMin - baselineMin).toFixed(1)} min. LOKI recovers only the second term, taking ${baselineMin.toFixed(1)} min to ${lokiMin.toFixed(1)} min.`,
  })
}

/* --- 8. LCD display ------------------------------------------------------ */
const display: (x: FailureInputs) => FailureReading = (x) => {
  // LC viscosity follows Arrhenius; response time diverges as the melt is
  // approached. Below the DSC onset the panel stops responding altogether.
  const onset = -18
  const frac = smoothstep(remap(x.dieC, -18, 12, 0, 1))
  const rUnprot = clamp(100 - frac * 100, 0, 100)
  const r = x.lokiFitted ? clamp((100 - frac * 100) * 0.22, 0, 100) : rUnprot
  return reading('display', r, rUnprot, {
    driver: 'Panel temperature',
    driverValue: x.dieC,
    driverUnit: '°C',
    note:
      x.dieC < onset
        ? `Below the ${onset} °C DSC onset the nematic phase is frozen — the panel will not update at any backlight level.`
        : `Response time tracks the nematic viscosity; at ${fdegC(x.dieC)} °C the panel is ${(frac * 100).toFixed(0)} % responsive.`,
  })
}

/* ---------------------------------------------------------------- HELPERS */

const ASSESS: Record<FailureId, (x: FailureInputs) => FailureReading> = {
  overheat,
  arcing,
  battery,
  fatigue,
  radiation,
  comms,
  endurance,
  display,
}

function ratioAt(altitudeM: number): number {
  return Math.pow(1 - 0.0065 * clamp(altitudeM, 0, 11000) / 288.15, 5.25588)
}

function reading(
  id: FailureId,
  risk: number,
  riskUnprotected: number,
  detail: { driver: string; driverValue: number; driverUnit: string; note: string },
): FailureReading {
  const mitigation = riskUnprotected > 0 ? clamp(1 - risk / riskUnprotected, 0, 1) : 0
  const status: FailureReading['status'] =
    risk < 22 ? 'MITIGATED' : risk < 45 ? 'CONTROLLED' : risk < 72 ? 'ELEVATED' : 'SEVERE'
  return {
    id,
    risk,
    riskUnprotected,
    mitigation,
    status,
    ...detail,
  }
}

/* ------------------------------------------------------ OTHER INDICATORS - */

export interface EnvironmentIndicators {
  /** Dew point, °C (Magnus–Tetens) */
  dewPointC: number
  /** Absolute humidity, g/m³ */
  absoluteHumidity: number
  /** Condensation risk on cold surfaces */
  condensationRisk: 'NONE' | 'MARGINAL' | 'LIKELY' | 'CERTAIN'
  /** UV index proxy, clear-sky */
  uvIndex: number
  /** Wind-chill against the outer jacket, °C */
  windChillC: number
  /** Effective night length, hours */
  darknessHours: number
}

export function environmentIndicators(
  ambientC: number,
  humidity: number,
  solarElev: number,
  windMs: number,
  dayLengthH: number,
): EnvironmentIndicators {
  const a = 17.625
  const b = 243.04
  const Tc = ambientC + 273.15
  const gamma = Math.log(Math.max(humidity, 1e-3)) + (a * Tc) / (b + Tc)
  const dewPointC = (b * gamma) / (a - gamma) - 273.15
  const absoluteHumidity =
    6.112 * Math.exp((17.67 * ambientC) / (ambientC + 243.5)) * humidity * 2.1674

  // Wind chill (Environment Canada / NWS), valid below 10 °C.
  const v16 = Math.pow(Math.max(windMs, 0), 0.16)
  const windChillC =
    ambientC <= 10 && windMs > 1.3
      ? 13.12 + 0.6215 * ambientC - 11.37 * v16 + 0.3965 * ambientC * v16
      : ambientC

  const uv = Math.max(0, 9.5 * Math.sin(((Math.max(solarElev, 0) / 90) * Math.PI) / 2) ** 1.15)

  return {
    dewPointC,
    absoluteHumidity,
    condensationRisk:
      dewPointC > 2 ? 'CERTAIN' : dewPointC > -4 ? 'LIKELY' : dewPointC > -12 ? 'MARGINAL' : 'NONE',
    uvIndex: uv,
    windChillC,
    darknessHours: 24 - dayLengthH,
  }
}

export const PROVENANCE_HINT = PROVENANCE_META
