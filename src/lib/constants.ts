/* ============================================================================
   TVA — ENGINEERING CONSTANTS & CLAIM PROVENANCE
   ----------------------------------------------------------------------------
   Every numeric constant used by the simulation is declared here together with
   a provenance tag, so the UI can render an honest badge next to each figure.

   Provenance taxonomy (mirrors §6 "Validation Roadmap & Accuracy Guardrails"
   of the LOKI master report):

     LITERATURE  Value taken from a published standard or peer-reviewed source.
     DERIVED     Computed by TVA from first principles / published correlations.
     DESIGN      Engineering design target chosen by the team. NOT measured.
     PLANNED     Protocol that has not been executed. MUST NOT be shown as data.
     MEASURED    Reserved for post-test data. Currently unused by design.
   ========================================================================== */

export type Provenance = 'LITERATURE' | 'DERIVED' | 'DESIGN' | 'PLANNED' | 'MEASURED'

export interface Constant {
  id: string
  label: string
  value: number
  unit: string
  provenance: Provenance
  source: string
  note?: string
}

export const CONSTANTS = {
  /* ---- Reference site (SIH problem statement envelope) ---- */
  g0: 9.80665,
  R_air: 287.0528,
  T0: 288.15,
  P0: 101.325,
  rho0: 1.225,
  cp_air: 1005,
  M_air: 0.0289644,

  /* ---- Aerogel blanket ---- */
  aerogel_k_min: 0.015,
  aerogel_k_max: 0.02,
  aerogel_k: 0.0175,
  aerogel_t: 0.02,

  /* ---- Paraffin PCM ---- */
  pcm_latent: 180e3,
  pcm_tm: 15,
  pcm_tm_band: 1.6,
  pcm_cp_solid: 2000,
  pcm_cp_liquid: 2300,

  /* ---- Wax heat gate (NASA JPL passive switch) ---- */
  wax_open_c: 40,
  wax_hyst: 2.0,
  rth_closed: 100,
  rth_open: 0.8,

  /* ---- Charge lock ---- */
  charge_lock_c: 5,

  /* ---- Norris-Landzberg, SAC305 ---- */
  nl_exponent: 2.65,
  nl_freq_exponent: 0.136,
  nl_Ea: 11.75e3,
  kB: 8.314462e-3,

  /* ---- Lithium charge kinetics ---- */
  charge_Ea: 22e3,

  /* ---- Controller ---- */
  p_controller: 0.5,

  /* ---- Reference field site ---- */
  site_alt: 5364,
  site_lat: 34.5,

  /* ---- Unprotected diurnal swing ---- */
  dT_unprotected: 60,
} as const satisfies Record<string, number>

export const CONSTANT_REGISTRY: Constant[] = [
  {
    id: 'P0',
    label: 'Sea-level reference pressure',
    value: 101.325,
    unit: 'kPa',
    provenance: 'LITERATURE',
    source: 'ISO 2533:1975 — Standard Atmosphere',
  },
  {
    id: 'rho0',
    label: 'Sea-level reference air density',
    value: 1.225,
    unit: 'kg/m³',
    provenance: 'LITERATURE',
    source: 'ISO 2533:1975 — Standard Atmosphere',
  },
  {
    id: 'aerogel_k',
    label: 'Aerogel blanket conductivity (nominal)',
    value: 0.0175,
    unit: 'W/m·K',
    provenance: 'LITERATURE',
    source: 'Published aerogel blanket datasheet range 0.015–0.020',
  },
  {
    id: 'pcm_latent',
    label: 'Paraffin PCM latent heat',
    value: 180,
    unit: 'kJ/kg',
    provenance: 'LITERATURE',
    source: 'Industrial paraffin wax datasheet (n-alkane blend)',
    note: 'Melting band centred on +15 °C.',
  },
  {
    id: 'wax_open_c',
    label: 'Wax heat-gate open threshold',
    value: 40,
    unit: '°C',
    provenance: 'LITERATURE',
    source: 'NASA JPL passive wax-actuated thermal switch; 35–45 °C element band',
  },
  {
    id: 'charge_lock_c',
    label: 'Charge-lock inhibit temperature',
    value: 5,
    unit: '°C',
    provenance: 'LITERATURE',
    source: 'Li-ion plating onset; LOKI hardware comparator set-point',
  },
  {
    id: 'nl_exponent',
    label: 'Norris–Landzberg exponent (SAC305)',
    value: 2.65,
    unit: '—',
    provenance: 'LITERATURE',
    source: 'Norris & Landzberg (1969); Coffin–Manson refinement for SAC305',
  },
  {
    id: 'nl_Ea',
    label: 'Norris–Landzberg activation energy',
    value: 11.75,
    unit: 'kJ/mol',
    provenance: 'LITERATURE',
    source: 'SAC305 solder activation energy (0.122 eV/atom)',
  },
  {
    id: 'p_controller',
    label: 'Controller standby draw',
    value: 0.5,
    unit: 'W',
    provenance: 'DESIGN',
    source: 'LOKI design target — NOT yet measured',
    note: 'Flagged in master report §6 as a design target only.',
  },
  {
    id: 'dT_unprotected',
    label: 'Unprotected diurnal internal swing',
    value: 60,
    unit: 'K',
    provenance: 'LITERATURE',
    source: 'Represents an unprotected enclosure tracking a −40 °C/+20 °C alpine day',
  },
  {
    id: 'site_alt',
    label: 'Field validation site — Chang La',
    value: 5364,
    unit: 'm',
    provenance: 'LITERATURE',
    source: 'Chang La pass, Ladakh — 17,600 ft',
    note: 'Coordinates are nominal; confirm against the final deployment survey.',
  },
]

export const PROVENANCE_META: Record<Provenance, { label: string; tone: string; blurb: string }> =
  {
    LITERATURE: {
      label: 'Literature',
      tone: 'info',
      blurb:
        'Published standard or peer-reviewed value. Reproduced here without modification.',
    },
    DERIVED: {
      label: 'Derived',
      tone: 'accent',
      blurb: 'Computed live by TVA from first principles or published correlations.',
    },
    DESIGN: {
      label: 'Design target',
      tone: 'warn',
      blurb:
        'A target chosen by the engineering team. It has NOT been measured and must not be presented as a result.',
    },
    PLANNED: {
      label: 'Planned',
      tone: 'violet',
      blurb:
        'A test protocol that has not been executed. Master report §6 forbids presenting these as laboratory data.',
    },
    MEASURED: {
      label: 'Measured',
      tone: 'ok',
      blurb: 'Recorded from an executed test. TVA ships with none, by design.',
    },
  }

/* -------------------------------------------------------------------------
   PROJECT SCOPE BOUNDARIES — hard guardrails from master report §6.
   These are surfaced in the UI so a presenter cannot accidentally overclaim.
   ------------------------------------------------------------------------- */
export const SCOPE_BOUNDARIES = [
  {
    id: 'spark',
    text: 'Spark Guard applies only to equipment operating above ~300 V. It is not fitted to low-voltage assets.',
  },
  {
    id: 'endurance',
    text: 'Drone recovery claims cover the battery-capacity share of endurance loss only — never the aerodynamic lift penalty, which LOKI does not address.',
  },
  {
    id: 'working',
    text: 'Heat pipes use non-freezing methanol or ammonia. Water is never used as working fluid.',
  },
  {
    id: 'wax',
    text: 'Thermal valves use 35–45 °C wax elements. Automotive engine thermostats are never substituted.',
  },
  {
    id: 'data',
    text: 'Tests E1–E4 are fully planned protocols. No results in TVA are laboratory measurements.',
  },
] as const

/* -------------------------------------------------------------------------
   KNOWN SOURCE DISCREPANCIES
   The preliminary CFD workbench and the master report disagree on a few
   figures. TVA resolves each one and records the decision.
   ------------------------------------------------------------------------- */
export const DISCREPANCIES = [
  {
    id: 'density',
    parameter: 'Air density at 5,000 m',
    preliminary: '0.653 kg/m³ (53.3 % of sea level) — CFD/README.md',
    adopted: '0.736 kg/m³ (60.1 % of sea level)',
    basis:
      'ISO 2533 barometric formula: P = 54.02 kPa, T = 255.65 K, ρ = PM/RT. The master report’s own "≈60 %" figure is the correct one; the preliminary 53.3 % is a transcription error.',
  },
  {
    id: 'fanspd',
    parameter: 'Fan speed to restore sea-level mass flow',
    preliminary: '1.77× — CFD/README.md',
    adopted: '1.67×  (N ∝ 1/ρ)',
    basis:
      'Mass flow ∝ ρN, so restoring sea-level ṁ requires N = N₀/ρ_rel. The 1.77× figure came from applying an empirical 0.9 exponent to the erroneous 53.3 % density.',
  },
  {
    id: 'fanpwr',
    parameter: 'Fan power penalty in thin air',
    preliminary: '~2.8× — master report §3',
    adopted: '2.78×  (1/ρ_rel²)',
    basis:
      'With P ∝ ρN³ and N ∝ 1/ρ, the penalty reduces to 1/ρ_rel² = 2.78× at 5,000 m. The master report figure is confirmed.',
  },
  {
    id: 'solder',
    parameter: 'Solder fatigue acceleration factor',
    preliminary: '6.27× — master report §5 / CFD README',
    adopted: '6.27× reported · 8.9× full-form upper bound',
    basis:
      '6.27× = (60/30)^2.65 is the ΔT-only term. The complete Norris–Landzberg form also carries an Arrhenius factor in T_max, which with Eₐ = 11.75 kJ/mol adds ≈1.43×. TVA publishes the conservative 6.27× and exposes the upper bound.',
  },
  {
    id: 'nl_sign',
    parameter: 'Norris–Landzberg Arrhenius sign',
    preliminary: 'exp[(Eₐ/kB)(1/T_max,unprot − 1/T_max,LOKI)] — CFD README',
    adopted: 'exp[(Eₐ/kB)(1/T_max,LOKI − 1/T_max,unprot)]',
    basis:
      'Life decreases as T_max rises, so the accumulated fatigue factor must exceed 1 for the cooler assembly. The preliminary form yields a factor below 1, which is physically backwards. Sign corrected in TVA.',
  },
] as const
