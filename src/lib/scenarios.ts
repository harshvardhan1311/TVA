/* ============================================================================
   TVA — SCENARIO LIBRARY
   ----------------------------------------------------------------------------
   Each entry is a complete, named operating condition. Two jobs:
     · reproduce a case from the problem statement on demand;
     · let an evaluator stress the design without hunting for sliders.
   Every scenario states what it is meant to demonstrate, including the cases
   where the design is expected to FAIL.
   ========================================================================== */

import { ASSET_PROFILES } from '../sim/types'
import type { SimConfig } from '../sim/types'
import { DEFAULT_CONFIG } from '../sim/defaults'

export type ScenarioCategory = 'REFERENCE' | 'STRESS' | 'ADVERSE' | 'BENIGN'

export interface Scenario {
  id: string
  name: string
  category: ScenarioCategory
  /** One line: what this case is for. */
  intent: string
  /** What the operator should watch. */
  expectation: string
  /** True if the design is expected to survive this case. */
  survivable: boolean
  tags: string[]
  apply: (base: SimConfig) => SimConfig
}

const asset = (base: SimConfig, id: string): SimConfig => {
  const a = ASSET_PROFILES.find((p) => p.id === id)
  if (!a) return base
  return {
    ...base,
    assetId: a.id,
    loadW: a.loadW,
    railVoltageV: a.railVoltageV,
    battery: { ...base.battery, massKg: a.batteryMassKg || base.battery.massKg },
    hv: {
      ...base.hv,
      railVoltageV: a.railVoltageV,
      sealedPressureKpa: a.railVoltageV > 0 ? base.hv.sealedPressureKpa : 0,
    },
    sparkGuardFitted: a.hvCapable ? base.sparkGuardFitted : false,
  }
}

export const SCENARIOS: ReadonlyArray<Scenario> = [
  /* ---------------------------------------------------------- REFERENCE -- */
  {
    id: 'changla-night',
    name: 'Chang La · midwinter night',
    category: 'REFERENCE',
    intent: 'The headline condition from the problem statement: −35 °C at 5 364 m, radio at 45 W, all three LOKI layers fitted.',
    expectation:
      'PCM bank carries the night. Battery holds above +5 °C, Charge Lock stays closed, no failure mode leaves the CONTROLLED band.',
    survivable: true,
    tags: ['SIH26049', 'primary case', 'PCM'],
    apply: (b) => ({
      ...asset(b, 'radio'),
      altitudeM: 5364,
      ambientC: -35,
      humidity: 0.35,
      windMs: 4.2,
      precipMmH: 0,
      clockHours: 6.2,
      dayOfYear: 355,
      loadW: 45,
      soc: 0.78,
    }),
  },
  {
    id: 'sea-level',
    name: 'Sea-level datum',
    category: 'REFERENCE',
    intent: 'The control case. Every LOKI benefit must vanish at sea level, or the model is wrong.',
    expectation:
      'Full convection, no altitude correction, and LOKI adds mass without buying anything. This is the honest baseline for the physics.',
    survivable: true,
    tags: ['control', 'validation'],
    apply: (b) => ({
      ...asset(b, 'radio'),
      altitudeM: 0,
      ambientC: 18,
      humidity: 0.5,
      windMs: 1.5,
      precipMmH: 0,
      clockHours: 13,
      dayOfYear: 100,
      loadW: 45,
      soc: 0.9,
    }),
  },
  {
    id: 'lowland-heatwave',
    name: 'Lowland summer heatwave',
    category: 'BENIGN',
    intent: 'The gate is exercised from the other direction: 45 °C ambient with a hot compute load.',
    expectation:
      'Wax gate opens on its own, radiator takes the excess, bank is irrelevant. Confirms the passive path works without the controller.',
    survivable: true,
    tags: ['heat gate', 'passive'],
    apply: (b) => ({
      ...asset(b, 'compute'),
      altitudeM: 300,
      ambientC: 45,
      humidity: 0.25,
      windMs: 0.8,
      precipMmH: 0,
      clockHours: 15,
      dayOfYear: 200,
      loadW: 65,
    }),
  },

  /* ------------------------------------------------------------ STRESS -- */
  {
    id: 'subzero-deep',
    name: 'Deep freeze · −40 °C soak',
    category: 'STRESS',
    intent: 'Protocol E1 conditions. Full 12-hour night with the bank already partly spent.',
    expectation:
      'Bank margin narrows to a few hours. The film heater is required to finish the night. The charge lock never opens.',
    survivable: true,
    tags: ['E1', 'E4', 'night'],
    apply: (b) => ({
      ...asset(b, 'radio'),
      altitudeM: 5364,
      ambientC: -40,
      humidity: 0.28,
      windMs: 6.0,
      clockHours: 2.0,
      dayOfYear: 355,
      loadW: 45,
      soc: 0.62,
    }),
  },
  {
    id: 'compute-surge',
    name: 'Compute surge · 120 W in 10 L',
    category: 'STRESS',
    intent: 'Thermal capacity pushed far past the reference case, with the wax gate as the only relief.',
    expectation:
      'Gate opens, radiator runs at its √ρ limit, and the die sits well above the sea-level equivalent. This is where thin air bites hardest.',
    survivable: true,
    tags: ['overheat', 'hot ladder'],
    apply: (b) => ({
      ...asset(b, 'compute'),
      altitudeM: 5364,
      ambientC: -20,
      humidity: 0.4,
      windMs: 3,
      clockHours: 12,
      dayOfYear: 130,
      loadW: 120,
      soc: 0.7,
    }),
  },
  {
    id: 'hv-unprotected',
    name: 'HV transmitter · unprotected gap',
    category: 'ADVERSE',
    intent: 'A 3.4 kV rail on a sea-level-approved 6 mm clearance at 5 364 m, Spark Guard removed.',
    expectation:
      'EXPECTED FAILURE. Paschen breakdown collapses, the margin goes negative and the rail must be cut. This is the case that proves the module is necessary.',
    survivable: false,
    tags: ['arcing', 'expected failure', 'spark guard'],
    apply: (b) => ({
      ...asset(b, 'hv'),
      altitudeM: 5364,
      ambientC: -28,
      clockHours: 11,
      dayOfYear: 300,
      hv: {
        ...b.hv,
        railVoltageV: 3400,
        clearanceMm: 6,
        clearanceCorrected: false,
        sealedPressureKpa: 0,
        conductorRadiusMm: 8,
        standoffMm: 30,
      },
      sparkGuardFitted: false,
    }),
  },
  {
    id: 'hv-protected',
    name: 'HV transmitter · corrected clearance',
    category: 'REFERENCE',
    intent: 'The same rail with the IEC 60664-1 correction fitted and the UV photodiode watching.',
    expectation: 'Margin recovers above 1.5×. Corona index falls to zero. Safe to deploy.',
    survivable: true,
    tags: ['arcing', 'spark guard', 'IEC 60664-1'],
    apply: (b) => ({
      ...asset(b, 'hv'),
      altitudeM: 5364,
      ambientC: -28,
      clockHours: 11,
      dayOfYear: 300,
      hv: {
        ...b.hv,
        railVoltageV: 3400,
        clearanceMm: 9,
        clearanceCorrected: false,
        sealedPressureKpa: 0,
        conductorRadiusMm: 8,
        standoffMm: 30,
      },
      sparkGuardFitted: true,
    }),
  },
  {
    id: 'hv-pressurised',
    name: 'HV transmitter · pressurised compartment',
    category: 'REFERENCE',
    intent: 'The nitrogen-bladder option: seal the compartment and restore a sea-level dielectric environment.',
    expectation:
      'Local equivalent altitude drops below 1 000 m, so the required clearance collapses and the margin doubles. A design proposal, not a demonstrated result.',
    survivable: true,
    tags: ['arcing', 'design proposal', 'pressure assist'],
    apply: (b) => ({
      ...asset(b, 'hv'),
      altitudeM: 5364,
      ambientC: -28,
      clockHours: 11,
      dayOfYear: 300,
      hv: {
        ...b.hv,
        railVoltageV: 3400,
        clearanceMm: 6,
        clearanceCorrected: false,
        sealedPressureKpa: 96,
        conductorRadiusMm: 8,
        standoffMm: 30,
      },
      sparkGuardFitted: true,
    }),
  },
  {
    id: 'uav-cold-soak',
    name: 'UAV pack · cold soak before launch',
    category: 'ADVERSE',
    intent: 'A 1 kg airborne pack left outside overnight at −38 °C, the classic pre-launch failure.',
    expectation:
      'Without the retrofit, deliverable capacity collapses to about 57 % and the pack will not charge at all. With it, the pack launches warm.',
    survivable: true,
    tags: ['battery', 'endurance', 'UAV'],
    apply: (b) => ({
      ...asset(b, 'uav'),
      altitudeM: 4600,
      ambientC: -38,
      humidity: 0.4,
      clockHours: 5.5,
      dayOfYear: 355,
      loadW: 28,
      soc: 0.85,
      pcm: { ...b.pcm, massKg: 0.45, tmC: 12 },
    }),
  },
  {
    id: 'ice-storm',
    name: 'Rime ice on the antenna',
    category: 'ADVERSE',
    intent: 'Freezing drizzle at −12 °C loading the feed horn. Failure mode 6.',
    expectation:
      'Advection cooling of the antenna drives mass loss, the link degrades and the trunk holds the relay buffer. Ice is the one hazard LOKI does not fully solve.',
    survivable: true,
    tags: ['comms', 'ice', 'adverse'],
    apply: (b) => ({
      ...asset(b, 'radio'),
      altitudeM: 4200,
      ambientC: -12,
      humidity: 0.94,
      windMs: 9.5,
      precipMmH: 2.4,
      clockHours: 2.0,
      dayOfYear: 300,
      loadW: 45,
    }),
  },
  {
    id: 'dust-loaded',
    name: 'Dust-loaded radiator',
    category: 'ADVERSE',
    intent: 'A dusty post, six months without cleaning. The radiator clogs and the bank becomes the only path.',
    expectation:
      'Passive radiator conductance falls with soiling, the bank fills faster and the night budget shortens. A maintenance problem, not a design one.',
    survivable: true,
    tags: ['maintenance', 'radiator'],
    apply: (b) => ({
      ...asset(b, 'compute'),
      altitudeM: 3500,
      ambientC: 5,
      humidity: 0.2,
      windMs: 5,
      precipMmH: 0,
      dustMgM3: 240,
      clockHours: 17,
      dayOfYear: 220,
      loadW: 65,
    }),
  },
  {
    id: 'solar-blackout',
    name: 'Winter storm · array offline',
    category: 'ADVERSE',
    intent: 'Overcast for 40 hours. The entire energy budget has to run off the pack.',
    expectation:
      'The bank covers the thermal side but the array contributes nothing, so autonomy falls to the pack alone. The weakest realistic night.',
    survivable: true,
    tags: ['energy', 'autonomy', 'worst night'],
    apply: (b) => ({
      ...asset(b, 'radio'),
      altitudeM: 5364,
      ambientC: -34,
      humidity: 0.8,
      windMs: 12,
      precipMmH: 1.2,
      clockHours: 20,
      dayOfYear: 355,
      loadW: 45,
      soc: 0.55,
      solarEnabled: false,
    }),
  },
  {
    id: 'no-retrofit',
    name: 'Unprotected baseline · −35 °C',
    category: 'ADVERSE',
    intent: 'The exact same asset with the retrofit removed. This is the counterfactual every claim is measured against.',
    expectation:
      'EXPECTED FAILURE. Die overheats in freezing air, the pack freezes, the display dies and the solder swings the full 60 K. Six of eight failure modes go severe.',
    survivable: false,
    tags: ['baseline', 'expected failure', 'counterfactual'],
    apply: (b) => ({
      ...asset(b, 'radio'),
      altitudeM: 5364,
      ambientC: -35,
      humidity: 0.35,
      windMs: 4.2,
      clockHours: 6.2,
      dayOfYear: 355,
      loadW: 45,
      soc: 0.78,
      lokiFitted: false,
      sparkGuardFitted: false,
    }),
  },
  {
    id: 'hot-desert',
    name: 'Trans-Himalayan desert · 5 000 m',
    category: 'STRESS',
    intent: 'Dry heat at altitude: low density AND a hot ambient, the worst case for the wax gate.',
    expectation:
      'Natural convection is 22 % weak and the ambient is 38 °C, so the radiator has to work much harder. The bank fills before it can help.',
    survivable: true,
    tags: ['overheat', 'radiator', 'desert'],
    apply: (b) => ({
      ...asset(b, 'compute'),
      altitudeM: 5000,
      ambientC: 38,
      humidity: 0.08,
      windMs: 6,
      precipMmH: 0,
      clockHours: 14,
      dayOfYear: 210,
      loadW: 90,
      soc: 0.8,
      solarTilt: 20,
    }),
  },
  {
    id: 'recovery-dawn',
    name: 'Dawn recovery · bank recharging',
    category: 'REFERENCE',
    intent: 'First hour of sun after a full night. Shows the store-then-recharge half of the cycle.',
    expectation:
      'Array output comes up, the film heater sheds immediately, and the bank starts re-melting. The energy ladder should visibly unwind in order.',
    survivable: true,
    tags: ['energy', 'solar', 'cycle'],
    apply: (b) => ({
      ...asset(b, 'radio'),
      altitudeM: 5364,
      ambientC: -32,
      humidity: 0.4,
      windMs: 3,
      clockHours: 8.1,
      dayOfYear: 355,
      loadW: 45,
      soc: 0.46,
      solarEnabled: true,
    }),
  },
]

export function getScenario(id: string): Scenario | undefined {
  return SCENARIOS.find((s) => s.id === id)
}

export function applyScenario(id: string, base: SimConfig = DEFAULT_CONFIG): SimConfig {
  const s = getScenario(id)
  return s ? s.apply(base) : base
}

export const CATEGORY_META: Record<ScenarioCategory, { label: string; tone: string }> = {
  REFERENCE: { label: 'Reference', tone: 'accent' },
  STRESS: { label: 'Stress', tone: 'warn' },
  ADVERSE: { label: 'Adverse', tone: 'crit' },
  BENIGN: { label: 'Benign', tone: 'info' },
}
