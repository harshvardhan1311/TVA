/* ============================================================================
   TVA — SOLAR GEOMETRY & RADIATION
   ----------------------------------------------------------------------------
   Clear-sky irradiance at altitude.
   Kasten–Young air mass, Hottel-style clear-sky attenuation, isotropic sky
   diffuse. TVA is not a solar-position-of-record tool: it resolves the diurnal
   energy budget that decides whether the PCM bank charges at all, and it
   quantifies the one genuinely favourable consequence of thin air — a shorter
   atmospheric path means MORE direct beam reaches the panel, not less.
   ========================================================================== */

import { clamp } from './format'
import { standardPressure } from './atmosphere'

const SOLAR_CONSTANT = 1361 // W/m²

export interface SolarState {
  /** Solar hour angle clock, 0–24 solar hours */
  hour: number
  /** Solar declination, degrees */
  declination: number
  /** Solar elevation above the horizon, degrees (negative at night) */
  elevation: number
  /** Solar azimuth, degrees clockwise from north */
  azimuth: number
  /** Kasten–Young relative air mass (∞ below the horizon) */
  airMass: number
  /** Extraterrestrial normal irradiance, W/m² */
  dni0: number
  /** Direct normal irradiance at the site, W/m² */
  dni: number
  /** Diffuse horizontal irradiance at the site, W/m² */
  dhi: number
  /** Global horizontal irradiance at the site, W/m² */
  ghi: number
  /** Plane-of-array irradiance, W/m² */
  poa: number
  /** Day length, hours */
  dayLength: number
  isDay: boolean
}

export interface SiteGeometry {
  latitude: number
  longitude: number
  /** Standard meridian of the site's time zone, degrees east of Greenwich. */
  timezoneMeridian: number
  /** Mean site pressure, kPa — drives the altitude correction on air mass. */
  altitudePressureKpa: number
  /** Site altitude, m — reported alongside the geometry. */
  altitude: number
}

export interface SolarConfig extends SiteGeometry {
  dayOfYear: number
  /** Panel tilt from horizontal, degrees */
  tilt: number
  /** Panel azimuth, degrees clockwise from north */
  azimuth: number
  /** Collector's gross nameplate area, m² */
  area: number
  /** Cell conversion efficiency at STC */
  efficiency: number
  /** System derate: wiring, mismatch, soiling, low-light, temperature */
  derate: number
  /** Inverter / nameplate ceiling, W */
  nameplate: number
}

/* ------------------------------------------------------------- GEOMETRY -- */

/** Solar declination, degrees (Cooper's equation). */
export function declination(dayOfYear: number): number {
  return 23.45 * Math.sin(((2 * Math.PI) / 365) * (dayOfYear - 81))
}

/** Equation of time, minutes. */
export function equationOfTime(dayOfYear: number): number {
  const b = ((2 * Math.PI) / 364) * (dayOfYear - 81)
  return 9.87 * Math.sin(2 * b) - 7.53 * Math.cos(b) - 1.5 * Math.sin(b)
}

/** Day length in hours for a latitude/declination pair. */
export function dayLengthHours(latitude: number, dayOfYear: number): number {
  const dec = (declination(dayOfYear) * Math.PI) / 180
  const lat = (latitude * Math.PI) / 180
  const cosH0 = clamp(-Math.tan(lat) * Math.tan(dec), -1, 1)
  return (2 * (Math.acos(cosH0) * 180)) / (Math.PI * 15)
}

/** Solar time from clock time, correcting longitude offset and the equation of time. */
export function solarTimeFromClock(
  clockHour: number,
  site: Pick<SiteGeometry, 'longitude' | 'timezoneMeridian'>,
  dayOfYear: number,
): number {
  const lonOffset = 4 * (site.longitude - site.timezoneMeridian)
  return clockHour + lonOffset / 60 + equationOfTime(dayOfYear) / 60
}

/* --------------------------------------------------------------- STATE --- */

export function solarState(cfg: SolarConfig, solarHour: number): SolarState {
  const { latitude, dayOfYear, altitudePressureKpa } = cfg
  const lat = (latitude * Math.PI) / 180
  const dec = (declination(dayOfYear) * Math.PI) / 180
  const h = ((solarHour - 12) * 15 * Math.PI) / 180

  const sinEl = Math.sin(lat) * Math.sin(dec) + Math.cos(lat) * Math.cos(dec) * Math.cos(h)
  const elevation = (Math.asin(clamp(sinEl, -1, 1)) * 180) / Math.PI

  // Azimuth measured clockwise from north.
  const cosEl = Math.cos((elevation * Math.PI) / 180)
  const azimuth =
    elevation <= 0
      ? 180
      : (Math.atan2(Math.sin(h), Math.cos(h) * Math.sin(lat) - Math.tan(dec) * Math.cos(lat)) * 180) /
          Math.PI +
        180

  // Kasten–Young relative air mass.
  const zenith = 90 - elevation
  const zRad = (zenith * Math.PI) / 180
  const am =
    elevation > 0 ? 1 / (Math.cos(zRad) + 0.50572 * Math.pow(96.07995 - zenith, -1.6364)) : Infinity

  // Earth–Sun distance correction.
  const gamma = ((2 * Math.PI) / 365) * (dayOfYear - 1)
  const dni0 = SOLAR_CONSTANT * (1 + 0.033 * Math.cos(gamma))

  // Site pressure correction: the absolute air mass is the relative air mass
  // scaled by the site pressure against sea level.
  const pSite = altitudePressureKpa ?? standardPressure(0)
  const pRatio = pSite / 101.325
  const amAbs = Math.min(am * pRatio, 40)
  const tauBeam = Math.exp(-0.164 * Math.pow(amAbs, 0.4324))
  const tauDiffuse = Math.exp(-0.058 * amAbs)

  const dni = elevation > 0 ? dni0 * tauBeam : 0
  const dhi = elevation > 0 ? dni0 * tauDiffuse : 0
  const ghi = elevation > 0 ? dni * Math.sin((elevation * Math.PI) / 180) + dhi : 0
  const poa = elevation > 0 ? planeOfArray(cfg, dni, dhi, elevation, azimuth) : 0

  void cosEl

  return {
    hour: solarHour,
    declination: (dec * 180) / Math.PI,
    elevation,
    azimuth: (azimuth + 360) % 360,
    airMass: am,
    dni0,
    dni,
    dhi,
    ghi,
    poa,
    dayLength: dayLengthHours(latitude, dayOfYear),
    isDay: elevation > 0,
  }
}

/**
 * Plane-of-array irradiance from a unit-vector dot product.
 * Sun:      s = (cos el · sin az,  cos el · cos az,  sin el)   [E, N, U]
 * Collector: n = (cos β · sin γ,   cos β · cos γ,   sin β)    [E, N, U]
 * POA = DNI · max(s·n, 0) + DHI · (1 + cos β)/2 + ρ_g · (DNI · max(s·n, 0) + DHI) · (1 − cos β)/2
 *
 * GHI is not an argument, so the ground-reflected term uses the beam-plus-diffuse
 * horizontal component as its horizon source. That keeps ρ_g live instead of
 * silently zero, at the cost of a slight over-estimate for a low-albedo site.
 */
export function planeOfArray(
  cfg: Pick<SolarConfig, 'tilt' | 'azimuth'>,
  dni: number,
  dhi: number,
  elevation: number,
  azimuth: number,
  groundReflectance = 0.25,
): number {
  const el = (elevation * Math.PI) / 180
  const az = (azimuth * Math.PI) / 180
  const b = (cfg.tilt * Math.PI) / 180
  const g = (cfg.azimuth * Math.PI) / 180

  const sx = Math.cos(el) * Math.sin(az)
  const sy = Math.cos(el) * Math.cos(az)
  const sz = Math.sin(el)

  const nx = Math.cos(b) * Math.sin(g)
  const ny = Math.cos(b) * Math.cos(g)
  const nz = Math.sin(b)

  const cosTheta = Math.max(0, sx * nx + sy * ny + sz * nz)
  const skyView = (1 + Math.cos(b)) / 2
  const groundView = (1 - Math.cos(b)) / 2
  const ground = groundReflectance * (dni * cosTheta + dhi) * groundView
  return dni * cosTheta + dhi * skyView + ground
}

/** Electrical output of the array, W. */
export function arrayPower(cfg: SolarConfig, st: SolarState): number {
  if (!st.isDay) return 0
  return Math.min(st.poa * cfg.area * cfg.efficiency * cfg.derate, cfg.nameplate)
}

/* ---------------------------------------------------------- SITE DATA --- */

export const FIELD_SITE = {
  label: 'Chang La, Ladakh',
  latitude: 34.5,
  longitude: 77.05,
  timezoneMeridian: 82.5, // IST = UTC+5.5 → 82.5°E
  altitude: 5364,
  altitudePressureKpa: 39.6,
} as const

/** Winter-optimised array: 45° tilt, due south. */
export const ARRAY_WINTER = {
  dayOfYear: 355,
  tilt: 45,
  azimuth: 180,
  area: 0.42,
  efficiency: 0.22,
  derate: 0.78,
  nameplate: 80,
} as const satisfies Omit<SolarConfig, keyof SiteGeometry>

/** Summer-optimised array: shallow 20° tilt to catch the long high arc. */
export const ARRAY_SUMMER = {
  dayOfYear: 172,
  tilt: 20,
  azimuth: 180,
  area: 0.42,
  efficiency: 0.22,
  derate: 0.78,
  nameplate: 80,
} as const satisfies Omit<SolarConfig, keyof SiteGeometry>

/* ------------------------------------------------- ALTITUDE ADVANTAGE --- */

/**
 * Direct-beam gain from altitude.
 * At 5 000 m the absolute air mass is ~0.39× the sea-level value, so clear-sky
 * DNI is ~25 % HIGHER for the same zenith angle. The baseline unit is sitting
 * on free energy it never collects.
 */
export function directBeamAltitudeGain(altitude: number, elevation: number): number {
  if (elevation <= 0) return 0
  const gain = dniAt(altitude, elevation) / dniAt(0, elevation) - 1
  return gain
}

function dniAt(altitude: number, elevation: number): number {
  const pRatio = standardPressure(altitude) / 101.325
  const zenith = 90 - Math.max(0.5, elevation)
  const zRad = (zenith * Math.PI) / 180
  const amRel = 1 / (Math.cos(zRad) + 0.50572 * Math.pow(96.07995 - zenith, -1.6364))
  return SOLAR_CONSTANT * Math.exp(-0.164 * Math.pow(amRel * pRatio, 0.4324))
}
