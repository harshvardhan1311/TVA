# TVA — Thermal Viable Architecture Digital Twin

## Overview

TVA is a high-altitude thermal digital twin for unmanned ground vehicles operating in extreme cold (Chang La, Ladakh). It simulates thermal performance, power budgets, atmospheric derating, and failure modes with strict provenance tracking.

Built as a single-page React + TypeScript application with a pure physics engine, it drives 15 interactive modules while enforcing scope boundaries — every derived value is traceable to literature, design assumptions, or planned validation. All computation is deterministic and runs entirely in the browser with no backend or external dependencies.

---

## Quick start

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # tsc -b && vite build  →  dist/
npm run preview  # serve the production bundle
npm run lint     # oxlint over src/ and scripts/
```

### Deploying

The build is fully static with `base: './'` and hash routing, so it runs from any of:

| Target | Notes |
| --- | --- |
| `dist/index.html` opened directly | Works. No server, no rewrites. |
| Any static host sub-directory | Relative asset paths, so `/projects/tva/` is fine. |
| S3 / GitHub Pages / Netlify | Upload `dist/` as-is. |

There is no backend, no database and no network call at runtime. Theme preference is
the only persisted state, under the `localStorage` key `tva.theme`.

---

## The fifteen modules

| Group | Route | Module | What it shows |
| --- | --- | --- | --- |
| Overview | `#/overview` | Mission Overview | System verdict, top findings, budget snapshot |
| Overview | `#/twin` | Live Digital Twin | 3D enclosure, node temperatures, live telemetry |
| Physics | `#/atmosphere` | Atmosphere & Derating | Density, viscosity, Reynolds, cubic fan tax |
| Physics | `#/architecture` | Vriksh Architecture | Three-layer tree: roots / trunk / branches |
| Physics | `#/cycle` | Diurnal Cycle | 24-hour drive against ambient |
| Response | `#/ladder` | Decision Ladders | Cold and hot rungs with gating inequalities |
| Response | `#/lifeguard` | Life Guard | Solder fatigue, ΔT^-2.65, Arrhenius sensitivity |
| Response | `#/sparkguard` | Spark Guard | Paschen margin, 300 V scope boundary |
| Response | `#/endurance` | UAV Endurance | Battery share only, never aerodynamic |
| Response | `#/energy` | Trunk Energy Budget | 7-way priority allocation |
| Assurance | `#/stress` | Failure Mode Lab | 8 modes scored with retrofits on and off |
| Assurance | `#/scenarios` | Scenario Library | 15 runnable operating scenarios |
| Assurance | `#/validation` | Validation E1–E4 | Protocol, apparatus, acceptance criteria |
| Assurance | `#/ledger` | Claims & Provenance | Constant registry and carried discrepancies |
| Assurance | `#/deck` | SIH Deck & Script | 11 slides with speaker notes |

### Operator controls

The drawer in the header (or `O`) drives the shared store: ambient, altitude, clock,
solar, rail voltage, clearance, payload, warming state, and the four Smart-Cooling
tiers. `Space` pauses the clock, `B` collapses the sidebar, and **Export CSV** writes
the telemetry ring buffer. Selecting a scenario in `#/scenarios` overwrites the same
config, so every module re-derives from it simultaneously.

---

## Architecture

```
src/
  sim/          types.ts · engine.ts · store.ts
  lib/          physics and reference libraries (pure, no React)
  components/   UI kit, charts, EnclosureField, nav, palette
  modules/      one file per route, each ~150–400 lines
  hooks/        useHashRoute, useSim, useTheme, useMediaQuery, useCopy
  styles/       app.css · theme.css · components.css
```

**One state, one evaluator.** `sim/engine.ts` is a pure function of
`(SimState) → SimState`. Every derived quantity — thermal nodes, derating factors,
ladder decisions, failure scores, energy allocation — is computed there and read
through selectors. No module runs its own physics, so nothing can drift out of sync.

`EnclosureField` is the one exception worth naming: it draws the four-node thermal
solution analytically from the same state rather than owning a second solver.

History is a bounded ring buffer of 2,880 samples at two-minute simulated sampling —
24 hours of simulated telemetry, which is why the CSV export is capped rather than
growing without limit.

---

## Model scope — what TVA will not claim

These boundaries are enforced in code, not just documented. Each has a dedicated
`SCOPE_BOUNDARIES` entry that the UI surfaces.

- **No aerodynamic recovery.** Endurance claims cover the battery-capacity share of
  an altitude shortfall only. At 5,000 m the aircraft loses roughly 40 % of its
  aerodynamic capability and TVA does not model a remedy for it.
- **Spark Guard is scoped at 300 V and above.** Below that, a sealed enclosure cannot
  hold enough clearance for breakdown to be credible, so the module declares itself
  out of scope rather than manufacturing a reassuring margin.
- **Controller draw below 0.5 W is a design target**, sized from the STM32 sleep-mode
  budget. It has not been measured on hardware.
- **Heat-pipe working fluid is methanol/ammonia, never water.** The thermal valve is a
  40 °C wax element with ±2 K hysteresis.
- **Solder-life multipliers are deliberately conservative** where the measured
  coefficient is unavailable.
- **Design ≠ measurement.** Every such value carries a `DESIGN` provenance chip; every
  unexecuted protocol carries `PLANNED`.

### Recorded discrepancies

The preliminary CFD workbench disagrees with the master report on five parameters.
TVA adopts the corrected values and keeps both visible in `#/ledger` so the choice is
auditable rather than inherited:

| Parameter | Preliminary | Adopted by TVA |
| --- | --- | --- |
| Air density at 5,000 m | 0.653 kg/m³ (53.3 %) | 0.736 kg/m³ (60.1 %) — ISO 2533 |
| Fan speed to restore mass flow | 1.77× | 1.67× (∝ 1/ρ_rel) |
| Fan power penalty | 2.78× from the 0.9 exponent | 2.78× derived as 1/ρ_rel² |
| Solder fatigue acceleration | 6.27× only | 6.27× published, 8.9× full-form upper bound |
| Norris–Landzberg Arrhenius sign | sign error | corrected, Eₐ = 11.75 kJ/mol |

The first three are transcription and algebra errors in the preliminary workbench; the
last two are scope decisions. TVA publishes the conservative 6.27× figure and exposes
the 8.9× bound rather than quietly choosing the flattering number.

---

## Validation status

| ID | Protocol | Days | Status |
| --- | --- | --- | --- |
| E1 | Cold soak and temperature stabilisation | 5 | PLANNED |
| E2 | Low-pressure and altitude derating | 4 | PLANNED |
| E3 | Diurnal thermal cycling and solder fatigue correlation | 21 | PLANNED |
| E4 | Sub-zero charge lock and battery warmer validation | 8 | PLANNED |

38 days of laboratory time remain. That is the programme's real schedule risk, and it
is not a software problem. `#/validation` shows the apparatus, procedure and
quantified acceptance criterion for each, plus what a pass would and would not license
the team to claim.

---

## Provenance tags

| Tag | Meaning |
| --- | --- |
| `LITERATURE` | Published value with a named source |
| `DERIVED` | Computed from other constants in the registry |
| `DESIGN` | Engineering choice, defensible but unmeasured |
| `PLANNED` | Written protocol awaiting execution |
| `MEASURED` | Laboratory result — currently **zero** entries |

---

## Implementation notes

- **Strict TypeScript** with `erasableSyntaxOnly` and `noUnusedLocals`. `npm run build`
  typechecks before bundling, so a clean build means a clean typecheck.
- **Lint runner.** `npm run lint` runs `scripts/lint.mjs`, which enumerates source files
  and passes them to oxlint explicitly. A bare `oxlint` invocation reports "no files
  found" in this environment and exits as a false green, which is worse than no lint.
- **Theme** is applied by an inline script before first paint, so there is no flash of
  the wrong palette.
- **Charts** are Recharts for time series and hand-rolled SVG for the schematic and
  gauge components. `StackedArea` uses a matching `stackId`; Recharts has no
  `stackOffset` prop.
