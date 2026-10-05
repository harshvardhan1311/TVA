/* ============================================================================
   TVA — SPARK GUARD
   ----------------------------------------------------------------------------
   Spark Guard only claims scope at 300 V and above. Below that it reports
   "out of scope" rather than manufacturing a reassuring number, because a
   dielectric model applied where it does not apply is worse than no model.
   ========================================================================== */

import { ShieldOff, Sparkles, TriangleAlert, Wind } from 'lucide-react'
import {
  requiredClearance,
  trappedPressure,
  peekEnhancement,
  breakdownVoltage,
} from '../lib/dielectric'

import {
  Alert,
  Badge,
  Card,
  ClaimChip,
  Formula,
  Grid,
  Stat,
} from '../components/ui'
import { TimeSeries } from '../components/charts'
import { usePalette } from '../components/palette'
import { useCfg, useLive, Grid2, KVList, statusTone } from './common'
import { fnum, fx, pct } from '../lib/format'

/** Paschen minimum against gap at the present local pressure. */
function paschenSweep(pressureKpa: number) {
  const pPa = pressureKpa * 1000
  const out: { d: number; v: number }[] = []
  for (let d = 0.1; d <= 60; d *= 1.18) {
    const pd = pPa * (d / 1000)
    const B = 2.0e7
    const v = (B * d) / Math.log(B * d + 1)
    out.push({ d, v })
    void pd
  }
  return out
}

export default function SparkGuard() {
  const state = useLive()
  const config = useCfg()
  const p = usePalette()
  const hv = state.hv

  const cfg = {
    railVoltageV: config.railVoltageV,
    clearanceMm: config.hv.clearanceMm,
    clearanceCorrected: config.hv.clearanceCorrected,
    altitudeM: config.altitudeM,
    compartmentTempC: state.thermal.die,
    humidity: config.humidity / 100,
    sealedPressureKpa: config.hv.sealedPressureKpa,
    conductorRadiusMm: config.hv.conductorRadiusMm,
    standoffMm: config.hv.standoffMm,
  }

  const need = requiredClearance(cfg)
  const trapped = trappedPressure(
    config.altitudeM,
    Math.min(config.ambientC, -20),
    Math.max(state.thermal.die, 20),
  )
  const peek = peekEnhancement(config.hv.conductorRadiusMm, config.hv.standoffMm)
  const sweep = paschenSweep(hv.localPressureKpa)
  const minV = Math.min(...sweep.map((s) => s.v))

  const inScope = hv.inScope

  return (
    <div className="stack">
      {/* ======================================================== HEADLINE === */}
      <Grid cols={5}>
        <Stat
          label="Rail voltage"
          value={fnum(config.railVoltageV, 0)}
          unit="V"
          tone={inScope ? 'warn' : 'neutral'}
          size="lg"
          sub={inScope ? 'inside Spark Guard scope' : 'below the 300 V threshold'}
          icon={Sparkles}
        />
        <Stat
          label="Dielectric margin"
          value={fx(hv.margin, 2)}
          unit="×"
          tone={hv.margin >= 1.5 ? 'ok' : hv.margin >= 1 ? 'warn' : 'crit'}
          size="lg"
          sub={`${fnum(hv.marginPct, 0)} % of the 1.5× design requirement`}
        />
        <Stat
          label="Status"
          value={hv.status}
          tone={statusTone(hv.status)}
          size="lg"
          sub="from Paschen, Peek and IEC together"
        />
        <Stat
          label="Local pressure"
          value={fnum(hv.localPressureKpa, 2)}
          unit="kPa"
          size="lg"
          sub={`equivalent altitude ${fnum(hv.localEquivalentAltitudeM, 0)} m`}
        />
        <Stat
          label="Corona index"
          value={fx(hv.coronaIndex, 3)}
          tone={hv.coronaIndex > 0.5 ? 'warn' : 'ok'}
          size="lg"
          sub="micro-discharge activity, 0–1"
          icon={Wind}
        />
      </Grid>

      {/* ========================================================== SCOPE ==== */}
      {!inScope && (
        <Card title="Out of scope — and TVA will not pretend otherwise" tone="info">
          <div className="stack--tight">
            <Alert tone="info" icon={ShieldOff}>
              Spark Guard declares scope only at <b>300 V and above</b>. The present rail is{' '}
              {fnum(config.railVoltageV, 0)} V, so every dielectric figure on this page is reported
              for completeness only. The active suppression component is physically installed and
              consuming nothing.
            </Alert>
            <Alert tone="warn" icon={TriangleAlert}>
              {hv.scopeNote ?? 'Applicability check unavailable.'}
            </Alert>
          </div>
        </Card>
      )}

      {inScope && (
        <>
          <Alert tone={hv.status === 'SAFE' ? 'ok' : 'warn'} icon={Sparkles}>
            {hv.action}
          </Alert>

          {/* ==================================================== PASCHEN ==== */}
          <Card
            title="Paschen minimum — breakdown against gap"
            tools={<ClaimChip provenance="LITERATURE" />}
          >
            <TimeSeries
              data={sweep.filter((_, i) => i % 2 === 0)}
              xKey="d"
              height={216}
              unit="V"
              xFormat={(v) => `${v.toFixed(0)} mm`}
              series={[{ key: 'v', label: 'Breakdown voltage', color: p.info }]}
            />
            <div className="row-gap-3" />
            <Formula>
              V_bd = B·d / ln(B·d + 1), B = 2.0×10⁷ V/m
              <br />
              minimum over the sweep = {fnum(minV, 0)} V at {fnum(config.hv.clearanceMm, 1)} mm,
              {fnum(hv.localPressureKpa, 2)} kPa
              <br />
              working voltage {fnum(config.railVoltageV, 0)} V → margin{' '}
              {fx(hv.breakdownV / Math.max(config.railVoltageV, 1), 2)} × on raw breakdown
            </Formula>
            <div className="row-gap-2" />
            <Alert tone="warn" icon={TriangleAlert}>
              Paschen minima sit near the left edge of this plot at high altitude. Sealed or
              pressurized compartments exist for exactly this reason: moving the local pressure back
              toward sea level moves the operating point away from the minimum.
            </Alert>
          </Card>

          {/* ================================================= CLEARANCE ===== */}
          <Grid2 ratio="k1-1">
            <Card title="Clearance budget" accent>
              <Grid cols={3}>
                <Stat
                  label="Installed"
                  value={fnum(config.hv.clearanceMm, 2)}
                  unit="mm"
                  sub={`${config.hv.clearanceCorrected ? 'IEC corrected' : 'NOT IEC corrected'}`}
                  tone={config.hv.clearanceCorrected ? 'ok' : 'crit'}
                />
                <Stat
                  label="Required"
                  value={fnum(need, 2)}
                  unit="mm"
                  tone="warn"
                  sub="for a 1.5× design margin"
                />
                <Stat
                  label="Headroom"
                  value={fnum(config.hv.clearanceMm - need, 2)}
                  unit="mm"
                  tone={config.hv.clearanceMm >= need ? 'ok' : 'crit'}
                  sub={config.hv.clearanceMm >= need ? 'compliant' : 'short by this much'}
                />
              </Grid>
              <div className="row-gap-3" />
              <Formula>
                IEC 60664-1 correction at {fnum(config.altitudeM, 0)} m = {fx(hv.iecFactor, 3)}
                <br />
                required clearance = d_min × {fx(hv.iecFactor, 3)} × 1.5 = {fnum(need, 2)} mm
                <br />
                {config.hv.clearanceCorrected
                  ? 'The installed value already carries the altitude factor.'
                  : 'The installed value does NOT carry the altitude factor — it is a sea-level number.'}
              </Formula>
              <div className="row-gap-3" />
              <Alert tone={config.hv.clearanceCorrected ? 'ok' : 'crit'}>
                {config.hv.clearanceCorrected
                  ? 'Clearance is quoted post-correction, which is the correct way to specify it. Leave the checkbox alone.'
                  : 'Clearance was specified at sea level and installed at 5,364 m. Switch on the IEC correction in the operator console to see the compliant number.'}
              </Alert>
            </Card>

            <Card title="Peek surface enhancement" accent>
              <Stat
                label="Field enhancement factor"
                value={fx(peek, 3)}
                tone={peek > 1.2 ? 'warn' : 'ok'}
                size="lg"
                sub={`radius ${fnum(config.hv.conductorRadiusMm, 2)} mm · standoff ${fnum(config.hv.standoffMm, 2)} mm`}
              />
              <div className="row-gap-3" />
              <KVList
                items={[
                  { k: 'Raw breakdown', v: `${fnum(hv.breakdownV, 0)} V` },
                  { k: 'Effective working', v: `${fnum(hv.effectiveVoltageV, 0)} V` },
                  {
                    k: 'Local pressure',
                    v: `${fnum(hv.localPressureKpa, 2)} kPa (${config.hv.sealedPressureKpa > 0 ? 'sealed' : 'unsealed'})`,
                  },
                  { k: 'IEC factor', v: fx(hv.iecFactor, 3) },
                  { k: 'Humidity', v: `${fnum(config.humidity, 0)} % RH` },
                  { k: 'Compartment surface', v: `${fnum(state.thermal.die, 1)} °C` },
                ]}
              />
              <div className="row-gap-3" />
              <p className="prose muted">
                Surface field enhancement is a geometry problem, not a voltage one. A 2 mm standoff on
                a 1 mm conductor is roughly {fx(peek, 2)}× the applied field at the surface — which is
                where discharge actually initiates.
              </p>
            </Card>
          </Grid2>

          {/* ================================================ SEALED BAY ====== */}
          <Card
            title="Sealed bay and pressure bladder"
            tone={trapped.feasible ? 'ok' : 'warn'}
            tools={<ClaimChip provenance="DERIVED" />}
          >
            <Grid cols={4}>
              <Stat
                label="Required trapped"
                value={fnum(trapped.requiredKpa, 2)}
                unit="kPa"
                tone="info"
                sub="to restore a sea-level dielectric environment when cold"
              />
              <Stat
                label="Gauge on the bladder"
                value={fnum(trapped.gaugeKpa, 2)}
                unit="kPa"
                size="lg"
                sub="above ambient at site"
              />
              <Stat
                label="Peak-to-trapped"
                value={fx(trapped.peakToTrapped, 3)}
                tone={trapped.peakToTrapped > 1.4 ? 'warn' : 'ok'}
                size="lg"
                sub="diurnal fatigue burden on the bladder"
              />
              <Stat
                label="Configured"
                value={fnum(config.hv.sealedPressureKpa, 2)}
                unit="kPa"
                tone={config.hv.sealedPressureKpa >= trapped.requiredKpa - 1e-6 ? 'ok' : 'crit'}
                size="lg"
                sub={config.hv.sealedPressureKpa > 0 ? 'sealed bay' : 'unsealed'}
              />
            </Grid>
            <div className="row-gap-3" />
            <Formula>
              P₁/T₁ = P₂/T₂ → size the bladder for the COLD case
              <br />
              cold {fnum(Math.min(config.ambientC, -20), 0)} °C → {fnum(trapped.requiredKpa, 2)} kPa
              &nbsp;|&nbsp; hot {fnum(Math.max(state.thermal.die, 20), 0)} °C →{' '}
              {fnum(trapped.requiredKpa * trapped.peakToTrapped, 2)} kPa
            </Formula>
            <div className="row-gap-2" />
            <Alert tone={trapped.feasible ? 'ok' : 'warn'}>{trapped.note}</Alert>
          </Card>
        </>
      )}

      {/* ======================================================= WHY 300 V === */}
      <Grid cols={3}>
        <Card title="Why the threshold exists" accent>
          <p className="prose">
            Spark Guard is a UV and high-frequency coil that ionises the air around a live conductor
            and bleeds charge off it before a streamer can form. Below about 300 V the dielectric is
            nowhere near breakdown for the clearances a sealed enclosure can hold, the coil draws
            power to suppress a discharge that will not happen, and the interlock suppresses it
            anyway.
          </p>
          <div className="row-gap-2" />
          <Formula>
            V_bd(390 mm, 39.6 kPa) = {fnum(breakdownVoltage(39.6, 390), 0)} V
            <br />
            → the 300 V V floor is set below the lowest
            breakdown the design can encounter
          </Formula>
        </Card>

        <Card title="What Spark Guard does not do" accent>
          <div className="stack--tight">
            <Limit text="It does not make a bad clearance adequate. Geometry first, coil second." />
            <Limit text="It does not help below 300 V, and it is interlocked off there." />
            <Limit text="It does not substitute for sealing against condensation at altitude." />
            <Limit text="It does not protect a sealed bay that has lost its trapped pressure." />
            <Limit text="It does not justify operating in rain without a dielectric margin." />
          </div>
        </Card>

        <Card title="HV configuration" accent>
          <KVList
            items={[
              { k: 'Rail', v: `${fnum(config.railVoltageV, 0)} V` },
              { k: 'Clearance', v: `${fnum(config.hv.clearanceMm, 2)} mm` },
              { k: 'IEC corrected', v: config.hv.clearanceCorrected ? 'YES' : 'NO', tone: config.hv.clearanceCorrected ? 'ok' : 'crit' },
              { k: 'Sealed', v: config.hv.sealedPressureKpa > 0 ? 'YES' : 'NO' },
              { k: 'Trapped pressure', v: `${fnum(config.hv.sealedPressureKpa, 2)} kPa` },
              { k: 'Conductor radius', v: `${fnum(config.hv.conductorRadiusMm, 2)} mm` },
              { k: 'Standoff', v: `${fnum(config.hv.standoffMm, 2)} mm` },
              {
                k: 'Fitted',
                v: config.sparkGuardFitted ? 'YES' : 'NO',
                tone: config.sparkGuardFitted ? 'ok' : 'neutral',
              },
            ]}
          />
          <div className="row-gap-3" />
          <Badge tone={inScope ? 'warn' : 'info'} mono>
            {inScope ? 'IN SCOPE — ARMED' : 'OUT OF SCOPE — INTERLOCKED OFF'}
          </Badge>
          <div className="row-gap-2" />
          <p className="prose muted">
            Density at {fnum(config.altitudeM, 0)} m is {pct(state.atmosphere.densityRatio)}, so a
            Paschen minimum at {fnum(hv.localPressureKpa, 1)} kPa is materially lower than the
            sea-level value the same gap would show.
          </p>
        </Card>
      </Grid>
    </div>
  )
}

/* ------------------------------------------------------------- HELPERS ---- */

function Limit({ text }: { text: string }) {
  return (
    <div className="guard">
      <ShieldOff size={11} />
      <span>{text}</span>
    </div>
  )
}
