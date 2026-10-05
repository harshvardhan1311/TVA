/* ============================================================================
   TVA — THERMAL PHYSICS
   ----------------------------------------------------------------------------
   Lumped-capacitance network for the Vriksh enclosure, four nodes:

        ┌────────────── K_hp (methanol heat pipe) ──────────────┐
        │                                                       ▼
     equipment die ──K_j/k_port──► ambient      PCM heat bank ──K_bank──► ambient
        │                                                       │
        └──K_gate (wax valve, passive)──► radiator ──K_rad──► ambient
                                                                │
                                        battery bay ◄──K_ib────┘
                                             ▲                   │
                                             └── heater power ──┘

   The bank and battery nodes carry real thermal capacitance; the die node is
   stiff and is solved implicitly every step. Each step the 4×4 system is
   solved exactly by Gaussian elimination, so the integrator is unconditionally
   stable regardless of the time step the operator dials in.
   ========================================================================== */

import { CONSTANTS as K } from './constants'
import { clamp, remap, smoothstep } from './format'

/* ========================================================== GEOMETRY ==== */

export interface Enclosure {
  /** Internal volume, litres */
  volumeL: number
  /** Aerogel blanket thickness, m */
  insulationT: number
  /** Aerogel conductivity, W/m·K */
  insulationK: number
  /** Internal cavity surface area, m² — derived from volume unless supplied */
  areaM2?: number
  /** Wall areal heat capacity, J/(m²·K) — aluminium shell + inner liner */
  wallCapexJ_m2K: number
}

export interface EnclosureGeometry {
  /** Equivalent cube edge, m */
  edge: number
  /** Internal surface area, m² */
  area: number
  /** Internal volume, m³ */
  volume: number
  /** Thermal capacitance of the empty shell, J/K */
  shellCapacitance: number
}

/** Envelope area of the internal cavity, treating the cavity as a cube. */
export function enclosureGeometry(e: Enclosure): EnclosureGeometry {
  const volume = e.volumeL / 1000
  const edge = Math.cbrt(volume)
  const area = e.areaM2 ?? 6 * edge * edge
  return { edge, area, volume, shellCapacitance: area * e.wallCapexJ_m2K }
}

/* ======================================================= INSULATION ===== */

/**
 * Steady-state conduction loss through the aerogel jacket.
 *     Q̇ = k · A · ΔT / L
 * Reference case: a 10 L cavity → A = 0.278 m², k = 0.0175 W/m·K,
 * L = 20 mm, ΔT = 30 K → 7.31 W, inside the 6–12 W band of master report §3.
 */
export function conductionLoss(
  ambientC: number,
  internalC: number,
  e: Enclosure,
  geo?: EnclosureGeometry,
): number {
  const g = geo ?? enclosureGeometry(e)
  return (e.insulationK * g.area * Math.abs(internalC - ambientC)) / e.insulationT
}

/** Thermal resistance of the jacket, K/W. */
export function jacketResistance(e: Enclosure, geo?: EnclosureGeometry): number {
  const g = geo ?? enclosureGeometry(e)
  return e.insulationT / (e.insulationK * g.area)
}

/* ==================================================== CONVECTION LAWS === */

/**
 * Linearised natural-convection conductance, W/K.
 *
 * A plain finned exchanger at 45 W/K would defeat the entire premise, so TVA
 * sizes every convecting surface from the same thin-air law. Using Nu ∝ Ra^(1/4)
 * with Ra ∝ ρ² gives h ∝ ρ^(2/3); master report §3 quotes the cruder √ρ law
 * (0.78 at 5 000 m). TVA uses √ρ — the conservative, quoted form — and the
 * p2/3 value is available from `naturalConvectionFactor`.
 *
 * The √ΔT dependence is linearised about the previous operating point so the
 * conductance stays finite at ΔT → 0 and the implicit solve cannot blow up.
 */
export function naturalConduction(
  surfaceC: number,
  ambientC: number,
  areaM2: number,
  densityRatio: number,
  referenceDT = 30,
  hPerArea = 4.2,
): number {
  const dT = Math.max(0, surfaceC - ambientC)
  if (dT < 0.02 || areaM2 <= 0) return 0
  const ratio = dT / referenceDT
  const linearised = 0.5 * (Math.sqrt(ratio) + 1)
  return hPerArea * Math.sqrt(Math.max(densityRatio, 1e-6)) * areaM2 * linearised
}

/** Master-report natural-convection derating, √(ρ/ρ₀). */
export function naturalConvectionFactor(densityRatio: number): number {
  return Math.sqrt(Math.max(densityRatio, 1e-6))
}

/**
 * Forced convection from the Smart Cooling branch.
 *     Q̇ = ṁ·c_p·ΔT ,  ṁ = ρ·V̇
 * At an unchanged fan speed the mass flow — and therefore the convective
 * capacity — collapses in direct proportion to ρ. Returns the duty required to
 * carry `requiredW`, the rpm ratio that restores sea-level mass flow
 * (N ∝ 1/ρ_rel), and the shaft power (P ∝ ρ·N³).
 */
export function forcedConvection(
  requiredW: number,
  ambientC: number,
  surfaceC: number,
  densityRatio: number,
  designFlowM3s: number,
  designShaftW: number,
): {
  capacityW: number
  duty: number
  rpmRatio: number
  shaftW: number
  massFlowKg_s: number
} {
  const dT = Math.max(0.5, surfaceC - ambientC)
  const seaLevelMassFlow = densityRatio * designFlowM3s
  const capacityW = seaLevelMassFlow * K.cp_air * dT
  const duty = clamp(requiredW / Math.max(capacityW, 1e-9), 0, 1.4)
  const rpmRatio = 1 / Math.max(densityRatio, 1e-4)
  const shaftW = designShaftW * densityRatio * duty * duty * duty
  return {
    capacityW,
    duty,
    rpmRatio,
    shaftW,
    massFlowKg_s: densityRatio * designFlowM3s * duty,
  }
}

/* ============================================================== PCM ====== */

export interface PcmSpec {
  massKg: number
  /** Melting point, °C */
  tmC: number
  /** Width of the mushy melting band, K */
  bandK: number
  /** Latent heat, J/kg */
  latentJJkg: number
  cpSolid: number
  cpLiquid: number
}

export const DEFAULT_PCM: PcmSpec = {
  massKg: 1.2,
  tmC: K.pcm_tm,
  bandK: K.pcm_tm_band,
  latentJJkg: K.pcm_latent,
  cpSolid: K.pcm_cp_solid,
  cpLiquid: K.pcm_cp_liquid,
}

/** Liquid fraction at a temperature, using a smooth mushy transition. */
export function liquidFraction(T: number, spec: PcmSpec = DEFAULT_PCM): number {
  const half = spec.bandK / 2
  return smoothstep(remap(T, spec.tmC - half, spec.tmC + half, 0, 1))
}

/** Differential heat capacity including the latent term, J/K. */
export function pcmHeatCapacity(T: number, spec: PcmSpec = DEFAULT_PCM): number {
  const half = spec.bandK / 2
  const base = T < spec.tmC ? spec.cpSolid : spec.cpLiquid
  const inBand = T > spec.tmC - half && T < spec.tmC + half
  return spec.massKg * (base + (inBand ? spec.latentJJkg / spec.bandK : 0))
}

/**
 * Enthalpy above the solid state at the band onset, J.
 * Integrated numerically against the differential capacity so the sensible and
 * latent terms stay mutually consistent.
 */
export function pcmEnthalpy(T: number, spec: PcmSpec = DEFAULT_PCM): number {
  const half = spec.bandK / 2
  const t0 = spec.tmC - half
  if (T <= t0) return spec.massKg * spec.cpSolid * (T - t0)
  if (T >= spec.tmC + half) {
    return (
      spec.massKg *
      (spec.cpSolid * half + spec.latentJJkg + spec.cpLiquid * (T - (spec.tmC + half)))
    )
  }
  const steps = 32
  const dt = half / steps
  let q = spec.cpSolid * half
  for (let i = 0; i < steps; i++) q += (spec.latentJJkg / spec.bandK) * dt
  return spec.massKg * q
}

/** Energy required to move a bank from `from` to `to`, J. */
export function pcmEnergyBetween(from: number, to: number, spec: PcmSpec = DEFAULT_PCM): number {
  if (to === from) return 0
  const steps = 64
  const dt = (to - from) / steps
  let q = 0
  for (let i = 0; i < steps; i++) q += pcmHeatCapacity(from + dt * (i + 0.5), spec) * dt
  return q
}

export interface PcmState {
  temperatureC: number
  /** Enthalpy above the band onset, J (can be negative when the bank is cold) */
  enthalpyJ: number
  /** Latent energy released, J — 0 when solid, full capacity when fully liquid */
  latentStoredJ: number
  liquidFraction: number
  heatCapacityJK: number
  latentCapacityJ: number
  inPlateau: boolean
}

export function pcmState(T: number, spec: PcmSpec = DEFAULT_PCM): PcmState {
  const f = liquidFraction(T, spec)
  return {
    temperatureC: T,
    enthalpyJ: pcmEnthalpy(T, spec),
    latentStoredJ: spec.massKg * spec.latentJJkg * f,
    liquidFraction: f,
    heatCapacityJK: pcmHeatCapacity(T, spec),
    latentCapacityJ: spec.massKg * spec.latentJJkg,
    inPlateau: f > 0.01 && f < 0.99,
  }
}

/**
 * Wax mass required to cover a power shortfall for a duration.
 *     m = P·t / L
 * P = 5 W, t = 12 h, L = 180 kJ/kg → 1.2 kg, matching master report §3.
 */
export function waxMassForShortfall(powerW: number, hours: number, spec: PcmSpec = DEFAULT_PCM): number {
  return (powerW * hours * 3600) / spec.latentJJkg
}

/** Hours a bank of the given mass can carry at a given power. */
export function nightRuntimeHours(massKg: number, powerW: number, spec: PcmSpec = DEFAULT_PCM): number {
  return (massKg * spec.latentJJkg) / Math.max(powerW, 1e-6) / 3600
}

/** Marginal hold time gained per kilogram of wax, hours per watt. */
export function marginalHoldHours(extraKg: number, powerW: number, spec: PcmSpec = DEFAULT_PCM): number {
  return (extraKg * spec.latentJJkg) / Math.max(powerW, 1e-6) / 3600
}

/* ========================================================= HEAT PIPE ==== */

export interface HeatPipeSpec {
  /** Effective thermal conductance, W/K */
  conductanceWK: number
  workingFluid: 'methanol' | 'ammonia'
  efficacy: number
}

export const DEFAULT_HEAT_PIPE: HeatPipeSpec = {
  conductanceWK: 0.62,
  workingFluid: 'methanol',
  efficacy: 0.86,
}

export const HEAT_PIPE_FLUIDS: ReadonlyArray<{
  id: HeatPipeSpec['workingFluid']
  name: string
  freezePointC: number
  maxOperatingC: number
  note: string
}> = [
  {
    id: 'methanol',
    name: 'Methanol',
    freezePointC: -97,
    maxOperatingC: 120,
    note: 'Default. Wide liquid range, low surface tension, low hazard class.',
  },
  {
    id: 'ammonia',
    name: 'Ammonia',
    freezePointC: -77,
    maxOperatingC: 60,
    note: 'Higher latent heat, lower ceiling. Vapour-locks above 60 °C.',
  },
]

/** Heat delivered across the pipe, W. Strictly one-way: never negative. */
export function heatPipeFlow(
  sourceC: number,
  sinkC: number,
  spec: HeatPipeSpec = DEFAULT_HEAT_PIPE,
): number {
  if (sourceC <= sinkC + 0.2) return 0
  return Math.max(0, spec.conductanceWK * spec.efficacy * (sourceC - sinkC))
}

/* ========================================================== HEAT GATE ==== */

export interface HeatGateSpec {
  openC: number
  hysteresisK: number
  rthClosed: number
  rthOpen: number
}

export const DEFAULT_GATE: HeatGateSpec = {
  openC: K.wax_open_c,
  hysteresisK: K.wax_hyst,
  rthClosed: K.rth_closed,
  rthOpen: K.rth_open,
}

export function gateIsOpen(T: number, wasOpen: boolean, spec: HeatGateSpec = DEFAULT_GATE): boolean {
  return wasOpen ? T > spec.openC - spec.hysteresisK : T >= spec.openC
}

export function gateResistance(T: number, wasOpen: boolean, spec: HeatGateSpec = DEFAULT_GATE): number {
  return gateIsOpen(T, wasOpen, spec) ? spec.rthOpen : spec.rthClosed
}

/** Conductance of the open gate in series with the radiator, W/K. */
export function gateConductance(
  T: number,
  wasOpen: boolean,
  radiatorUA: number,
  spec: HeatGateSpec = DEFAULT_GATE,
): number {
  if (!gateIsOpen(T, wasOpen, spec)) return 0
  return 1 / (spec.rthOpen + 1 / Math.max(radiatorUA, 1e-6))
}

/** Conductance ratio of the switch — the number that makes it useful. */
export function gateConductanceRatio(spec: HeatGateSpec = DEFAULT_GATE): number {
  return spec.rthClosed / spec.rthOpen
}

/* ==================================================== BALANCE SOLVER ==== */

export interface BalanceInputs {
  /** Dissipation of the protected equipment, W */
  loadW: number
  /** Ambient air temperature, °C */
  ambientC: number
  /** Altitude density ratio, ρ/ρ₀ */
  densityRatio: number
  enclosure: Enclosure
  pcm: PcmSpec
  gate: HeatGateSpec
  heatPipe: HeatPipeSpec
  /** Open port / leak area for natural convection, m² */
  portArea: number
  /** External radiator surface area, m² */
  radiatorArea: number
  /** Fraction of the cavity surface occupied by the bank */
  pcmAreaFraction: number
  /** Battery bay mass, kg */
  batteryMassKg: number
  /** Battery areal heat capacity, J/(kg·K) */
  batteryCapexJK: number
  /** Polyimide film heater power injected into the battery bay, W */
  heaterW: number
  /** Smart Cooling fan duty, 0–1.4 */
  fanDuty: number
  /** Fan design volumetric flow at sea level, m³/s */
  designFlowM3s: number
  /** Fan design shaft power at full speed, W */
  designShaftW: number
  /** Previous wax element state, for hysteresis */
  gateWasOpen: boolean
  prev: { die: number; pcm: number; radiator: number; battery: number }
  dt: number
}

export interface ThermalState {
  die: number
  pcm: number
  radiator: number
  battery: number
  /** Wax valve state after this step */
  gateOpen: boolean
  /** Joule-averaged throughput of the heat pipe, W */
  pipeW: number
  /** Latent heat flowing into the bank, W (positive = charging) */
  chargeW: number
  /** Latent heat flowing out of the bank to the load, W */
  dischargeW: number
  /** Heat dumped through the open gate, W */
  gateW: number
  /** Aerogel conduction loss, W */
  lossW: number
  /** Open-port natural-convection loss, W */
  portLossW: number
  /** Convective rejection at the radiator, W */
  radLossW: number
  /** Battery-bay leak loss, W */
  battLossW: number
  /** Heat-pipe throughput, W (signed) */
  pipeFlowW: number
  /** Fan electrical draw, W */
  fanW: number
  /** Net power imbalance at the die, W — near zero once settled */
  residualW: number
  /** Total conducted out of the cavity, W */
  rejectW: number
  /** Lumped die capacitance, J/K */
  dieCapJK: number
  bankCapJK: number
  battCapJK: number
  radCapJK: number
}

/** Solve a small dense system by Gaussian elimination with partial pivoting. */
function solve4(A: number[][], b: number[]): number[] {
  const n = 4
  const m = A.map((row, i) => [...row, b[i]])
  for (let col = 0; col < n; col++) {
    let piv = col
    for (let r = col + 1; r < n; r++) if (Math.abs(m[r][col]) > Math.abs(m[piv][col])) piv = r
    if (Math.abs(m[piv][col]) < 1e-12) continue
    ;[m[col], m[piv]] = [m[piv], m[col]]
    for (let r = 0; r < n; r++) {
      if (r === col) continue
      const f = m[r][col] / m[col][col]
      if (f === 0) continue
      for (let c = col; c <= n; c++) m[r][c] -= f * m[col][c]
    }
  }
  return m.map((row, i) => (Math.abs(row[i]) < 1e-12 ? 0 : row[n] / row[i]))
}

export const INITIAL_THERMAL: ThermalState = {
  die: 18,
  pcm: 15.2,
  radiator: -20,
  battery: 12,
  gateOpen: false,
  pipeW: 0,
  chargeW: 0,
  dischargeW: 0,
  gateW: 0,
  lossW: 0,
  portLossW: 0,
  radLossW: 0,
  battLossW: 0,
  pipeFlowW: 0,
  fanW: 0,
  residualW: 0,
  rejectW: 0,
  dieCapJK: 1.2,
  bankCapJK: 3000,
  battCapJK: 900,
  radCapJK: 60,
}

/**
 * Advance the four-node network by one step.
 * Every temperature is treated implicitly, so the step is stable at any dt.
 */
export function stepThermal(x: BalanceInputs, s: ThermalState): ThermalState {
  const geo = enclosureGeometry(x.enclosure)
  const dt = Math.max(x.dt, 1e-4)
  const Ta = x.ambientC

  // --- Lumped capacitances --------------------------------------------------
  const dieCap = 1.2 + geo.shellCapacitance * 0.15 // equipment + pipe evaporator
  const bankCap = Math.max(pcmHeatCapacity(s.pcm, x.pcm), 40)
  const battCap = Math.max(x.batteryMassKg * x.batteryCapexJK, 10)
  const radCap = Math.max(18 * x.radiatorArea, 4)

  // --- Conductances ---------------------------------------------------------
  const kJacket = 1 / jacketResistance(x.enclosure, geo)
  const kPort = naturalConduction(s.die, Ta, x.portArea, x.densityRatio)
  const kPipe = Math.max(0.01, x.heatPipe.conductanceWK * x.heatPipe.efficacy)
  const kBank = naturalConduction(
    s.pcm,
    Ta,
    geo.area * x.pcmAreaFraction,
    x.densityRatio,
  )
  const kIB = 0.9 + 3.4 * x.densityRatio // die↔battery internal coupling
  const kLeak = 0.16 + 0.28 * x.densityRatio // battery→ambient leak path

  const gateNowOpen = gateIsOpen(s.die, s.gateOpen, x.gate)
  const kRadBody = naturalConduction(
    s.radiator,
    Ta,
    x.radiatorArea,
    x.densityRatio,
    30,
    1.1,
  )
  const kGate = gateNowOpen ? 1 / (x.gate.rthOpen + 1 / Math.max(kRadBody, 1e-6)) : 0

  // --- Assemble the symmetric 4×4 system ----------------------------------
  // Node order: 0 die, 1 bank, 2 radiator, 3 battery
  const A = [
    [dieCap / dt + kJacket + kPort + kPipe + kGate, -kPipe, -kGate, 0],
    [-kPipe, bankCap / dt + kPipe + kBank + kIB, 0, -kIB],
    [-kGate, 0, radCap / dt + kGate + kRadBody, 0],
    [0, -kIB, 0, battCap / dt + kIB + kLeak],
  ]
  const b = [
    (dieCap / dt) * s.die + x.loadW + (kJacket + kPort) * Ta,
    (bankCap / dt) * s.pcm + kBank * Ta,
    (radCap / dt) * s.radiator + kRadBody * Ta,
    (battCap / dt) * s.battery + x.heaterW + kLeak * Ta,
  ]

  const [die, pcm, radiator, battery] = solve4(A, b)

  // --- Thermodynamic bookkeeping -------------------------------------------
  const dieC = clamp(die, -70, 180)
  const pcmC = clamp(pcm, -70, 150)
  const radC = clamp(radiator, Ta - 2, 180)
  const battC = clamp(battery, -70, 120)

  const pipeFlow = kPipe * (dieC - pcmC) // signed; negative means the bank feeds back
  const gateFlow = kGate * (dieC - radC)
  const radLoss = kRadBody * (radC - Ta)
  const loss = kJacket * (dieC - Ta) + kBank * (pcmC - Ta)
  const portLoss = kPort * (dieC - Ta)
  const battLoss = kLeak * (battC - Ta)

  // Latent split: the bank is on its plateau whenever it is between 0 and 1.
  const lf = liquidFraction(pcmC, x.pcm)
  const chargeW = pipeFlow > 0 && lf < 0.999 ? pipeFlow : 0
  const dischargeW = pipeFlow < 0 ? -pipeFlow : 0

  // Fan shaft power, P ∝ ρ·N³, evaluated at the requested duty.
  const duty = clamp(x.fanDuty, 0, 1.4)
  const fanW = x.designShaftW * x.densityRatio * duty * duty * duty

  return {
    die: dieC,
    pcm: pcmC,
    radiator: radC,
    battery: battC,
    gateOpen: gateNowOpen,
    pipeW: Math.max(0, pipeFlow),
    chargeW,
    dischargeW,
    gateW: gateFlow,
    lossW: loss,
    portLossW: portLoss,
    radLossW: radLoss,
    battLossW: battLoss,
    pipeFlowW: pipeFlow,
    fanW,
    residualW: x.loadW - Math.max(0, pipeFlow) - gateFlow - portLoss - kJacket * (dieC - Ta),
    rejectW: loss + portLoss + radLoss,
    dieCapJK: dieCap,
    bankCapJK: bankCap,
    battCapJK: battCap,
    radCapJK: radCap,
  }
}
