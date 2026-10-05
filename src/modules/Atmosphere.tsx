/* ============================================================================
   TVA — ATMOSPHERE & DERATING
   ----------------------------------------------------------------------------
   Four laws do all the thin-air damage, and every derating factor in the whole
   model descends from them. This page shows the arithmetic, not just the
   result, because "the fan needed 2.8x the power" is only useful if the panel
   can see where the 2.8 came from.
   ========================================================================== */

import type { ComponentType } from 'react'
import {
  ArrowUpRight,
  Gauge,
  Thermometer,
  Waves,
  Wind,
  Zap,
} from 'lucide-react'
import {
  atmosphere,
  airViscosity,
  standardPressure,
  standardTemperatureK,
  iecCorrectionFactor,
} from '../lib/atmosphere'
import { solarState, directBeamAltitudeGain, FIELD_SITE, ARRAY_WINTER } from '../lib/solar'
import { CONSTANTS as K } from '../lib/constants'
import {
  Alert,
  Badge,
  Card,
  ClaimChip,
  Formula,
  Grid,
  Stat,
} from '../components/ui'
import { BarSeries } from '../components/charts'
import { usePalette } from '../components/palette'
import { useCfg, useLive, ThresholdStat, Grid2, KVList } from './common'
import { fClock, fdegC, fnum, fWh, fx, fxMult, pct } from '../lib/format'

/** Standard-atmosphere sweep for the pressure/temperature plot. */
function sweep() {
  const out: { h: number; p: number; t: number; rho: number }[] = []
  for (let h = 0; h <= 6000; h += 250) {
    const a = atmosphere(h)
    out.push({ h, p: a.pressure, t: a.temperatureC, rho: a.densityRatio })
  }
  return out
}
const SWEEP = sweep()

export default function Atmosphere() {
  const state = useLive()
  const config = useCfg()
  const p = usePalette()

  const a = state.atmosphere
  const air = atmosphere(config.altitudeM)
  const solar = solarState({ ...FIELD_SITE, ...ARRAY_WINTER }, 12)

  const iec = iecCorrectionFactor(config.altitudeM)
  /* directBeamAltitudeGain returns a FRACTION of extra beam, not a multiplier. */
  const beamGain = 1 + directBeamAltitudeGain(config.altitudeM, solar.elevation)

  return (
    <div className="stack">
      {/* ======================================================== HEADLINE === */}
      <Grid cols={5}>
        <Stat
          label="Site altitude"
          value={fnum(config.altitudeM, 0)}
          unit="m"
          sub={`${fnum(config.altitudeM / 1000, 1)} km ASL`}
          icon={ArrowUpRight}
          size="lg"
        />
        <Stat
          label="Air density"
          value={pct(a.densityRatio)}
          tone={a.densityRatio < 0.5 ? 'warn' : 'accent'}
          sub={`${fnum(a.density, 4)} kg/m³ · ρ/ρ₀`}
          icon={Gauge}
          size="lg"
        />
        <Stat
          label="Pressure"
          value={fnum(a.pressure, 1)}
          unit="kPa"
          sub={`${fnum(a.equivalentAltitude, 0)} m equivalent`}
          size="lg"
        />
        <Stat
          label="Air temperature"
          value={fdegC(a.temperatureC)}
          unit="°C"
          sub={`ISA profile, not the operator value`}
          icon={Thermometer}
          size="lg"
        />
        <Stat
          label="IEC 60664 correction"
          value={fxMult(iec)}
          tone={iec > 1.3 ? 'warn' : 'ok'}
          sub="altitude derating for insulation"
          icon={Zap}
          size="lg"
        />
      </Grid>

      {/* ============================================================ LAWS === */}
      <Card
        title="The four thin-air laws"
        accent
        tools={<ClaimChip provenance="DERIVED" />}
      >
        <div className="grid grid--2">
          <Law
            n={1}
            title="Forced convection collapses as density"
            formula="ṁ = ρ · V̇"
            note="At fixed volumetric flow the air actually moved drops in exact
                  proportion to density. 5,000 m carries 60.1 % of the mass."
            value={pct(a.densityRatio)}
            tone={a.densityRatio < 0.5 ? 'warn' : 'ok'}
          />
          <Law
            n={2}
            title="Natural convection scales as a square root"
            formula="Nu ∝ (Gr·Pr)^(1/4) ∝ √(ρ/ρ₀)"
            note="Buoyancy-driven flow is a weaker function of density than
                  forced flow — the first law is the severe one."
            value={fxMult(state.factors.naturalConvection)}
            tone="info"
          />
          <Law
            n={3}
            title="Restoring sea-level flow costs inverse density in speed"
            formula="N = N₀ / (ρ/ρ₀)"
            note="Slower air means higher rpm for the same mass flow. This is
                  linear and therefore the cheap half of the penalty."
            value={fxMult(state.factors.fanSpeed)}
            tone="info"
          />
          <Law
            n={4}
            title="Fan power follows the cube law"
            formula="P = ρ · N³ · c"
            note="Density enters once directly and twice more through the cubic
                  rpm term, giving the factor of 2.78. This is the expensive
                  half of the penalty."
            value={fxMult(state.factors.fanPower)}
            tone="warn"
          />
        </div>

        <div className="row-gap-3" />
        <Formula>
          (ρ/ρ₀) = {fx(a.densityRatio, 4)} &nbsp;·&nbsp; (1/ρ_rel) = {fx(1 / a.densityRatio, 3)} &nbsp;·&nbsp;
          (1/ρ_rel²) = {fx(1 / (a.densityRatio * a.densityRatio), 3)} &nbsp;=&nbsp; fan shaft power{' '}
          {fxMult(state.factors.fanPower)}
        </Formula>
      </Card>

      {/* ================================================== PROFILE + DATA == */}
      <Grid2 ratio="k2-1">
        <Card
          title="Standard atmosphere — sea level to 6,000 m"
          tools={<Badge tone="neutral" mono>250 m STEPS</Badge>}
        >
          <BarSeries
            data={SWEEP.map((s) => ({ ...s, label: `${(s.h / 1000).toFixed(2)} km` }))}
            xKey="h"
            height={244}
            bars={[
              { key: 'p', label: 'Pressure, kPa', color: p.info },
              { key: 'rho', label: 'Density ratio, ×0.1', color: p.warn },
            ]}
          />
          <div className="row-gap-3" />
          <Formula>
            P = P₀(1 − L·h/T₀)^(gM/(R·L)) = {fnum(a.pressure, 2)} kPa
            <br />
            T = T₀ − L·h = {fnum(standardTemperatureK(config.altitudeM) - K.T0, 2)} K deviation ·{' '}
            {fnum(standardPressure(config.altitudeM), 2)} kPa check
            <br />
            ρ = P/(R·T) &nbsp;→&nbsp; ρ/ρ₀ = {fx(a.densityRatio, 4)} at {fnum(a.temperatureK, 1)} K
          </Formula>
        </Card>

        <div className="stack">
          <Card title="Air properties at site">
            <KVList
              items={[
                { k: 'Density', v: `${fnum(a.density, 5)} kg/m³` },
                { k: 'Dynamic viscosity', v: `${airViscosity(a.temperatureK).toExponential(3)} Pa·s` },
                { k: 'Kinematic viscosity', v: `${(airViscosity(a.temperatureK) / a.density).toExponential(3)} m²/s` },
                { k: 'Knudsen number', v: a.knudsen.toExponential(3) },
                {
                  k: 'Regime',
                  v: a.knudsen < 0.01 ? 'CONTINUUM' : a.knudsen < 0.1 ? 'SLIP' : 'TRANSITIONAL',
                  tone: a.knudsen < 0.01 ? 'ok' : 'info',
                },
                { k: 'Specific heat ratio', v: fx(K.cp_air / (K.cp_air - K.R_air), 3) },
                { k: 'Oxygen partial', v: `${fnum(a.o2Partial, 2)} kPa` },
                {
                  k: 'Density penalty vs sea level',
                  v: `−${fnum((1 - a.densityRatio) * 100, 1)} %`,
                  tone: 'warn',
                },
              ]}
            />
          </Card>

          <Card title="Transport consequences">
            <div className="stack--tight">
              <Consequence
                icon={Wind}
                title="Forced convection"
                value={pct(a.densityRatio)}
                text={`${fx(state.thermal.fanW * state.factors.fanPower, 2)} W to move the air that the sea-level fan would have moved`}
              />
              <Consequence
                icon={Waves}
                title="Natural convection"
                value={fxMult(state.factors.naturalConvection)}
                text="the softer of the two convection penalties"
              />
              <Consequence
                icon={Zap}
                title="Insulation coordination"
                value={fxMult(iec)}
                text="IEC 60664-1 correction factor on the altitude"
              />
              <Consequence
                icon={ArrowUpRight}
                title="Direct beam gain"
                value={fxMult(beamGain)}
                text="thinner atmosphere scatters less — the one place high altitude helps"
              />
            </div>
          </Card>
        </div>
      </Grid2>

      {/* =============================================== SOLAR + DIE-RATING = */}
      <Grid cols={2}>
        <Card
          title="What altitude gives back — direct beam"
          tools={<ClaimChip provenance="LITERATURE" />}
        >
          <Grid cols={2}>
            <Stat
              label="Sea-level beam"
              value={fnum(1200, 0)}
              unit="W/m²"
              sub="clear-sky DNI reference at 6,000 m"
            />
            <Stat
              label="Altitude gain at noon"
              value={fxMult(beamGain)}
              tone="ok"
              sub={`${fnum(solar.elevation, 1)}° elevation at ${FIELD_SITE.label}`}
              icon={ArrowUpRight}
            />
          </Grid>
          <div className="row-gap-2" />
          <Formula>
            DNI(h,θ) = DNI₀ · exp(−τ_b · A^0.4324)
            <br />
            A = {fnum(air.densityRatio, 3)} (relative air mass) · θ = {fnum(solar.elevation, 1)}°
            <br />
            → {fxMult(beamGain)} — a real but small credit against the convective penalty
          </Formula>
          <div className="row-gap-2" />
          <p className="prose muted">
            Beam gain does not rescue the budget. The convective loss on a {fnum(config.loadW, 0)} W
            load is an order of magnitude larger than the solar credit, which is exactly why the
            architecture spends its mass on aerogel rather than on glass.
          </p>
        </Card>

        <Card title="Net altitude verdict" tone={state.factors.fanPower > 2 ? 'warn' : 'ok'}>
          <Grid cols={2}>
            <Stat
              label="Convective penalty"
              value={fxMult(state.factors.fanPower)}
              unit="×"
              tone="warn"
              icon={Wind}
            />
            <Stat
              label="Beam credit"
              value={fxMult(beamGain)}
              unit="×"
              tone="ok"
              icon={ArrowUpRight}
            />
          </Grid>
          <div className="row-gap-2" />
          <KVList
            items={[
              { k: 'Operator ambient', v: `${fdegC(config.ambientC)} °C (independent of altitude)` },
              { k: 'Humidity', v: `${fnum(config.humidity, 0)} % RH` },
              { k: 'Wind', v: `${fnum(config.windMs, 1)} m/s` },
              { k: 'Dust', v: `${fnum(config.dustMgM3, 2)} mg/m³` },
              { k: 'Clock', v: fClock(config.clockHours) },
            ]}
          />
          <div className="row-gap-3" />
          <Alert tone="info" icon={Gauge}>
            Operator-set ambient overrides the ISA profile for the thermal solve. The ISA profile on
            this page exists to derive density, viscosity and the IEC factor — not to guess the
            weather.
          </Alert>
        </Card>
      </Grid>

      {/* ==================================================== WINTER ARRAY == */}
      <Card
        title="Winter array reference — the pessimistic solar case"
        tools={<ClaimChip provenance="LITERATURE" />}
      >
        <Grid cols={4}>
          <Stat label="Array area" value={fnum(ARRAY_WINTER.area, 2)} unit="m²" />
          <Stat label="Efficiency" value={pct(ARRAY_WINTER.efficiency)} tone="accent" />
          <Stat label="Nameplate" value={fWh(ARRAY_WINTER.nameplate * 1000 / 3.6e6, 2)} tone="accent" />
          <Stat
            label="Peak derate at site"
            value={fxMult(1 / Math.max(a.densityRatio, 0.05))}
            tone="info"
            sub="flux gain partially offsetting derate"
            icon={ArrowUpRight}
          />
        </Grid>
        <div className="row-gap-2" />
        <ThresholdStat
          label="Supply vs load at noon, winter"
          value={state.allocation.supplyW - config.loadW}
          unit="W"
          digits={1}
          low={0}
          lowTone="crit"
          lowLabel="array cannot carry the load"
          provenance="DERIVED"
        />
      </Card>
    </div>
  )
}

/* ------------------------------------------------------------- HELPERS ---- */

function Law({
  n,
  title,
  formula,
  note,
  value,
  tone,
}: {
  n: number
  title: string
  formula: string
  note: string
  value: string
  tone: 'ok' | 'info' | 'warn'
}) {
  return (
    <div className="law" data-tone={tone}>
      <div className="law__head">
        <span className="law__n mono">LAW {n}</span>
        <span className="law__v mono tnum">{value}</span>
      </div>
      <div className="law__title">{title}</div>
      <code className="law__eq">{formula}</code>
      <p className="law__note">{note}</p>
    </div>
  )
}

function Consequence({
  icon: Icon,
  title,
  value,
  text,
}: {
  icon: ComponentType<{ size?: number }>
  title: string
  value: string
  text: string
}) {
  return (
    <div className="conseq">
      <Icon size={13} />
      <div className="conseq__b">
        <div className="conseq__h">
          {title} <b className="mono tnum">{value}</b>
        </div>
        <div className="conseq__t">{text}</div>
      </div>
    </div>
  )
}
