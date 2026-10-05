/* ============================================================================
   TVA — SPARK GUARD: HIGH-VOLTAGE DIELECTRIC SAFETY
   ----------------------------------------------------------------------------
   SCOPE BOUNDARY (master report §6): this module applies only to equipment
   operating above approximately 300 V. It is not fitted to low-voltage assets
   and its margins must not be quoted for them.

   The hazard. Air's dielectric strength is a pressure property. At 5 000 m the
   local pressure is 54 kPa, so a clearance that is comfortably safe at sea
   level has roughly a third less margin. A 300 V rail with 4 mm of separation
   can hold at sea level and will corona, then arc, at altitude.

   Two defences are modelled:

   1. CORRECTED CLEARANCE. IEC 60664-1 Table 2 requires every clearance to be
      multiplied by an altitude correction factor K before it is acceptable.
      At 5 000 m, K = 1.48. Installing the correction is the minimum fix.

   2. PRESSURE ASSIST. Sealing the HV compartment and inflating a nitrogen
      bladder to the local-equivalent sea-level pressure restores the original
      dielectric environment. TVA solves for the required trapped pressure and
      reports the bladder duty it implies. This is a design proposal, not a
      demonstrated result.
   ========================================================================== */

import { iecCorrectionFactor, pressureForSeaLevelDielectric, standardPressure } from './atmosphere'
import { clamp, smoothstep, remap } from './format'

/* ------------------------------------------------------------- MODELLING - */

export interface HvConfig {
  /** Rail voltage, V — must be ≥ 300 V for Spark Guard to apply */
  railVoltageV: number
  /** Installed clearance, mm */
  clearanceMm: number
  /** True if the design already includes the IEC 60664-1 altitude correction */
  clearanceCorrected: boolean
  /** Altitude, m */
  altitudeM: number
  /** Compartment surface temperature, °C */
  compartmentTempC: number
  /** Relative humidity, 0–1. Surface condensation raises risk sharply. */
  humidity: number
  /** Trapped pressure inside a sealed compartment, kPa. 0 = unsealed. */
  sealedPressureKpa: number
  /** Conductor radius, mm — drives the Peek surface field enhancement */
  conductorRadiusMm: number
  /** Distance to the nearest grounded return, mm */
  standoffMm: number
}

export const DEFAULT_HV: HvConfig = {
  railVoltageV: 350,
  clearanceMm: 4,
  clearanceCorrected: false,
  altitudeM: 5000,
  compartmentTempC: 25,
  humidity: 0.25,
  sealedPressureKpa: 0,
  conductorRadiusMm: 3,
  standoffMm: 12,
}

/* --------------------------------------------------------- BREAKDOWN ----- */

/**
 * Breakdown voltage of a uniform-field gap, from Paschen's law.
 *     V_bd = B·p·d / (A + ln(B·p·d − ln(1 + 1/γ)))
 * A uniform field is the optimistic case; real hardware is always worse.
 */
export function breakdownVoltage(pKpa: number, gapMm: number, secondaryElectron = 0.02): number {
  const p = pKpa * 1000
  const d = gapMm / 1000
  const B = 2.0e7
  const A = 0
  const x = B * p * d
  if (x < 1.5) return 0 // below the Paschen minimum — unconditionally ionised
  const denom = A + Math.log(x - Math.log(1 + 1 / secondaryElectron))
  return x / Math.max(denom, 1e-6)
}

/**
 * Peek's law surface field enhancement for a cylindrical conductor.
 *     E_max = E_0 · [ 1 + (r/d)·(1 + √(x/r)) ]
 * Corona initiates in the local field, not the average, so this factor is what
 * actually decides whether a HV feedthrough survives at altitude.
 */
export function peekEnhancement(radiusMm: number, distanceMm: number): number {
  const r = Math.max(radiusMm, 0.01)
  const d = Math.max(distanceMm, r * 1.001)
  const x = Math.max(d - r, r)
  return 1 + (r / d) * (1 + Math.sqrt(x / r))
}

/* ------------------------------------------------------------ ASSESSMENT - */

export interface HvAssessment {
  /** Local pressure inside the compartment, kPa */
  localPressureKpa: number
  /** Local pressure expressed as an equivalent altitude, m */
  localEquivalentAltitudeM: number
  /** IEC 60664-1 correction factor at the operating altitude */
  iecFactor: number
  /** Breakdown voltage of the installed gap at local pressure, V */
  breakdownV: number
  /** Effective working voltage after Peek enhancement, V */
  effectiveVoltageV: number
  /** Dielectric safety margin, V/rail. < 1.0 means breakdown is expected. */
  margin: number
  /** Margin as a percentage of the design requirement */
  marginPct: number
  status: 'SAFE' | 'MARGINAL' | 'AT_RISK' | 'CORONA' | 'ARCING'
  /** Trapped pressure needed to restore a sea-level environment, kPa */
  requiredPressureKpa: number
  /** Peak-to-trapped ratio, i.e. the burden on the bladder */
  pressureBurden: number
  /** Predicted micro-discharge activity index, 0–1 */
  coronaIndex: number
  /** Recommended action for the operator */
  action: string
  /** True when the rail is inside Spark Guard's declared scope */
  inScope: boolean
  /** Applicability check, always populated so the UI can refuse to mislead */
  scopeNote: string
}

export function assessHv(c: HvConfig = DEFAULT_HV): HvAssessment {
  const ambientPressure = standardPressure(c.altitudeM)
  const localPressureKpa = c.sealedPressureKpa > 0 ? c.sealedPressureKpa : ambientPressure
  const inScope = c.railVoltageV >= 300

  const vbd = breakdownVoltage(localPressureKpa, c.clearanceMm)
  const peek = peekEnhancement(c.conductorRadiusMm, c.standoffMm)
  const effectiveVoltage = c.railVoltageV * peek

  // Humidity raises risk through surface flashover, not through the gas.
  const humidityFactor = 1 - 0.22 * smoothstep(remap(c.humidity, 0.4, 0.95, 0, 1))
  const usableVbd = vbd * humidityFactor
  const margin = usableVbd / Math.max(effectiveVoltage, 1e-6)

  // Corona starts well before full breakdown — typically near 0.75 of it.
  const coronaIndex = clamp(smoothstep(remap(1 / Math.max(margin, 1e-6), 0.9, 1.6, 0, 1)), 0, 1)

  const requiredPressureKpa = pressureForSeaLevelDielectric(c.compartmentTempC + 273.15)
  const pressureBurden = localPressureKpa / Math.max(requiredPressureKpa, 1e-6)

  const status: HvAssessment['status'] =
    margin < 1.0 ? 'ARCING' : margin < 1.2 ? 'CORONA' : margin < 1.5 ? 'AT_RISK' : margin < 2.2 ? 'MARGINAL' : 'SAFE'

  return {
    localPressureKpa,
    localEquivalentAltitudeM: localPressureKpa <= 0.01 ? 11000 : equivalentAlt(localPressureKpa),
    iecFactor: iecCorrectionFactor(c.altitudeM),
    breakdownV: vbd,
    effectiveVoltageV: effectiveVoltage,
    margin,
    marginPct: (margin - 1) * 100,
    status,
    requiredPressureKpa,
    pressureBurden,
    coronaIndex,
    action: actionFor(status, c, margin, iecCorrectionFactor(c.altitudeM)),
    inScope,
    scopeNote: inScope
      ? `Rail at ${c.railVoltageV} V is inside Spark Guard's declared scope (≥ 300 V).`
      : `Rail at ${c.railVoltageV} V is BELOW Spark Guard's 300 V scope floor. Figures shown for reference only — do not quote.`,
  }
}

function equivalentAlt(pressureKpa: number): number {
  const n = 5.25588
  return (288.15 / 0.0065) * (1 - Math.pow(clamp(pressureKpa, 1e-3, 101.325) / 101.325, 1 / n))
}

function actionFor(
  status: HvAssessment['status'],
  c: HvConfig,
  margin: number,
  iec: number,
): string {
  switch (status) {
    case 'ARCING':
      return `Reduce the rail to ${Math.floor(0.85 * breakdownVoltage(c.sealedPressureKpa > 0 ? c.sealedPressureKpa : standardPressure(c.altitudeM), c.clearanceMm) / peekEnhancement(c.conductorRadiusMm, c.standoffMm))} V or fit corrected clearance immediately.`
    case 'CORONA':
      return `Below design margin. Increase clearance to ≥ ${(c.clearanceMm * iec).toFixed(1)} mm or pressurise the compartment; the UV photodiode will report micro-discharge onset.`
    case 'AT_RISK':
      return `Margin ${margin.toFixed(2)}× is below the 1.5× design rule. Apply the IEC 60664-1 correction of ${iec.toFixed(2)}× before field deployment.`
    case 'MARGINAL':
      return 'Acceptable with monitoring. Enable the HF current coil and log corona activity for the full trial period.'
    case 'SAFE':
      return 'Clearance verified for this altitude. Re-verify at every altitude change and after any servicing.'
  }
}

/** Minimum clearance that holds a 1.5× design margin at this altitude. */
export function requiredClearance(c: HvConfig = DEFAULT_HV, designMargin = 1.5): number {
  const p = c.sealedPressureKpa > 0 ? c.sealedPressureKpa : standardPressure(c.altitudeM)
  const peek = peekEnhancement(c.conductorRadiusMm, c.standoffMm)
  // Invert Paschen numerically — the closed form has no real inverse.
  let lo = 0.05
  let hi = 400
  for (let i = 0; i < 60; i++) {
    const mid = 0.5 * (lo + hi)
    if (breakdownVoltage(p, mid) / peek < c.railVoltageV * designMargin) lo = mid
    else hi = mid
  }
  return 0.5 * (lo + hi)
}

/* --------------------------------------------------- FEEDTHROUGH DESIGN -- */

export interface TrappedPressureResult {
  requiredKpa: number
  /** Gauge pressure the bladder must hold against ambient, kPa */
  gaugeKpa: number
  /** Peak-to-trapped ratio at 20 °C — the fatigue burden on the bladder */
  peakToTrapped: number
  feasible: boolean
  note: string
}

export function trappedPressure(
  altitudeM: number,
  minTempC: number,
  maxTempC: number,
): TrappedPressureResult {
  const pCold = pressureForSeaLevelDielectric(minTempC + 273.15)
  const pHot = pressureForSeaLevelDielectric(maxTempC + 273.15)
  const pAmbient = standardPressure(altitudeM)
  // A gas bladder obeys P1/T1 = P2/T2, so the trapped pressure sags hard when
  // the compartment goes from day to night. Size for the cold case.
  const required = pCold
  const gauge = required - pAmbient
  const peakToTrapped = pHot / required
  return {
    requiredKpa: required,
    gaugeKpa: gauge,
    peakToTrapped,
    feasible: gauge > 0 && peakToTrapped < 2.2,
    note:
      gauge <= 0
        ? 'The site already sits at or above sea-level-equivalent pressure — no assist required.'
        : peakToTrapped >= 2.2
          ? `Peak-to-trapped ratio ${peakToTrapped.toFixed(2)} exceeds the practical bladder limit. Fit a pressure regulator.`
          : `Nitrogen bladder sized for ${required.toFixed(1)} kPa trapped (${gauge.toFixed(1)} kPa gauge).`,
  }
}
