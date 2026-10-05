/* ============================================================================
   TVA — VALIDATION PROGRAMME
   ----------------------------------------------------------------------------
   Master report §6 is unambiguous:

       "Tests E1 through E4 are fully planned protocols; results must never be
        presented as completed laboratory data."

   So this module contains protocols, apparatus, procedures and pass criteria.
   It deliberately contains NO results. Every status field is PLANNED, and the
   UI renders PLANNED with a visually distinct treatment so a presenter cannot
   accidentally imply otherwise.
   ========================================================================== */

import type { Provenance } from './constants'

export interface ProtocolStep {
  step: string
  duration: string
  detail: string
}

export interface TestProtocol {
  id: string
  code: string
  title: string
  objective: string
  /** Standards the protocol is written against */
  standards: { code: string; title: string; method: string }[]
  apparatus: string[]
  procedure: ProtocolStep[]
  /** Quantified acceptance criterion, with the reasoning */
  acceptance: { metric: string; criterion: string; rationale: string }[]
  samples: string
  status: 'PLANNED'
  /** What the outcome would let the team claim, and what it would not */
  claims: { onPass: string; stillNotClaimed: string }
  durationDays: number
}

/* ------------------------------------------------------------------ E1 -- */
const E1: TestProtocol = {
  id: 'E1',
  code: 'E1',
  title: 'Cold soak and temperature stabilisation',
  objective:
    'Establish that the aerogel jacket holds a powered enclosure above its minimum internal temperature across a full overnight soak at the lower envelope temperature, and quantify the steady-state jacket loss.',
  standards: [
    { code: 'JSS 55555', title: 'Indian Standard — environmental tests for defence electronics', method: 'Cold soak' },
    { code: 'MIL-STD-810H', title: 'Environmental Engineering Considerations and Laboratory Tests', method: 'Method 501.7 — Low Temperature' },
  ],
  apparatus: [
    'Thermal chamber, −45 °C to +70 °C, ±1 K uniformity',
    'Instrumented 10 L enclosure with 20 mm aerogel jacket',
    '8 × type-K thermocouples on the internal wall, die, bank and battery bay',
    'Programmable DC load bank, 0–80 W',
    'Sub-zero-tolerant data logger, 1 Hz',
  ],
  procedure: [
    { step: 'Condition', duration: '4 h', detail: 'Bring the instrumented unit to +25 °C at 40 % RH and stabilise.' },
    { step: 'Ramp', duration: '4 h', detail: 'Ramp at 1 K/min to −40 °C. Log throughout; do not interrupt for the soak.' },
    { step: 'Soak', duration: '12 h', detail: 'Hold at −40 °C. This is the 12-hour night the 1.2 kg bank is sized against.' },
    { step: 'Ramp back', duration: '4 h', detail: 'Return to +25 °C and allow full recovery.' },
    { step: 'Repeat ×3', duration: '72 h', detail: 'Three cycles to expose any hysteresis in the wax element.' },
  ],
  acceptance: [
    {
      metric: 'Steady-state jacket loss at ΔT = 30 K',
      criterion: '≤ 12 W',
      rationale:
        'Master report §3 predicts 6–12 W for a 0.278 m² cavity with 20 mm of k = 0.015–0.020 W/m·K aerogel. The upper bound is the pass line; anything under 6 W would indicate leakage.',
    },
    {
      metric: 'Minimum internal temperature during soak',
      criterion: '≥ +5 °C',
      rationale:
        'The charge-lock set-point. Below it the hardware comparator blocks charge and the pack begins irreversible fade.',
    },
    {
      metric: 'Minimum battery core temperature',
      criterion: '≥ +5 °C for the full 12 h',
      rationale: 'The pack must never cross the plating threshold while the Charge Lock is closed.',
    },
  ],
  samples: 'n = 3 enclosures, 3 cycles each',
  status: 'PLANNED',
  claims: {
    onPass: 'Measured jacket loss and a demonstrated minimum internal temperature at −40 °C.',
    stillNotClaimed: 'Any statement about field endurance, or about altitudes above the test envelope.',
  },
  durationDays: 5,
}

/* ------------------------------------------------------------------ E2 -- */
const E2: TestProtocol = {
  id: 'E2',
  code: 'E2',
  title: 'Low-pressure and altitude derating',
  objective:
    'Verify the density-compensated blower law and the IEC 60664-1 clearance correction by reproducing the 5 000 m pressure environment in a controlled chamber.',
  standards: [
    { code: 'MIL-STD-810H', title: 'Environmental Engineering Considerations and Laboratory Tests', method: 'Method 500.6 — Low Pressure (Altitude)' },
    { code: 'IEC 60664-1', title: 'Low-voltage equipment — Part 1: Basic rules', method: 'Table 2 altitude correction factor' },
  ],
  apparatus: [
    'Altitude chamber to 10 000 m equivalent, ±1 kPa',
    'Reference anemometer, hot-wire, traceable',
    'Isothermal chamber held at +30 °C for the convection runs',
    'Dielectric test set, 0–500 V AC, with corona detection',
    'Test articles: corrected and uncorrected clearance coupons',
  ],
  procedure: [
    { step: 'Sea-level datum', duration: '2 h', detail: 'Measure anemometer output and coupon breakdown at 101.3 kPa.' },
    { step: 'Step down', duration: '6 h', detail: 'Repeat at 75, 60 and 54.0 kPa, holding 45 min at each step.' },
    { step: 'Blower law', duration: '4 h', detail: 'Measure mass flow versus rpm at each pressure. Fit N ∝ 1/ρ_rel.' },
    { step: 'Convection', duration: '6 h', detail: 'Measure Nu on the isothermal coupon versus pressure.' },
    { step: 'Dielectric', duration: '4 h', detail: 'Breakdown and corona-onset on both coupons at every pressure step.' },
  ],
  acceptance: [
    {
      metric: 'Measured mass flow at 54.0 kPa',
      criterion: '≥ 95 % of the sea-level value at the compensated rpm',
      rationale:
        'N = N₀/ρ_rel predicts a 1.67× speed increase restores sea-level mass flow. Anything less means the fan is under-driven and the die will run hot.',
    },
    {
      metric: 'Measured fan power at 54.0 kPa',
      criterion: 'Record; expect the 1/ρ_rel² law (2.78×) to bound the result',
      rationale: 'Confirms or refutes the 2.8× penalty quoted in master report §3.',
    },
    {
      metric: 'Breakdown voltage, corrected coupon',
      criterion: '≥ 1.5 × the rail voltage',
      rationale: 'The design rule. The uncorrected coupon is expected to fail, and that failure is the evidence.',
    },
  ],
  samples: 'n = 2 blower units, 3 coupons per clearance configuration',
  status: 'PLANNED',
  claims: {
    onPass: 'A measured density-compensation law and a verified clearance correction.',
    stillNotClaimed: 'Arcing protection for rails below 300 V — outside the declared scope.',
  },
  durationDays: 4,
}

/* ------------------------------------------------------------------ E3 -- */
const E3: TestProtocol = {
  id: 'E3',
  code: 'E3',
  title: 'Diurnal thermal cycling and solder fatigue correlation',
  objective:
    'Correlate a measured internal temperature cycle with the Norris–Landzberg model and Life Guard’s rainflow output, so the remaining-life score has a calibrated basis rather than an assumed one.',
  standards: [
    { code: 'MIL-STD-810H', title: 'Environmental Engineering Considerations and Laboratory Tests', method: 'Method 503.7 — Thermal Shock / cycling' },
    { code: 'IEC 60068-2-14', title: 'Environmental testing — Change of temperature', method: 'Test Nb: change of temperature with specified rate' },
    { code: 'ASTM E1049', title: 'Standard Practices for Cycle Counting in Fatigue Analysis', method: 'Rainflow' },
  ],
  apparatus: [
    'Two-chamber thermal cycling system, 1 K/min ramp, +60 / −60 °C',
    'Instrumented assembly with 40 daisy-chained micro-strain gauges on solder joints',
    'Reference load bank cycling in phase with the chamber',
    'High-speed logger, 10 Hz on strain, 1 Hz on temperature',
  ],
  procedure: [
    { step: 'Baseline strain', duration: '2 h', detail: 'Zero the strain gauges at +25 °C with no load.' },
    { step: 'Cycle', duration: '48 h', detail: 'Run the full −60 → +60 K profile over 48 h, 20 cycles.' },
    { step: 'Cyclic creep', duration: '72 h', detail: 'Hold at the peak for 72 h to expose the dwell contribution the Coffin–Manson refinement omits.' },
    { step: 'Second cycle set', duration: '48 h', detail: 'Repeat the profile with the PCM bank pre-charged, to capture the buffered swing.' },
    { step: 'Rainflow', duration: '—', detail: 'Reduce both logs with the same algorithm Life Guard uses in the field.' },
  ],
  acceptance: [
    {
      metric: 'Measured internal swing, retrofit fitted',
      criterion: '≤ 30 K',
      rationale:
        'The buffering target. (60/30)^2.65 = 6.27× is the published acceleration factor and it is only defensible if the swing is actually clamped to half.',
    },
    {
      metric: 'Rainflow correlation coefficient',
      criterion: 'Norris–Landzberg within ±25 % of measured cycles-to-initiation',
      rationale:
        'Establishes whether the exponent TVA quotes is the right one for the assembled joint, as distinct from the idealised coupon.',
    },
    {
      metric: 'Life Guard score drift',
      criterion: '≤ 5 % of remaining life per 100 logged cycles',
      rationale: 'A field-deployed estimator that drifts by more than this is not usable for a health claim.',
    },
  ],
  samples: 'n = 4 assemblies (2 protected, 2 unprotected) until initiation',
  status: 'PLANNED',
  claims: {
    onPass:
      'A measured diurnal swing and a calibrated fatigue exponent for the assembled joint.',
    stillNotClaimed:
      'An absolute MTBF in years. That would require a full design-life test programme, not a 20-cycle correlation.',
  },
  durationDays: 21,
}

/* ------------------------------------------------------------------ E4 -- */
const E4: TestProtocol = {
  id: 'E4',
  code: 'E4',
  title: 'Sub-zero charge lock and battery warmer validation',
  objective:
    'Demonstrate that the hardware Charge Lock physically blocks charge below +5 °C, and quantify how long the Battery Warmer holds a pack above the plating threshold once the heat bank is exhausted.',
  standards: [
    { code: 'MIL-STD-810H', title: 'Environmental Engineering Considerations and Laboratory Tests', method: 'Method 500.6 — Low Pressure, combined with 501.7' },
    { code: 'JSS 55555', title: 'Indian Standard — environmental tests for defence electronics', method: 'Battery sub-zero conditioning' },
  ],
  apparatus: [
    'Sub-zero chamber, −40 °C to +25 °C, ±1 K',
    'Cell-level instrumentation: 4-wire coulometry plus a reference electrode',
    'Comparitor and MOSFET fixture with the software path physically removed',
    'Polyimide film heater, 0–20 W, with independent thermocouples',
    'Inductive charge monitor capable of resolving dendrite-onset dV/dt',
  ],
  procedure: [
    { step: 'Condition', duration: '6 h', detail: 'Bring the pack to +25 °C and charge to 3.8 V/cell.' },
    { step: 'Soak', duration: '8 h', detail: 'Ramp at 1 K/min to −40 °C and hold.' },
    { step: 'Attempt charge', duration: '2 h', detail: 'Command 1 C from the bench supply. The lock must refuse. Verify zero current at the cell.' },
    { step: 'Warm with the bank', duration: '12 h', detail: 'Exhaust the PCM bank, then allow the film heater to take over. Log the whole 12-hour night.' },
    { step: 'Cross +5 °C', duration: '2 h', detail: 'Re-attempt charge. The lock must release at the set-point and conduct normally.' },
    { step: 'Recover', duration: '8 h', detail: 'Return to +25 °C and measure irreversible capacity loss by coulometry.' },
  ],
  acceptance: [
    {
      metric: 'Charge current while locked',
      criterion: '< 50 µA at the cell',
      rationale: 'A comparator leakage of a few tens of microamps is the realistic floor. Anything above it is a hardware design error.',
    },
    {
      metric: 'Lock release temperature',
      criterion: '+5 °C ± 1.5 K',
      rationale: 'The comparator threshold and its tolerance. Releasing late causes plating; releasing early wastes power.',
    },
    {
      metric: 'Battery temperature, 12 h night with the bank exhausted',
      criterion: '≥ +5 °C throughout',
      rationale:
        'The headline claim: a 1.2 kg bank plus the last-resort film heater must carry the whole night at the design load.',
    },
    {
      metric: 'Irreversible capacity loss after the full cycle',
      criterion: '< 0.5 % of nameplate',
      rationale: 'Confirms no dendrite growth occurred while the lock was closed.',
    },
  ],
  samples: 'n = 3 packs, 2 runs each',
  status: 'PLANNED',
  claims: {
    onPass: 'A measured lock threshold, a measured night-time hold time and a measured capacity loss.',
    stillNotClaimed:
      'Cycle life to 80 % capacity. The accelerated ageing programme that supports that is a separate, much longer study.',
  },
  durationDays: 8,
}

export const PROTOCOLS: ReadonlyArray<TestProtocol> = [E1, E2, E3, E4]

/* ------------------------------------------------------- COMPLIANCE MAP -- */

export interface ComplianceRow {
  requirement: string
  source: string
  protocols: string[]
  status: 'PLANNED' | 'NOT ADDRESSED'
  note: string
}

export const COMPLIANCE_MATRIX: ReadonlyArray<ComplianceRow> = [
  {
    requirement: 'Operate to −40 °C',
    source: 'SIH26049 envelope',
    protocols: ['E1', 'E4'],
    status: 'PLANNED',
    note: 'Directly the lower bound of E1 and E4.',
  },
  {
    requirement: 'Operate to 5 000 m equivalent',
    source: 'SIH26049 envelope',
    protocols: ['E2'],
    status: 'PLANNED',
    note: 'E2 steps to 54.0 kPa, the standard-atmosphere value for 5 000 m.',
  },
  {
    requirement: 'Clearance correction for altitude',
    source: 'IEC 60664-1 Table 2',
    protocols: ['E2'],
    status: 'PLANNED',
    note: 'K = 1.48 at 5 000 m. Verified on coupons, not on the production layout.',
  },
  {
    requirement: 'Solder joint life extension',
    source: 'Norris–Landzberg; ASTM E1049',
    protocols: ['E3'],
    status: 'PLANNED',
    note: 'Correlation against a coupon model. Not an absolute MTBF.',
  },
  {
    requirement: 'No lithium plating below +5 °C',
    source: 'LOKI hardware invariant',
    protocols: ['E4'],
    status: 'PLANNED',
    note: 'Verified at the cell, with the software path removed.',
  },
  {
    requirement: 'Passive operation under total power loss',
    source: 'Master report §1, Layer 1',
    protocols: [],
    status: 'NOT ADDRESSED',
    note:
      'The Roots layer is passive by construction and needs no power, but a formal total-power-loss demonstration has not been written into the programme. This is a gap the panel may probe.',
  },
  {
    requirement: 'Field validation at Chang La',
    source: 'Master report §5',
    protocols: [],
    status: 'NOT ADDRESSED',
    note:
      'A one-winter pilot on a single radio and battery set, beside an unmodified unit. Requires DRDO/DIHAR scheduling; not yet scheduled.',
  },
]

/* ------------------------------------------------------- DESIGN TARGETS -- */

export interface DesignTarget {
  id: string
  label: string
  target: string
  basis: string
  status: 'DESIGN TARGET'
}

export const DESIGN_TARGETS: ReadonlyArray<DesignTarget> = [
  {
    id: 'controller',
    label: 'Controller and trunk draw',
    target: '< 0.5 W',
    basis: 'Sized from the STM32 sleep-mode budget plus sensor conditioning. Not yet measured.',
    status: 'DESIGN TARGET',
  },
  {
    id: 'solder',
    label: 'Solder fatigue acceleration factor',
    target: '6.27× (conservative published figure)',
    basis: '(60 K / 30 K)^2.65. The full Arrhenius form gives 8.9×; TVA publishes the conservative term.',
    status: 'DESIGN TARGET',
  },
  {
    id: 'endurance',
    label: 'Drone endurance recovery',
    target: '20–25 min → 35 min',
    basis:
      'Recovery of the battery-capacity term only. The aerodynamic lift term is not addressed and must not be claimed.',
    status: 'DESIGN TARGET',
  },
  {
    id: 'jacket',
    label: 'Jacket steady-state loss',
    target: '6–12 W at ΔT = 30 K',
    basis: 'Sizing calculation, to be confirmed by E1.',
    status: 'DESIGN TARGET',
  },
  {
    id: 'pcm',
    label: 'Heat bank mass',
    target: '1.2 kg paraffin, 216 kJ',
    basis: '5 W × 43 200 s ÷ 180 kJ/kg. Sized to cover a 12-hour night.',
    status: 'DESIGN TARGET',
  },
]

export const ALL_PROVENANCE: Provenance[] = ['LITERATURE', 'DERIVED', 'DESIGN', 'PLANNED']
