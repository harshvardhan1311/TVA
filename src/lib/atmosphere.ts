/* ============================================================================
   TVA — ATMOSPHERIC MODEL
   ISO 2533:1975 Standard Atmosphere, tropospheric branch (0–11 000 m).
   ----------------------------------------------------------------------------
   Barometric (hypsometric) pressure:
       P(h) = P₀ · (1 − L·h / T₀)^(g₀·M / (R·L))
   Virtual temperature is treated as the standard lapse profile (dry air):
       T(h) = T₀ − L·h
   Density from the ideal gas law:
       ρ(h) = P(h) · M / (R · T(h))
   ========================================================================== */

import { CONSTANTS as K } from './constants'
import { clamp } from './format'

export const LAPSE_RATE = 0.0065 // K/m
export const TROPOPAUSE_M = 11000

export interface Atmosphere {
  /** Geometric altitude, m */
  altitude: number
  /** Static pressure, kPa */
  pressure: number
  /** Air temperature on the standard profile, K */
  temperatureK: number
  /** Air temperature on the standard profile, °C */
  temperatureC: number
  /** Air density, kg/m³ */
  density: number
  /** ρ / ρ₀ */
  densityRatio: number
  /** Absolute pressure deficit against sea level, kPa */
  pressureDeficit: number
  /** Dynamic viscosity, Pa·s (Sutherland) */
  viscosity: number
  /** Kinematic viscosity, m²/s */
  kinematicViscosity: number
  /** Speed of sound, m/s */
  speedOfSound: number
  /** Mean free path, m (scaled from the sea-level reference) */
  meanFreePath: number
  /** Knudsen number at a 20 mm aerodynamic gap */
  knudsen: number
  /** Oxygen partial pressure, kPa (21 % by volume) */
  o2Partial: number
  /** Equivalent standard-atmosphere altitude for the local pressure, m */
  equivalentAltitude: number
}

/** Sutherland's law for the dynamic viscosity of dry air. */
export function airViscosity(Tk: number): number {
  const mu0 = 1.716e-5
  const T0 = 273.15
  const S = 111
  return (mu0 * (Tk / T0) ** 1.5 * (T0 + S)) / (Tk + S)
}

export function standardPressure(altitude: number): number {
  const h = clamp(altitude, 0, TROPOPAUSE_M)
  const ratio = 1 - (LAPSE_RATE * h) / K.T0
  return K.P0 * Math.pow(ratio, (K.g0 * K.M_air) / (K.R_air * LAPSE_RATE))
}

export function standardTemperatureK(altitude: number): number {
  return K.T0 - LAPSE_RATE * clamp(altitude, 0, TROPOPAUSE_M)
}

/** Invert P(h) to recover the geometric altitude for a given pressure. */
export function altitudeForPressure(pressureKpa: number): number {
  const p = clamp(pressureKpa, 1e-3, K.P0)
  const n = (K.g0 * K.M_air) / (K.R_air * LAPSE_RATE)
  return ((K.T0 / LAPSE_RATE) * (1 - Math.pow(p / K.P0, 1 / n)))
}

export function atmosphere(altitude: number): Atmosphere {
  const alt = clamp(altitude, 0, TROPOPAUSE_M)
  const pressure = standardPressure(alt)
  const temperatureK = standardTemperatureK(alt)
  const density = (pressure * 1000) / (K.R_air * temperatureK)
  const mu = airViscosity(temperatureK)
  const meanFreePath = 68e-9 * (K.T0 / temperatureK) * (K.P0 / pressure)

  return {
    altitude: alt,
    pressure,
    temperatureK,
    temperatureC: temperatureK - 273.15,
    density,
    densityRatio: density / K.rho0,
    pressureDeficit: K.P0 - pressure,
    viscosity: mu,
    kinematicViscosity: mu / density,
    speedOfSound: Math.sqrt(1.4 * K.R_air * temperatureK),
    meanFreePath,
    knudsen: meanFreePath / 0.02,
    o2Partial: pressure * 0.2095,
    equivalentAltitude: altitudeForPressure(pressure),
  }
}

/* ============================================================================
   THIN-AIR DERATING LAWS
   These are the two relationships the whole LOKI thesis rests on. Both are
   stated in master report §3 and are re-derived here so the UI can show the
   arithmetic rather than a bare number.
   ========================================================================== */

/**
 * Natural-convection derating.
 * Master report §3: natural convection coefficients scale with √(ρ/ρ₀), giving
 * ≈0.78 at 5,000 m — roughly 22 % weaker than sea level.
 */
export function naturalConvectionFactor(densityRatio: number): number {
  return Math.sqrt(densityRatio)
}

/**
 * Forced-convection derating at fixed volumetric flow.
 * Q̇ = ṁ·c_p·ΔT with ṁ = ρ·V̇, so at an unchanged fan speed the mass flow — and
 * therefore the convective capacity — collapses in direct proportion to ρ.
 */
export function forcedConvectionFactor(densityRatio: number): number {
  return densityRatio
}

/**
 * Fan speed multiplier that restores sea-level mass flow.
 * ṁ ∝ ρ·N, therefore N = N₀ / ρ_rel.  At 5 000 m this is 1.67×, not the 1.77×
 * quoted in the preliminary CFD workbench (see DISCREPANCIES in constants.ts).
 */
export function fanSpeedMultiplier(densityRatio: number): number {
  return 1 / Math.max(densityRatio, 1e-4)
}

/**
 * Fan power penalty.
 * With P ∝ ρ·N³ and the speed compensation above, P/P₀ reduces to 1/ρ_rel².
 * At 5 000 m that is 2.78×, confirming the "~2.8×" figure in master report §3.
 */
export function fanPowerMultiplier(densityRatio: number): number {
  const r = Math.max(densityRatio, 1e-4)
  return 1 / (r * r)
}

/** IEC 60664-1 Table 2 altitude correction factor for clearances. */
const IEC_K_TABLE: ReadonlyArray<readonly [number, number]> = [
  [2000, 1.0],
  [3000, 1.14],
  [5000, 1.48],
  [10000, 1.96],
]

/**
 * IEC 60664-1 altitude correction factor, log-interpolated between table rows.
 * An enclosure built and type-approved for sea level must have every clearance
 * multiplied by this factor before it is acceptable at altitude.
 */
export function iecCorrectionFactor(altitude: number): number {
  if (altitude <= 2000) return 1.0
  if (altitude >= 10000) {
    // Extrapolate on the 5000 m → 10 000 m log-log trend.
    const k = 1.96 * Math.pow(altitude / 10000, 0.5)
    return k
  }
  for (let i = 0; i < IEC_K_TABLE.length - 1; i++) {
    const [h0, k0] = IEC_K_TABLE[i]
    const [h1, k1] = IEC_K_TABLE[i + 1]
    if (altitude >= h0 && altitude <= h1) {
      const t = (Math.log(altitude) - Math.log(h0)) / (Math.log(h1) - Math.log(h0))
      return k0 + (k1 - k0) * t
    }
  }
  return 1.0
}

/**
 * Paschen minimum. Below the minimum the gap is unconditionally ionised, above
 * it breakdown rises with pd. Returns the voltage at the minimum for a
 * cylindrical anode, in volts. Used to reason about sealed HV compartments.
 */
export function paschenMinVoltage(pPascal: number, dMetres: number, B = 2.0e7, A = 0): number {
  const pd = pPascal * dMetres
  return B * pd / (A + Math.log(Math.max(B * pd - Math.log(1.0001), 1.0001)))
}

/**
 * Altitude-equivalent pressure compensation. Returns the local pressure that
 * must be trapped inside a sealed compartment to restore a sea-level
 * dielectric environment: P_local = ρ₀·R·T_local / M.
 */
export function pressureForSeaLevelDielectric(temperatureK: number): number {
  return ((K.rho0 * K.R_air * temperatureK) / K.M_air) / 1000 // kPa
}
