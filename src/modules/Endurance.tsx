/* ============================================================================
   TVA — UAV ENDURANCE
   ----------------------------------------------------------------------------
   The honest endurance panel. Short flight at altitude is dominated by
   aerodynamics, and LOKI cannot help there. What it can recover is the
   electrochemical share — and that share is reported separately, never blended
   into a headline endurance number the reader could mistake for aerodynamic
   credit.
   ========================================================================== */

import { BatteryCharging, Plane, Scale, TriangleAlert } from 'lucide-react'
import { enduranceBreakdown, capacityFactor, ENDURANCE_CASES } from '../lib/battery'
import { CONSTANTS as K, SCOPE_BOUNDARIES } from '../lib/constants'
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
import { useCfg, useLive, Grid2 } from './common'
import { fnum, fx, fxMult, pct } from '../lib/format'

/** Reference airframes for the breakdown panel. Not a catalogue — a scale. */
const CASES = ENDURANCE_CASES

export default function Endurance() {
  const state = useLive()
  const config = useCfg()
  const p = usePalette()

  /* Lift retention follows air density for constant mass and rotor geometry. */
  const liftFactor = state.atmosphere.densityRatio

  const cases = CASES.map((c) => {
    const b = enduranceBreakdown(
      { ...c, liftFactor },
      Math.max(config.ambientC, -40),
    )
    return {
      label: c.label,
      lift: b.liftMin,
      baseline: b.baselineMin,
      loki: b.lokiMin,
      recovered: b.recoveredMin,
      capAtAmbient: capacityFactor(Math.max(config.ambientC, -40)),
    }
  })

  const primary = cases[1]
  const totalLossPct =
    primary.baseline > 0 ? (1 - primary.loki / CASES[1].seaLevelMin) * 100 : 0

  return (
    <div className="stack">
      {/* =================================================== SCOPE BOUNDARY = */}
      <Alert tone="warn" icon={TriangleAlert}>
        {SCOPE_BOUNDARIES[1]?.text ??
          'LOKI recovers battery-capacity loss only. It does not recover aerodynamic lift loss.'}
      </Alert>

      {/* ======================================================== HEADLINE === */}
      <Grid cols={5}>
        <Stat
          label="Air density at site"
          value={pct(liftFactor)}
          tone={liftFactor < 0.7 ? 'warn' : 'accent'}
          size="lg"
          sub={`${fnum(config.altitudeM, 0)} m · lift retention`}
          icon={Plane}
        />
        <Stat
          label="Aerodynamic loss"
          value={fnum((1 - liftFactor) * 100, 1)}
          unit="%"
          tone="crit"
          size="lg"
          sub="hover power ∝ 1/ρ — LOKI does not touch this"
        />
        <Stat
          label="Battery loss recovered"
          value={fnum(primary.recovered, 1)}
          unit="min"
          tone="ok"
          size="lg"
          sub="electrochemical share only"
          icon={BatteryCharging}
        />
        <Stat
          label="Endurance, LOKI"
          value={fnum(primary.loki, 1)}
          unit="min"
          tone="accent"
          size="lg"
          sub={`vs ${fnum(primary.baseline, 1)} min unprotected`}
        />
        <Stat
          label="Remaining shortfall"
          value={fnum(totalLossPct, 1)}
          unit="%"
          tone="warn"
          size="lg"
          sub="against the sea-level figure, all causes"
          icon={Scale}
        />
      </Grid>

      {/* ======================================================== BREAKDOWN = */}
      <Card
        title="Endurance decomposition — where the minutes actually go"
        accent
        tools={<ClaimChip provenance="LITERATURE" />}
      >
        <BarSeries
          data={cases.map((c) => ({
            label: c.label,
            aerodynamics: c.lift,
            battery: Math.max(0, c.lift - c.loki),
            loki: c.loki,
          }))}
          height={230}
          bars={[
            { key: 'aerodynamics', label: 'Aerodynamic ceiling, W-independent', color: p.crit },
            { key: 'battery', label: 'Battery loss, unprotected', color: p.warn },
            { key: 'loki', label: 'Battery loss recovered by LOKI', color: p.ok },
          ]}
          unit="min"
        />
        <div className="row-gap-4" />
        <Formula>
          P_hover ∝ 1/(δ·A) &nbsp;→&nbsp; endurance ∝ ρ_rel
          <br />
          t_SL = {fnum(CASES[1].seaLevelMin, 0)} min · ρ_rel = {fx(liftFactor, 4)} → t_aero ={' '}
          {fnum(primary.lift, 1)} min
          <br />
          capacity factor at {fnum(config.ambientC, 0)} °C = {fx(primary.capAtAmbient, 4)} → t_baseline ={' '}
          {fnum(primary.baseline, 1)} min
          <br />
          pack held near the bank → t_LOKI = {fnum(primary.loki, 1)} min
        </Formula>
      </Card>

      {/* ================================================== CASE BREAKDOWN == */}
      <Card title="Per airframe, present conditions" tools={<Badge tone="neutral" mono>MODELLED</Badge>}>
        <div className="ep">
          <div className="ep__hdr">
            <span>Airframe</span>
            <span>Sea level</span>
            <span>Aerodynamic</span>
            <span>Unprotected</span>
            <span>With LOKI</span>
            <span>Recovered</span>
          </div>
          {cases.map((c) => (
            <div className="ep__row" key={c.label}>
              <span className="ep__name">{c.label}</span>
              <span className="mono tnum">{fnum(CASES[cases.indexOf(c)].seaLevelMin, 0)}</span>
              <span className="mono tnum">{fnum(c.lift, 1)}</span>
              <span className="mono tnum">{fnum(c.baseline, 1)}</span>
              <span className="mono tnum ep__good">{fnum(c.loki, 1)}</span>
              <span className="mono tnum ep__rec">
                +{fnum(c.recovered, 1)}
                <em> ({fnum(c.baseline > 0 ? (c.recovered / c.baseline) * 100 : 0, 1)} %)</em>
              </span>
            </div>
          ))}
          <div className="ep__hdr ep__hdr--f">
            <span>All figures in minutes at {pct(liftFactor)} density.</span>
          </div>
        </div>
      </Card>

      {/* ============================================= WHY IT IS NOT ENOUGH = */}
      <Grid2 ratio="k1-1">
        <Card title="The uncomfortable arithmetic" tone="warn">
          <Grid cols={3}>
            <Stat label="Aerodynamic share" value={fnum((1 - liftFactor) * 100, 1)} unit="%" tone="crit" />
            <Stat label="Battery share" value={fnum(Math.max(0, (1 - primary.capAtAmbient) * 100), 1)} unit="%" tone="warn" />
            <Stat label="LOKI share recovered" value={fnum(primary.baseline > 0 ? (primary.recovered / primary.baseline) * 100 : 0, 1)} unit="%" tone="ok" />
          </Grid>
          <div className="row-gap-3" />
          <Formula>
            loss_total = loss_aero + loss_batt
            <br />
            = {fnum((1 - liftFactor) * 100, 1)} % +{' '}
            {fnum(Math.max(0, (1 - primary.capAtAmbient) * 100), 1)} %
            <br />
            LOKI addresses only the second term, and only by keeping the pack warm
          </Formula>
          <div className="row-gap-3" />
          <p className="prose">
            At {fnum(config.altitudeM, 0)} m the aerodynamic term dominates by a wide margin. No
            amount of thermal engineering makes a rotor efficient in 60 % density air. What LOKI
            buys is the smaller term, reliably, without a pilot noticing — and the honest way to
            present that is as recovered minutes, never as a percentage of the sea-level figure.
          </p>
        </Card>

        <Card title="Battery capacity factor across temperature" accent>
          {Array.from({ length: 9 }, (_, i) => -40 + i * 8).map((t) => (
            <div className="sens" key={t}>
              <span className="mlabel">{t} °C</span>
              <div className="sens__bar">
                <div
                  className="sens__fill"
                  style={{
                    width: `${capacityFactor(t) * 100}%`,
                    background: t < 0 ? 'var(--crit)' : t < 10 ? 'var(--warn)' : 'var(--ok)',
                  }}
                />
              </div>
              <span className="mono tnum">{fxMult(capacityFactor(t), 3)}</span>
            </div>
          ))}
          <div className="row-gap-2" />
          <p className="prose muted">
            The bank holds the pack near {K.pcm_tm} °C, where capacity factor is essentially unity.
            Ambient at Chang La in winter is {fnum(config.ambientC, 0)} °C, where it is{' '}
            {fx(primary.capAtAmbient, 3)}. That difference is the entire electrochemical case for
            the PCM.
          </p>
        </Card>
      </Grid2>

      {/* ========================================================= SCOPE ===== */}
      <Grid cols={2}>
        <Card title="What this module will not claim">
          <div className="stack--tight">
            <No text="Endurance recovery at altitude from thermal management alone." />
            <No text="Any lift, thrust or aerodynamic benefit from the enclosure." />
            <No text="Range figures that blend aerodynamic loss into a battery claim." />
            <No text="Endurance numbers for an airframe whose rotor sizing is unknown." />
          </div>
        </Card>

        <Card title="What it does claim">
          <div className="stack--tight">
            <Yes text="Battery capacity retention is a real, quantifiable, temperature-driven effect." />
            <Yes text="Recovered minutes are reported per airframe and per temperature." />
            <Yes text="The aerodynamic ceiling is shown as a hard bound above the LOKI bar." />
            <Yes text="The bank plateau temperature is the design target, and it is quoted." />
          </div>
        </Card>
      </Grid>

      <Card title="Present pack condition">
        <Grid cols={4}>
          <Stat
            label="Pack core"
            value={fnum(state.battery.temperatureC, 1)}
            unit="°C"
            tone={state.battery.temperatureC < 5 ? 'crit' : 'ok'}
            sub={`capacity factor ${fxMult(capacityFactor(state.battery.temperatureC), 3)}`}
          />
          <Stat
            label="Bank plateau"
            value={fnum(K.pcm_tm, 1)}
            unit="°C"
            tone="ok"
            sub="the temperature LOKI is trying to hold"
          />
          <Stat
            label="Capacity factor"
            value={fxMult(state.battery.capacityFactor)}
            tone={state.battery.capacityFactor < 0.7 ? 'crit' : 'ok'}
            size="lg"
            sub="present, live"
          />
          <Stat
            label="State of charge"
            value={fnum(state.battery.soc * 100, 1)}
            unit="%"
            tone={state.battery.soc < 0.15 ? 'crit' : 'info'}
            size="lg"
          />
        </Grid>
      </Card>
    </div>
  )
}

/* ------------------------------------------------------------- HELPERS ---- */

function No({ text }: { text: string }) {
  return (
    <div className="guard guard--crit">
      <TriangleAlert size={11} />
      <span>{text}</span>
    </div>
  )
}

function Yes({ text }: { text: string }) {
  return (
    <div className="guard">
      <BatteryCharging size={11} />
      <span>{text}</span>
    </div>
  )
}
