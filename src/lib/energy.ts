/* ============================================================================
   TVA — TRUNK ENERGY BUDGET
   ----------------------------------------------------------------------------
   Master report §2, Layer 2: "Manages a single shared power budget across all
   modules, distributing energy dynamically based on priority, current state of
   charge, and solar availability."

   Every consumer is ranked. The allocator walks the ladder from the top and
   funds what it can, then reports the shortfall. The film heater is placed
   last in absolute terms, ahead of the processor throttle but behind every
   thermal-protection consumer, which is the whole point of the architecture.
   ========================================================================== */

import { clamp } from './format'

/* ------------------------------------------------------------- LOADS ----- */

export type LoadId =
  | 'controller'
  | 'trunk_sensing'
  | 'comms_relay'
  | 'telemetry'
  | 'smart_cooling'
  | 'spark_guard'
  | 'battery_warmer'

export interface LoadSpec {
  id: LoadId
  name: string
  /** Layer the consumer belongs to */
  layer: 'ROOT' | 'TRUNK' | 'BRANCH'
  /** Allocation priority — 1 is funded first */
  priority: number
  /** Minimum useful power, W */
  minW: number
  /** Full allotment, W */
  maxW: number
  /** Power draw when idle, W */
  idleW: number
  /** Consumer may be shed entirely to protect the pack */
  sheddable: boolean
  description: string
}

export const LOADS: ReadonlyArray<LoadSpec> = [
  {
    id: 'controller',
    name: 'STM32 Controller',
    layer: 'TRUNK',
    priority: 1,
    minW: 0.42,
    maxW: 0.5,
    idleW: 0.42,
    sheddable: false,
    description:
      'Central sensing and control core. Design target < 0.5 W; never shed — losing it blinds every Roots-layer fail-safe.',
  },
  {
    id: 'spark_guard',
    name: 'Spark Guard Sensor',
    layer: 'BRANCH',
    priority: 2,
    minW: 0.28,
    maxW: 0.35,
    idleW: 0.28,
    sheddable: false,
    description: 'UV photodiode plus HF current coil. Only fitted above 300 V.',
  },
  {
    id: 'trunk_sensing',
    name: 'BMP390 + SHT40 Sensing',
    layer: 'TRUNK',
    priority: 3,
    minW: 0.11,
    maxW: 0.14,
    idleW: 0.11,
    sheddable: false,
    description: 'Pressure, humidity, temperature and NTC probe conditioning.',
  },
  {
    id: 'comms_relay',
    name: 'Comms Relay Buffer',
    layer: 'BRANCH',
    priority: 4,
    minW: 1.4,
    maxW: 2.0,
    idleW: 1.6,
    sheddable: true,
    description: 'Keeps the mesh link alive when ice loading degrades the antenna.',
  },
  {
    id: 'telemetry',
    name: 'Telemetry Uplink',
    layer: 'BRANCH',
    priority: 5,
    minW: 0.55,
    maxW: 0.9,
    idleW: 0.62,
    sheddable: true,
    description: 'Health score, thermal ledger and event log uplink to the post.',
  },
  {
    id: 'smart_cooling',
    name: 'Smart Cooling Blower',
    layer: 'BRANCH',
    priority: 6,
    minW: 0,
    maxW: 8.0,
    idleW: 0,
    sheddable: true,
    description: 'Density-compensated fan. P ∝ ρN³, so it is the first large consumer to be starved.',
  },
  {
    id: 'battery_warmer',
    name: 'Battery Warmer Film',
    layer: 'BRANCH',
    priority: 7,
    minW: 0,
    maxW: 20.0,
    idleW: 0,
    sheddable: true,
    description:
      'Polyimide heater in an aerogel sleeve. Absolute last resort — only ever funded after the heat bank is exhausted.',
  },
]

/* ---------------------------------------------------------- ALLOCATION --- */

export interface EnergyInputs {
  /** Solar array output, W */
  solarW: number
  /** Pack state of charge, 0–1 */
  soc: number
  /** Heat bank liquid fraction, 0–1 */
  bankFraction: number
  /** Battery core temperature, °C */
  batteryTempC: number
  /** Die temperature, °C */
  dieTempC: number
  /** Duty requested by Smart Cooling, 0–1.4 */
  fanDemand: number
  /** Heater demand from the decision ladder, W */
  heaterDemandW: number
  /** Fan design shaft power at full speed, W */
  fanDesignW: number
  /** Density ratio at the operating altitude */
  densityRatio: number
  /** Allow the pack to be discharged to this SOC before shedding begins */
  socFloor: number
}

export interface Allocation {
  /** W granted to each consumer */
  granted: Record<LoadId, number>
  /** True where the consumer got everything it asked for */
  satisfied: Record<LoadId, boolean>
  totalDemandW: number
  totalGrantedW: number
  /** Supply available this step, W */
  supplyW: number
  /** Supply net of the equipment's own dissipation */
  netSupplyW: number
  /** Consumers that were cut back */
  shed: LoadId[]
  /** First consumer that could not be fully funded */
  firstShortfall: LoadId | null
  /** Sum of all critical (non-sheddable) consumers, W */
  criticalW: number
  /** Headroom above the critical floor, W */
  headroomW: number
  /** The band the allocator is operating in */
  regime: 'SOLAR-SURPLUS' | 'BALANCED' | 'SHEDDING' | 'CRITICAL'
  rationale: string
}

export function allocate(x: EnergyInputs): Allocation {
  const supplyW = x.solarW
  // The protected equipment's own dissipation is the first call on the supply.
  const criticalW = LOADS.filter((l) => !l.sheddable).reduce((s, l) => s + l.idleW, 0)
  const netSupplyW = supplyW - criticalW

  const demand: Record<LoadId, number> = {
    controller: LOADS[0].idleW,
    trunk_sensing: 0,
    spark_guard: 0,
    comms_relay: 0,
    telemetry: 0,
    smart_cooling: 0,
    battery_warmer: 0,
  }

  // Spark Guard only draws when it is actually fitted.
  demand.spark_guard = 0.3
  demand.trunk_sensing = 0.12
  demand.telemetry = x.soc > x.socFloor + 0.1 ? 0.62 : 0.3
  demand.comms_relay = 1.6
  demand.smart_cooling =
    x.fanDemand > 0 ? x.fanDesignW * x.densityRatio * x.fanDemand ** 3 : 0
  demand.battery_warmer = x.heaterDemandW

  // The heater only earns a place on the ladder when the bank is spent and the
  // pack is genuinely at risk. This is the master report's "last resort" gate.
  const bankExhausted = x.bankFraction < 0.02
  const packAtRisk = x.batteryTempC < 5
  const heatEmergency = x.dieTempC > 78
  if (!bankExhausted && !heatEmergency) demand.battery_warmer = 0
  if (x.soc <= x.socFloor) demand.battery_warmer = 0
  if (x.soc <= x.socFloor && !packAtRisk) demand.comms_relay = 0

  const totalDemandW = Object.values(demand).reduce((a, b) => a + b, 0)

  const granted = {} as Record<LoadId, number>
  const satisfied = {} as Record<LoadId, boolean>
  let remaining = Math.max(0, supplyW)
  let firstShortfall: LoadId | null = null
  const shed: LoadId[] = []

  const ordered = [...LOADS].sort((a, b) => a.priority - b.priority)
  for (const load of ordered) {
    const want = demand[load.id]
    if (want <= 0) {
      granted[load.id] = 0
      satisfied[load.id] = true
      continue
    }
    const give = clamp(Math.min(want, remaining), 0, want)
    granted[load.id] = give
    const ok = give >= Math.min(want, load.minW) - 1e-9
    satisfied[load.id] = ok
    if (!ok) {
      shed.push(load.id)
      if (!firstShortfall) firstShortfall = load.id
    }
    remaining -= give
  }

  const headroomW = supplyW - criticalW
  const regime: Allocation['regime'] =
    supplyW <= criticalW
      ? 'CRITICAL'
      : netSupplyW > totalDemandW
        ? 'SOLAR-SURPLUS'
        : netSupplyW >= totalDemandW - 0.05
          ? 'BALANCED'
          : 'SHEDDING'

  return {
    granted,
    satisfied,
    totalDemandW,
    totalGrantedW: Object.values(granted).reduce((a, b) => a + b, 0),
    supplyW,
    netSupplyW,
    shed,
    firstShortfall,
    criticalW,
    headroomW,
    regime,
    rationale: rationaleFor(regime, supplyW, shed, firstShortfall, packAtRisk, bankExhausted),
  }
}

function rationaleFor(
  regime: Allocation['regime'],
  supply: number,
  shed: LoadId[],
  first: LoadId | null,
  packAtRisk: boolean,
  bankExhausted: boolean,
): string {
  switch (regime) {
    case 'SOLAR-SURPLUS':
      return `Array delivering ${supply.toFixed(1)} W. Every consumer funded; ${first ? '' : ''}surplus is charging the pack.`
    case 'BALANCED':
      return 'Array output matches demand. No consumer is being cut back.'
    case 'SHEDDING': {
      const name = first ? LOADS.find((l) => l.id === first)?.name : 'lower-priority loads'
      const detail = bankExhausted
        ? ' Heat bank is spent, so the film heater has entered the ladder.'
        : packAtRisk
          ? ' Pack is below the charge-lock set-point.'
          : ''
      return `Shortfall. Shedding ${shed.length} consumer${shed.length === 1 ? '' : 's'}, first cut: ${name}.${detail}`
    }
    case 'CRITICAL':
      return 'Supply cannot even cover the non-sheddable trunk loads. Protective functions are degraded.'
  }
}

/* ------------------------------------------------------------ HEALTH ----- */

export interface BudgetHealth {
  /** Fraction of total demand met, 0–1 */
  served: number
  /** Net watts charged into the pack this step */
  netChargeW: number
  /** Hours of runway at the present net rate; Infinity when charging */
  runwayHours: number
  /** Effective autonomy at the present draw, hours */
  autonomyHours: number
  /** Whether the pack can sustain full load through the coming night */
  overnightCapable: boolean
  verdict: string
}

export function budgetHealth(
  a: Allocation,
  packEnergyWh: number,
  loadW: number,
  hoursOfDarkness: number,
): BudgetHealth {
  const served = a.totalDemandW > 0 ? a.totalGrantedW / a.totalDemandW : 1
  const netChargeW = a.supplyW - a.totalGrantedW - loadW
  const autonomyHours = loadW > 0.01 ? packEnergyWh / loadW : Infinity
  const overnightCapable = netChargeW >= 0 || packEnergyWh >= loadW * hoursOfDarkness
  return {
    served,
    netChargeW,
    runwayHours: netChargeW < 0 ? -packEnergyWh / netChargeW : Infinity,
    autonomyHours,
    overnightCapable,
    verdict: overnightCapable
      ? 'Pack sustains the coming night at present draw.'
      : `Pack holds ${autonomyHours.toFixed(1)} h against ${hoursOfDarkness.toFixed(1)} h of darkness — deficit of ${((hoursOfDarkness - autonomyHours) * loadW).toFixed(0)} Wh.`,
  }
}
