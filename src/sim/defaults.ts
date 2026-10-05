/* ============================================================================
   TVA — SIMULATION DEFAULTS & TUNING
   ========================================================================== */

import { CONSTANTS as K } from '../lib/constants'
import { DEFAULT_BATTERY } from '../lib/battery'
import { DEFAULT_PCM, DEFAULT_GATE, DEFAULT_HEAT_PIPE } from '../lib/thermal'
import { FIELD_SITE, ARRAY_WINTER } from '../lib/solar'
import type { SimConfig, History, HistorySample } from './types'

export const DEFAULT_CONFIG: SimConfig = {
  /* Environment — mid-winter, Chang La */
  altitudeM: 5364,
  ambientC: -35,
  humidity: 0.35,
  windMs: 4.2,
  precipMmH: 0.0,
  dustMgM3: 12,

  /* Time — a few hours before sunrise on the winter solstice */
  clockHours: 6.2,
  dayOfYear: 355,
  timeScale: 60,
  running: true,

  /* Asset — tactical radio */
  assetId: 'radio',
  loadW: 45,
  railVoltageV: 350,
  hv: {
    railVoltageV: 350,
    clearanceMm: 4,
    clearanceCorrected: false,
    sealedPressureKpa: 0,
    conductorRadiusMm: 3,
    standoffMm: 12,
  },

  /* Roots */
  lokiFitted: true,
  sparkGuardFitted: true,
  enclosure: {
    volumeL: 10,
    insulationT: K.aerogel_t,
    insulationK: K.aerogel_k,
    wallCapexJ_m2K: 4200,
  },
  pcm: DEFAULT_PCM,
  radiatorAreaM2: 0.34,
  portAreaM2: 0.0021,

  /* Trunk */
  fanMode: 'density-compensated',
  fanDesignFlowM3s: 0.024,
  fanDesignShaftW: 7.5,
  solarEnabled: true,
  solarArrayAreaM2: ARRAY_WINTER.area,
  solarEfficiency: ARRAY_WINTER.efficiency,
  solarDerate: ARRAY_WINTER.derate,
  solarTilt: ARRAY_WINTER.tilt,

  /* Branches */
  heaterMaxW: 20,
  throttleEnabled: true,
  throttleThresholdC: 78,

  /* Life Guard */
  protectedSwingK: 30,
  unprotectedSwingK: K.dT_unprotected,

  /* Battery */
  battery: DEFAULT_BATTERY,
  soc: 0.78,
}

export const FIELD_SITE_INFO = FIELD_SITE

/* -------------------------------------------------------------- HISTORY -- */

const HISTORY_CAPACITY = 2880 // 24 h at 2-minute sampling

class RingHistory implements History {
  readonly capacity = HISTORY_CAPACITY
  samples: HistorySample[] = []

  push(s: HistorySample): void {
    this.samples.push(s)
    if (this.samples.length > this.capacity) {
      this.samples.splice(0, this.samples.length - this.capacity)
    }
  }

  clear(): void {
    this.samples = []
  }

  temperatureSeries(key: 'dieC' | 'batteryC' | 'pcmC'): number[] {
    return this.samples.map((s) => s[key])
  }

  last(n: number): HistorySample[] {
    return this.samples.slice(Math.max(0, this.samples.length - n))
  }
}

export function createHistory(): History {
  return new RingHistory()
}

/* ------------------------------------------------------------ GATE SPEC -- */

export const GATE_SPEC = DEFAULT_GATE
export const PIPE_SPEC = DEFAULT_HEAT_PIPE
