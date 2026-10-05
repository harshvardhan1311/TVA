/* ============================================================================
   TVA — SIMULATION TYPES
   ========================================================================== */

import type { Atmosphere } from '../lib/atmosphere'
import type { SolarState } from '../lib/solar'
import type { BatterySpec, BatteryState } from '../lib/battery'
import type { Enclosure, PcmSpec, ThermalState } from '../lib/thermal'
import type { FailureReading, EnvironmentIndicators } from '../lib/failureModes'
import type { LadderTrace } from '../lib/decisionLadder'
import type { Allocation, BudgetHealth } from '../lib/energy'
import type { HvAssessment } from '../lib/dielectric'
import type { LifeScore } from '../lib/fatigue'

/* ------------------------------------------------------------- CONFIG ---- */

export interface HvConfigUi {
  railVoltageV: number
  clearanceMm: number
  clearanceCorrected: boolean
  sealedPressureKpa: number
  conductorRadiusMm: number
  standoffMm: number
}

export interface AssetProfile {
  id: string
  name: string
  /** Equipment dissipation, W */
  loadW: number
  /** Nominal rail voltage, V — 0 for LV assets */
  railVoltageV: number
  /** Load voltage, V */
  volts: number
  /** Pack mass, kg */
  batteryMassKg: number
  /** Role of the asset at the post */
  role: string
  /** Whether Spark Guard is fitted (auto-set by rail voltage) */
  hvCapable: boolean
}

export const ASSET_PROFILES: ReadonlyArray<AssetProfile> = [
  {
    id: 'radio',
    name: 'Tactical radio set',
    loadW: 45,
    railVoltageV: 350,
    volts: 12,
    batteryMassKg: 1.0,
    role: 'Primary voice and data link for the post',
    hvCapable: true,
  },
  {
    id: 'compute',
    name: 'Edge compute node',
    loadW: 65,
    railVoltageV: 0,
    volts: 24,
    batteryMassKg: 1.4,
    role: 'Signal processing and local storage',
    hvCapable: false,
  },
  {
    id: 'hv',
    name: 'HV transmitter',
    loadW: 120,
    railVoltageV: 3400,
    volts: 48,
    batteryMassKg: 0.0,
    role: 'Radar / long-range transmitter, > 300 V rail',
    hvCapable: true,
  },
  {
    id: 'uav',
    name: 'UAV avionics pack',
    loadW: 28,
    railVoltageV: 0,
    volts: 16.8,
    batteryMassKg: 1.0,
    role: 'Airborne payload, endurance-critical',
    hvCapable: false,
  },
  {
    id: 'sensor',
    name: 'Meteorological sensor head',
    loadW: 12,
    railVoltageV: 0,
    volts: 5,
    batteryMassKg: 0.4,
    role: 'Pressure, humidity and temperature reference',
    hvCapable: false,
  },
]

export interface SimConfig {
  /* --- Environment --- */
  altitudeM: number
  ambientC: number
  humidity: number
  windMs: number
  precipMmH: number
  dustMgM3: number

  /* --- Time --- */
  clockHours: number
  dayOfYear: number
  /** Wall-clock acceleration. 1 = real time, 60 = a minute a second. */
  timeScale: number
  running: boolean

  /* --- Asset --- */
  assetId: string
  loadW: number
  railVoltageV: number
  hv: HvConfigUi

  /* --- Roots layer --- */
  lokiFitted: boolean
  sparkGuardFitted: boolean
  enclosure: Enclosure
  pcm: PcmSpec
  radiatorAreaM2: number
  portAreaM2: number

  /* --- Trunk layer --- */
  fanMode: 'density-compensated' | 'fixed-sea-level'
  fanDesignFlowM3s: number
  fanDesignShaftW: number
  solarEnabled: boolean
  solarArrayAreaM2: number
  solarEfficiency: number
  solarDerate: number
  solarTilt: number

  /* --- Branches --- */
  heaterMaxW: number
  throttleEnabled: boolean
  throttleThresholdC: number

  /* --- Life Guard --- */
  protectedSwingK: number
  unprotectedSwingK: number

  /* --- Battery --- */
  battery: BatterySpec
  soc: number
}

/* -------------------------------------------------------------- STATE ---- */

export interface SimState {
  atmosphere: Atmosphere
  solar: SolarState
  thermal: ThermalState
  battery: BatteryState
  pcm: {
    liquidFraction: number
    latentStoredJ: number
    latentCapacityJ: number
    enthalpyJ: number
    inPlateau: boolean
    hoursRemaining: number
  }
  hv: HvAssessment
  failures: FailureReading[]
  environment: EnvironmentIndicators
  coldLadder: LadderTrace
  hotLadder: LadderTrace
  allocation: Allocation
  budget: BudgetHealth
  life: LifeScore
  /** Waste heat still available to the bank, W */
  wasteHeatW: number
  /** Net system power balance, W */
  netPowerW: number
  /** Internal swing measured over the retained history, K */
  measuredSwingK: number
  /** Mission elapsed, seconds */
  elapsedS: number
  /** Simulated hour of day, continuous */
  simHour: number
  /** Day/night flag */
  isDay: boolean
  /** Convection derating factors, surfaced on several panels */
  factors: {
    naturalConvection: number
    forcedConvection: number
    fanSpeed: number
    fanPower: number
    iecCorrection: number
  }
  /** Photon/UV and radiation context */
  warnings: Warning[]
}

export interface Warning {
  id: string
  severity: 'info' | 'warn' | 'crit'
  text: string
}

/* ------------------------------------------------------------ HISTORY ---- */

export interface HistorySample {
  t: number
  ambientC: number
  dieC: number
  pcmC: number
  batteryC: number
  radiatorC: number
  bankFraction: number
  soc: number
  solarW: number
  loadW: number
  densityRatio: number
  hvMargin: number
  rejectW: number
}

export interface History {
  readonly capacity: number
  samples: HistorySample[]
  push(s: HistorySample): void
  clear(): void
  /** Temperature series for rainflow analysis. */
  temperatureSeries(key: 'dieC' | 'batteryC' | 'pcmC'): number[]
  last(n: number): HistorySample[]
}
