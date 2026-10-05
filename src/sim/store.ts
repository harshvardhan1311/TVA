/* ============================================================================
   TVA — SIMULATION STORE
   ----------------------------------------------------------------------------
   A single zustand store holds the operator configuration, the live physical
   state, and the telemetry history. The tick loop is driven from outside the
   store (see hooks/useSimulation) so that React never re-renders on a
   per-frame schedule it did not ask for.
   ========================================================================== */

import { create } from 'zustand'
import { DEFAULT_CONFIG, createHistory } from './defaults'
import { evaluate, BASE_DT, INITIAL_THERMAL, INITIAL_BATTERY } from './engine'
import type { History, HistorySample, SimConfig, SimState } from './types'
import { ASSET_PROFILES } from './types'
import { applyScenario, getScenario } from '../lib/scenarios'

/** Telemetry is appended every SAMPLE_EVERY ticks. */
const SAMPLE_EVERY = 2

export type ModuleId =
  | 'overview'
  | 'twin'
  | 'atmosphere'
  | 'architecture'
  | 'cycle'
  | 'ladder'
  | 'stress'
  | 'lifeguard'
  | 'sparkguard'
  | 'endurance'
  | 'energy'
  | 'scenarios'
  | 'validation'
  | 'ledger'
  | 'deck'

interface SimStore {
  config: SimConfig
  state: SimState
  history: History
  /** Mission elapsed, seconds of simulated time. */
  elapsed: number
  /** Scenario currently loaded, if any. */
  scenarioId: string | null
  /** Ticks since the last telemetry sample. */
  tick: number

  /* --- mutations --- */
  setConfig: (patch: Partial<SimConfig>) => void
  setHv: (patch: Partial<SimConfig['hv']>) => void
  setEnclosure: (patch: Partial<SimConfig['enclosure']>) => void
  setPcm: (patch: Partial<SimConfig['pcm']>) => void
  setBattery: (patch: Partial<SimConfig['battery']>) => void
  selectAsset: (id: string) => void
  applyScenario: (id: string) => void
  reset: () => void
  toggleRunning: () => void
  clearHistory: () => void
  advance: () => void
}

/** Re-derive the whole physical state from configuration plus prior state. */
function derive(config: SimConfig, thermal: SimState['thermal'], battery: SimState['battery'], history: History) {
  return evaluate(config, thermal, battery, history)
}

const history0 = createHistory()
const config0 = DEFAULT_CONFIG
const state0 = evaluate(config0, INITIAL_THERMAL, INITIAL_BATTERY, history0)

export const useSim = create<SimStore>((set, get) => ({
  config: config0,
  state: state0,
  history: history0,
  elapsed: 0,
  scenarioId: 'changla-night',
  tick: 0,

  setConfig: (patch) => {
    const { config, state, history } = get()
    const next = { ...config, ...patch }
    // Advancing the clock is part of the tick, not a config change.
    if (patch.clockHours !== undefined && patch.clockHours !== config.clockHours) {
      next.clockHours = patch.clockHours
    }
    set({ config: next, state: derive(next, state.thermal, state.battery, history) })
  },

  setHv: (patch) => {
    const { config, state, history } = get()
    const next = { ...config, hv: { ...config.hv, ...patch } }
    set({ config: next, state: derive(next, state.thermal, state.battery, history) })
  },

  setEnclosure: (patch) => {
    const { config, state, history } = get()
    const next = { ...config, enclosure: { ...config.enclosure, ...patch } }
    set({ config: next, state: derive(next, state.thermal, state.battery, history) })
  },

  setPcm: (patch) => {
    const { config, state, history } = get()
    const next = { ...config, pcm: { ...config.pcm, ...patch } }
    set({ config: next, state: derive(next, state.thermal, state.battery, history) })
  },

  setBattery: (patch) => {
    const { config, state, history } = get()
    const next = { ...config, battery: { ...config.battery, ...patch } }
    set({ config: next, state: derive(next, state.thermal, state.battery, history) })
  },

  selectAsset: (id) => {
    const { config, state, history } = get()
    const a = ASSET_PROFILES.find((p) => p.id === id)
    if (!a) return
    const next: SimConfig = {
      ...config,
      assetId: a.id,
      loadW: a.loadW,
      railVoltageV: a.railVoltageV,
      sparkGuardFitted: a.hvCapable ? config.sparkGuardFitted : false,
      battery: { ...config.battery, massKg: a.batteryMassKg || config.battery.massKg },
      hv: {
        ...config.hv,
        railVoltageV: a.railVoltageV,
        sealedPressureKpa: a.railVoltageV > 0 ? config.hv.sealedPressureKpa : 0,
      },
    }
    set({ config: next, state: derive(next, state.thermal, state.battery, history), scenarioId: null })
  },

  applyScenario: (id) => {
    const { config } = get()
    const next = applyScenario(id, config)
    const fresh = createHistory()
    set({
      config: next,
      history: fresh,
      state: evaluate(next, INITIAL_THERMAL, INITIAL_BATTERY, fresh),
      elapsed: 0,
      scenarioId: getScenario(id) ? id : null,
      tick: 0,
    })
  },

  reset: () => {
    const fresh = createHistory()
    set({
      config: DEFAULT_CONFIG,
      history: fresh,
      state: evaluate(DEFAULT_CONFIG, INITIAL_THERMAL, INITIAL_BATTERY, fresh),
      elapsed: 0,
      scenarioId: 'changla-night',
      tick: 0,
    })
  },

  toggleRunning: () => set((s) => ({ config: { ...s.config, running: !s.config.running } })),

  clearHistory: () => {
    const { config, state } = get()
    const fresh = createHistory()
    set({
      history: fresh,
      state: evaluate(config, state.thermal, state.battery, fresh),
      elapsed: 0,
      tick: 0,
    })
  },

  advance: () => {
    const { config, state, history, elapsed, tick } = get()
    if (!config.running) return

    // Advance the clock of day by the wall-clock-scaled time step.
    const simSeconds = BASE_DT
    const nextHour = (config.clockHours + simSeconds / 3600) % 24
    const next: SimConfig = { ...config, clockHours: nextHour }

    const nextState = evaluate(next, state.thermal, state.battery, history)
    const nextTick = tick + 1

    if (nextTick % SAMPLE_EVERY === 0) {
      const sample: HistorySample = {
        t: elapsed + simSeconds,
        ambientC: next.ambientC,
        dieC: nextState.thermal.die,
        pcmC: nextState.thermal.pcm,
        batteryC: nextState.thermal.battery,
        radiatorC: nextState.thermal.radiator,
        bankFraction: nextState.pcm.liquidFraction,
        soc: nextState.battery.soc,
        solarW: nextState.allocation.supplyW,
        loadW: config.loadW,
        densityRatio: nextState.atmosphere.densityRatio,
        hvMargin: nextState.hv.margin,
        rejectW: nextState.thermal.rejectW,
      }
      history.push(sample)
    }

    set({
      config: next,
      state: nextState,
      elapsed: elapsed + simSeconds,
      tick: nextTick,
    })
  },
}))

/* ------------------------------------------------------------- SELECTORS - */

export const useConfig = (): SimConfig => useSim((s) => s.config)
export const useState = (): SimState => useSim((s) => s.state)
export const useHistory = (): History => useSim((s) => s.history)
