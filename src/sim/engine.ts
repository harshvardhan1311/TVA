/* ============================================================================
   TVA — SIMULATION ENGINE
   ----------------------------------------------------------------------------
   `evaluate` is a pure function: configuration in, complete physical state out.
   It is called by the React tick loop and by the diurnal sweep, so the 24-hour
   campaign and the live dashboard are guaranteed to agree — there is exactly
   one implementation of the physics.
   ========================================================================== */

import { atmosphere, fanPowerMultiplier, fanSpeedMultiplier, iecCorrectionFactor, naturalConvectionFactor } from '../lib/atmosphere'
import { solarState, arrayPower, solarTimeFromClock, type SolarConfig } from '../lib/solar'
import {
  DEFAULT_GATE,
  DEFAULT_HEAT_PIPE,
  INITIAL_THERMAL,
  liquidFraction,
  nightRuntimeHours,
  pcmState,
  stepThermal,
  type ThermalState,
} from '../lib/thermal'
import { stepBattery, INITIAL_BATTERY, internalResistance, maxChargeCRate, type BatteryState } from '../lib/battery'
import { assessHv } from '../lib/dielectric'
import { assessFailureModes, environmentIndicators } from '../lib/failureModes'
import { coldLadder, hotLadder } from '../lib/decisionLadder'
import { allocate, budgetHealth } from '../lib/energy'
import { lifeScore, rainflow, cyclesToFailure, DESIGN_CYCLES } from '../lib/fatigue'
import type { LifeScore } from '../lib/fatigue'
import { clamp } from '../lib/format'
import { FIELD_SITE } from '../lib/solar'
import type { History } from './types'
import type { SimConfig, SimState, Warning } from './types'

/** Seconds of simulated time per evaluation. */
export const BASE_DT = 30

export function evaluate(
  cfg: SimConfig,
  prevThermal: ThermalState,
  prevBattery: BatteryState,
  history: History,
): SimState {
  const dt = BASE_DT
  const warnings: Warning[] = []

  /* ------------------------------------------------------------ ATMOSPHERE */
  const atm = atmosphere(cfg.altitudeM)
  const solarCfg: SolarConfig = {
    latitude: FIELD_SITE.latitude,
    longitude: FIELD_SITE.longitude,
    timezoneMeridian: FIELD_SITE.timezoneMeridian,
    altitudePressureKpa: atm.pressure,
    altitude: cfg.altitudeM,
    dayOfYear: cfg.dayOfYear,
    tilt: cfg.solarTilt,
    azimuth: 180,
    area: cfg.solarArrayAreaM2,
    efficiency: cfg.solarEfficiency,
    derate: cfg.solarDerate,
    nameplate: cfg.solarArrayAreaM2 * 1000 * cfg.solarEfficiency * cfg.solarDerate,
  }
  const solarHour = solarTimeFromClock(cfg.clockHours, FIELD_SITE, cfg.dayOfYear)
  const sun = solarState(solarCfg, solarHour)
  const solarW = cfg.solarEnabled ? arrayPower(solarCfg, sun) : 0

  /* ------------------------------------------------------------- HV / SPARK */
  const hvCfg = {
    railVoltageV: cfg.hv.railVoltageV,
    clearanceMm: cfg.hv.clearanceCorrected ? cfg.hv.clearanceMm * iecCorrectionFactor(cfg.altitudeM) : cfg.hv.clearanceMm,
    clearanceCorrected: cfg.hv.clearanceCorrected,
    altitudeM: cfg.altitudeM,
    compartmentTempC: prevThermal.die,
    humidity: cfg.humidity,
    sealedPressureKpa: cfg.hv.sealedPressureKpa,
    conductorRadiusMm: cfg.hv.conductorRadiusMm,
    standoffMm: cfg.hv.standoffMm,
  }
  const hv = assessHv(hvCfg)

  /* -------------------------------------------------------- SMART COOLING */
  // Demand rises with die temperature. Below 45 °C the blower is not needed.
  const rawDemand = clamp((prevThermal.die - 42) / 26, 0, 1)
  const fanDemand = cfg.lokiFitted
    ? cfg.fanMode === 'density-compensated'
      ? rawDemand * clamp(fanSpeedMultiplier(atm.densityRatio), 0, 1.35)
      : rawDemand
    : rawDemand * 1.15
  const fanDuty = clamp(fanDemand, 0, 1.35)

  /* ---------------------------------------------------------- DECISION LOGS */
  const bankFraction = clamp(liquidFraction(prevThermal.pcm, cfg.pcm), 0, 1)
  const wasteHeatW = Math.max(
    0,
    cfg.loadW - prevThermal.lossW - prevThermal.portLossW - prevThermal.radLossW,
  )

  const hot = hotLadder({
    dieC: prevThermal.die,
    bankFraction,
    bankC: prevThermal.pcm,
    solarW,
    radiatorAreaM2: cfg.radiatorAreaM2,
    densityRatio: atm.densityRatio,
    ambientC: cfg.ambientC,
    loadW: cfg.loadW,
    soc: cfg.soc,
  })

  // The cold ladder reads the *unmitigated* ambient, because that is what the
  // pack would otherwise be sitting in.
  const cold = coldLadder({
    batteryC: prevBattery.temperatureC,
    dieC: prevThermal.die,
    bankFraction,
    solarW,
    wasteHeatW: cfg.lokiFitted ? wasteHeatW : 0,
    soc: cfg.soc,
    densityRatio: atm.densityRatio,
    ambientC: cfg.ambientC,
  })

  // Throttling is a trunk action taken only after every other rung has failed.
  const throttled = cfg.throttleEnabled && prevThermal.die > cfg.throttleThresholdC
  const effectiveLoad = throttled ? cfg.loadW * 0.6 : cfg.loadW
  if (throttled) {
    warnings.push({
      id: 'throttle',
      severity: 'warn',
      text: `Processor throttled: die at ${prevThermal.die.toFixed(1)} °C, above the ${cfg.throttleThresholdC} °C limit. Last rung of the hot ladder.`,
    })
  }

  /* ------------------------------------------------------------- HEATER */
  const heatEmergency = prevThermal.die > 70
  const heaterEligible = cfg.lokiFitted && bankFraction < 0.02 && (heatEmergency || prevBattery.temperatureC < 5)
  const heaterW = heaterEligible ? clamp(prevBattery.temperatureC < 2 ? cfg.heaterMaxW : cfg.heaterMaxW * 0.55, 0, cfg.heaterMaxW) : 0
  if (heaterW > 0) {
    warnings.push({
      id: 'heater',
      severity: 'info',
      text: `Film heater drawing ${heaterW.toFixed(1)} W. Heat bank is spent — this is the last rung of the cold ladder.`,
    })
  }

  /* ------------------------------------------------------------- ENERGY */
  const alloc = allocate({
    solarW,
    soc: cfg.soc,
    bankFraction,
    batteryTempC: prevBattery.temperatureC,
    dieTempC: prevThermal.die,
    fanDemand,
    heaterDemandW: heaterW,
    fanDesignW: cfg.fanDesignShaftW,
    densityRatio: atm.densityRatio,
    socFloor: 0.15,
  })

  if (alloc.regime === 'CRITICAL') {
    warnings.push({
      id: 'power',
      severity: 'crit',
      text: 'Supply cannot cover the non-sheddable trunk loads. Protective functions are degraded.',
    })
  }

  /* ---------------------------------------------------------- THERMAL STEP */
  const thermal = stepThermal(
    {
      loadW: effectiveLoad,
      ambientC: cfg.ambientC,
      densityRatio: atm.densityRatio,
      enclosure: cfg.enclosure,
      pcm: cfg.pcm,
      gate: DEFAULT_GATE,
      heatPipe: DEFAULT_HEAT_PIPE,
      portArea: cfg.portAreaM2,
      radiatorArea: cfg.radiatorAreaM2,
      pcmAreaFraction: 0.22,
      batteryMassKg: cfg.battery.massKg,
      batteryCapexJK: cfg.battery.capexJK,
      heaterW: alloc.granted.battery_warmer,
      fanDuty,
      designFlowM3s: cfg.fanDesignFlowM3s,
      designShaftW: cfg.fanDesignShaftW,
      gateWasOpen: prevThermal.gateOpen,
      prev: {
        die: prevThermal.die,
        pcm: prevThermal.pcm,
        radiator: prevThermal.radiator,
        battery: prevThermal.battery,
      },
      dt,
    },
    prevThermal,
  )

  /* --------------------------------------------------------- BATTERY STEP */
  const chargePower = Math.max(0, alloc.supplyW - alloc.totalGrantedW - effectiveLoad)
  const battery = stepBattery(
    prevBattery,
    effectiveLoad,
    prevBattery.temperatureC >= 5,
    chargePower,
    cfg.battery,
    dt,
    2.2,
    cfg.ambientC,
  )
  battery.temperatureC = thermal.battery

  if (!battery.chargeAllowed) {
    warnings.push({
      id: 'lock',
      severity: battery.temperatureC < 0 ? 'crit' : 'warn',
      text: `CHARGE LOCKED: pack at ${battery.temperatureC.toFixed(1)} °C, below the +5 °C comparator set-point. η_anode = ${battery.anodeOverpotentialV.toFixed(3)} V.`,
    })
  }
  if (battery.platingRisk > 0.02) {
    warnings.push({
      id: 'plating',
      severity: 'crit',
      text: `Lithium plating risk index ${battery.platingRisk.toFixed(2)} — η_anode = ${battery.anodeOverpotentialV.toFixed(3)} V < 0 V.`,
    })
  }

  /* ----------------------------------------------------------------- PCM */
  const ps = pcmState(thermal.pcm, cfg.pcm)
  const remainingHours = nightRuntimeHours(cfg.pcm.massKg, Math.max(1, cold.steps.find((s) => s.active)?.powerW || 5), cfg.pcm)

  /* ------------------------------------------------------------- FAILURES */
  const historyC = history.temperatureSeries('dieC')
  const measuredSwingK =
    historyC.length > 4 ? Math.max(...historyC) - Math.min(...historyC) : cfg.protectedSwingK

  const failures = assessFailureModes({
    altitudeM: cfg.altitudeM,
    ambientC: cfg.ambientC,
    humidity: cfg.humidity,
    loadW: effectiveLoad,
    dieC: thermal.die,
    batteryC: battery.temperatureC,
    bankFraction: ps.liquidFraction,
    swingK: cfg.lokiFitted ? measuredSwingK : cfg.unprotectedSwingK,
    hvVoltage: cfg.hv.railVoltageV,
    hvMargin: hv.margin,
    precipMmH: cfg.precipMmH,
    dustMgM3: cfg.dustMgM3,
    lokiFitted: cfg.lokiFitted,
    sparkGuardFitted: cfg.sparkGuardFitted && cfg.hv.railVoltageV >= 300,
  })

  const severe = failures.filter((f) => f.status === 'SEVERE')
  if (severe.length) {
    warnings.push({
      id: 'failures',
      severity: 'crit',
      text: `${severe.length} failure mode${severe.length === 1 ? '' : 's'} in the SEVERE band: ${severe.map((f) => f.id).join(', ')}.`,
    })
  }

  /* ------------------------------------------------------------- LIFE GUARD */
  // With a short history the rainflow count is not meaningful, so TVA reports
  // the analytic projection from the swing ratio instead of a partial count.
  const hasHistory = historyC.length > 12
  const life = hasHistory
    ? lifeScore(historyC, cfg.unprotectedSwingK)
    : projectedLife(measuredSwingK, cfg.unprotectedSwingK)

  /* --------------------------------------------------------- ENVIRONMENT */
  const environment = environmentIndicators(cfg.ambientC, cfg.humidity, sun.elevation, cfg.windMs, sun.dayLength)

  if (environment.condensationRisk === 'CERTAIN' || environment.condensationRisk === 'LIKELY') {
    warnings.push({
      id: 'condensation',
      severity: 'warn',
      text: `Dew point ${environment.dewPointC.toFixed(1)} °C against a ${cfg.ambientC.toFixed(1)} °C ambient — condensation risk on exposed surfaces.`,
    })
  }

  if (cfg.hv.railVoltageV >= 300 && !cfg.sparkGuardFitted) {
    warnings.push({
      id: 'spark-off',
      severity: 'crit',
      text: `Rail at ${cfg.hv.railVoltageV} V with Spark Guard disabled. The device is unprotected against altitude-induced breakdown.`,
    })
  }

  if (!cfg.lokiFitted) {
    warnings.push({
      id: 'unprotected',
      severity: 'info',
      text: 'Retrofit removed. The enclosure is running as an unmodified asset, which is the baseline the panel is comparing against.',
    })
  }

  /* --------------------------------------------------------------- BUDGET */
  const budget = budgetHealth(alloc, battery.energyWh, effectiveLoad, environment.darknessHours)

  /* ------------------------------------------------------------ FACTORS */
  const factors = {
    naturalConvection: naturalConvectionFactor(atm.densityRatio),
    forcedConvection: atm.densityRatio,
    fanSpeed: fanSpeedMultiplier(atm.densityRatio),
    fanPower: fanPowerMultiplier(atm.densityRatio),
    iecCorrection: iecCorrectionFactor(cfg.altitudeM),
  }

  return {
    atmosphere: atm,
    solar: sun,
    thermal,
    battery,
    pcm: {
      liquidFraction: ps.liquidFraction,
      latentStoredJ: ps.latentStoredJ,
      latentCapacityJ: ps.latentCapacityJ,
      enthalpyJ: ps.enthalpyJ,
      inPlateau: ps.inPlateau,
      hoursRemaining: remainingHours,
    },
    hv,
    failures,
    environment,
    coldLadder: cold,
    hotLadder: hot,
    allocation: alloc,
    budget,
    life,
    wasteHeatW,
    netPowerW: solarW - alloc.totalGrantedW - effectiveLoad,
    measuredSwingK,
    elapsedS: 0,
    simHour: cfg.clockHours,
    isDay: sun.isDay,
    factors,
    warnings,
  }
}

/* ----------------------------------------------------- DERIVED UTILITIES - */

/**
 * Life score before enough history has accumulated for rainflow counting to
 * mean anything. Places the assembly on the same Miner line the rainflow path
 * will use: damage = design allowance / N_f(ΔT_achieved).
 */
function projectedLife(achievedSwingK: number, unprotectedSwingK: number): LifeScore {
  const range = Math.max(achievedSwingK, 0.5)
  const tMaxC = range + 20
  const n = cyclesToFailure(range, 1 / 86400, tMaxC)
  const damage = DESIGN_CYCLES / Math.max(n, 1)
  const remaining = clamp(1 - damage, 0, 1)
  return {
    score: remaining * 100,
    status:
      remaining > 0.6 ? 'NOMINAL' : remaining > 0.3 ? 'DEGRADED' : remaining > 0.08 ? 'MARGINAL' : 'CRITICAL',
    equivalentCycles: n,
    criticalRangeK: range,
    achievedSwingK: range,
    swingReductionPct: (1 - range / Math.max(unprotectedSwingK, 1e-6)) * 100,
  }
}

export const cellMaxChargeRate = maxChargeCRate
export const cellResistance = internalResistance
export const fatigueHistogram = rainflow

export { INITIAL_THERMAL, INITIAL_BATTERY }
