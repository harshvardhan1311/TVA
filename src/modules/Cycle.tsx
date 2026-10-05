/* ============================================================================
   TVA — DIURNAL CYCLE
   ----------------------------------------------------------------------------
   A 24-hour sweep at the present configuration. The point of this module is the
   night: everything TVA claims about surviving Chang La is decided between
   sunset and sunrise, so the sweep is drawn with darkness shaded rather than
   compressed out of view.
   ========================================================================== */

import { Moon, Sunrise, Sunset, Sun, Timer, Zap } from 'lucide-react'
import { solarState, solarTimeFromClock, ARRAY_WINTER, ARRAY_SUMMER, FIELD_SITE } from '../lib/solar'
import { nightRuntimeHours, waxMassForShortfall } from '../lib/thermal'
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
import { TimeSeries } from '../components/charts'
import { usePalette } from '../components/palette'
import { useCfg, useLive, useSeries, toHours, Grid2, KVList } from './common'
import { fClock, fnum, fWhFromJ, fx, fxMult, pct } from '../lib/format'

export default function Cycle() {
  const state = useLive()
  const config = useCfg()
  const history = useSeries(1800)
  const p = usePalette()

  /* Solar geometry across a full day at the present clock and day-of-year. */
  const day = Array.from({ length: 49 }, (_, i) => {
    const hour = (i / 48) * 24
    const solarHour = solarTimeFromClock(hour, FIELD_SITE, config.dayOfYear)
    const st = solarState({ ...FIELD_SITE, ...ARRAY_WINTER }, solarHour)
    return { hour, solarHour: st.hour, el: st.elevation, poa: st.poa }
  })

  const sunrise = day.find((d) => d.el > 0)
  const sunset = [...day].reverse().find((d) => d.el > 0)
  const dayLength = sunrise && sunset ? sunset.hour - sunrise.hour : 0
  const nightHours = 24 - dayLength

  const nightDrawW = Math.max(1, config.loadW)
  const winterNpc = nightRuntimeHours(config.pcm.massKg, nightDrawW, config.pcm)
  const extraKgForNight = waxMassForShortfall(nightDrawW, nightHours, config.pcm)

  const series = history.map((h) => ({
    h: toHours(h.t),
    poa: h.solarW,
    die: h.dieC,
    bank: h.bankFraction * 100,
    soc: h.soc * 100,
    amb: h.ambientC,
  }))

  const swing = state.measuredSwingK

  return (
    <div className="stack">
      {/* ======================================================== HEADLINE === */}
      <Grid cols={5}>
        <Stat
          label="Day length"
          value={fnum(dayLength, 2)}
          unit="h"
          icon={Sun}
          size="lg"
          sub={`day ${fnum(config.dayOfYear, 0)} at ${FIELD_SITE.latitude}°N`}
        />
        <Stat
          label="Darkness"
          value={fnum(nightHours, 2)}
          unit="h"
          tone="warn"
          icon={Moon}
          size="lg"
          sub="the window TVA must survive"
        />
        <Stat
          label="Bank hold"
          value={fnum(winterNpc, 1)}
          unit="h"
          tone={winterNpc < nightHours ? 'crit' : winterNpc < nightHours * 1.4 ? 'warn' : 'ok'}
          icon={Timer}
          size="lg"
          sub={`${fnum(config.pcm.massKg, 2)} kg paraffin at present net draw`}
        />
        <Stat
          label="Peak POA"
          value={fnum(Math.max(...day.map((d) => d.poa)), 0)}
          unit="W/m²"
          tone="accent"
          icon={Zap}
          size="lg"
          sub={`${fnum(ARRAY_WINTER.area, 2)} m² winter array`}
        />
        <Stat
          label="Measured swing"
          value={fnum(swing, 2)}
          unit="K"
          tone={swing < config.protectedSwingK ? 'ok' : 'warn'}
          size="lg"
          sub={`protected target ${fnum(config.protectedSwingK, 0)} K · unprotected ${fnum(config.unprotectedSwingK, 0)} K`}
        />
      </Grid>

      {/* ======================================================== SUN ARC === */}
      <Card
        title="Solar geometry — a full day at the present clock"
        tools={<ClaimChip provenance="LITERATURE" />}
      >
        <TimeSeries
          data={day}
          xKey="hour"
          height={200}
          unit="° / W·m⁻²"
          xFormat={(v) => fClock(v)}
          series={[{ key: 'poa', label: 'Plane-of-array irradiance', color: p.warn }]}
        />
        <div className="row-gap-3" />
        <Grid cols={4}>
          <Stat
            label="Sunrise"
            value={sunrise ? fClock(sunrise.hour) : '—'}
            icon={Sunrise}
            sub={`elevation crosses 0° at ${fnum(sunrise?.el ?? 0, 1)}°`}
          />
          <Stat
            label="Solar noon"
            value={fClock(day.reduce((a, b) => (b.el > a.el ? b : a)).hour)}
            tone="accent"
            sub={`max elevation ${fnum(Math.max(...day.map((d) => d.el)), 1)}°`}
            icon={Sun}
          />
          <Stat
            label="Sunset"
            value={sunset ? fClock(sunset.hour) : '—'}
            icon={Sunset}
            sub="declination and hour angle from the SPA"
          />
          <Stat
            label="Darkness"
            value={fnum(nightHours, 2)}
            unit="h"
            tone="warn"
            icon={Moon}
            sub={`${pct(nightHours / 24, 0)} of the day`}
          />
        </Grid>
      </Card>

      {/* ====================================================== NIGHT MATH === */}
      <Grid2 ratio="k1-1">
        <Card
          title="Can the bank carry the night?"
          tone={winterNpc < nightHours ? 'crit' : winterNpc < nightHours * 1.4 ? 'warn' : 'ok'}
          tools={<ClaimChip provenance="DERIVED" />}
        >
          <Formula>
            t_night = m · L / P = {fnum(config.pcm.massKg, 2)} kg ×{' '}
            {fnum(K.pcm_latent / 1000, 0)} kJ/kg ÷{' '}
            {fnum(Math.max(1, nightDrawW), 1)} W
            <br />
            = {fnum(winterNpc, 2)} h &nbsp;vs&nbsp; darkness {fnum(nightHours, 2)} h
            <br />
            margin = {fx(winterNpc - nightHours, 2)} h
          </Formula>
          <div className="row-gap-3" />
          <BarCompare
            label="Bank hold"
            value={winterNpc}
            limit={nightHours}
            unit="h"
            tone={winterNpc < nightHours ? 'crit' : 'ok'}
          />
          <div className="row-gap-2" />
          {winterNpc < nightHours && (
            <Alert tone="crit">
              The bank is short by {fnum(nightHours - winterNpc, 2)} h. Working the wax mass backwards
              for this draw needs{' '}
              <b>{fnum(config.pcm.massKg + extraKgForNight, 2)} kg</b> instead of{' '}
              {fnum(config.pcm.massKg, 2)} kg — an extra{' '}
              {fnum(extraKgForNight, 2)} kg of paraffin in the Roots layer.
            </Alert>
          )}
          <div className="row-gap-2" />
          <KVList
            items={[
              { k: 'Latent capacity', v: fWhFromJ(config.pcm.massKg * K.pcm_latent, 0) },
              { k: 'Melting point', v: `${K.pcm_tm} °C ± ${K.pcm_tm_band}` },
              { k: 'Latent window', v: `${fnum(K.pcm_tm - K.pcm_tm_band / 2, 1)}–${fnum(K.pcm_tm + K.pcm_tm_band / 2, 1)} °C` },
              { k: 'Liquid now', v: pct(state.pcm.liquidFraction) },
            ]}
          />
        </Card>

        <Card title="Mass required for a guaranteed night" accent>
          <Formula>
            m_required = P · t_night / L
            <br />
            = {fnum(Math.max(1, nightDrawW), 1)} W × {fnum(nightHours, 2)} h ÷{' '}
            {fnum(K.pcm_latent / 1000, 0)} kJ/kg
            <br />
            = {fnum(Math.max(1, nightDrawW) * nightHours * 3600 / K.pcm_latent, 3)} kg
          </Formula>
          <div className="row-gap-3" />
          <KVList
            items={[
              { k: 'Required', v: `${fnum(Math.max(1, nightDrawW) * nightHours * 3600 / K.pcm_latent, 2)} kg` },
              { k: 'Fitted', v: `${fnum(config.pcm.massKg, 2)} kg` },
              {
                k: 'Shortfall',
                v: `${fnum(Math.max(0, Math.max(1, nightDrawW) * nightHours * 3600 / K.pcm_latent - config.pcm.massKg), 2)} kg`,
                tone: winterNpc < nightHours ? 'crit' : 'ok',
              },
              { k: 'Extra latent needed', v: fWhFromJ(Math.max(0, Math.max(1, nightDrawW) * nightHours * 3600 - config.pcm.massKg * K.pcm_latent), 0) },
            ]}
          />
          <div className="row-gap-3" />
          <p className="prose muted">
            Wax mass is the one design variable that buys survival directly and costs nothing in
            firmware. It also costs range: every kilogram in the bank is a kilogram the pack does not
            carry. That trade is the mission's, not the model's — hence this panel rather than an
            automatic recommendation.
          </p>
        </Card>
      </Grid2>

      {/* ==================================================== 24H RETAINED == */}
      <Card
        title="Retained telemetry across the run"
        tools={
          <>
            <Badge tone="neutral" mono>
              {history.length} SAMPLES
            </Badge>
            <ButtonlessNote />
          </>
        }
      >
        {history.length > 2 ? (
          <>
            <TimeSeries
              data={series}
              xKey="h"
              height={220}
              unit="mixed"
              xFormat={(v) => `${v.toFixed(1)} h`}
              series={[
                { key: 'poa', label: 'Array output, W', color: p.warn },
                { key: 'die', label: 'Die, °C', color: p.crit },
                { key: 'amb', label: 'Ambient, °C', color: p.text3, dashed: true },
              ]}
            />
            <div className="row-gap-4" />
            <TimeSeries
              data={series}
              xKey="h"
              height={200}
              unit="%"
              xFormat={(v) => `${v.toFixed(1)} h`}
              series={[
                { key: 'bank', label: 'Bank liquid, %', color: p.ok },
                { key: 'soc', label: 'State of charge, %', color: p.violet },
              ]}
            />
          </>
        ) : (
          <Alert tone="info" icon={Timer}>
            Telemetry buffer is still filling. The solver appends a sample every 30 simulated
            seconds; run the clock and both traces will populate.
          </Alert>
        )}
      </Card>

      {/* ==================================================== THERMAL SWING = */}
      <Grid cols={2}>
        <Card title="The diurnal swing that Life Guard scores" tone="warn">
          <Grid cols={3}>
            <Stat
              label="Protected swing"
              value={fnum(state.measuredSwingK, 2)}
              unit="K"
              tone="ok"
              sub="measured over the retained window"
            />
            <Stat
              label="Unprotected swing"
              value={fnum(config.unprotectedSwingK, 1)}
              unit="K"
              tone="crit"
              sub="same diurnal forcing, no roots"
            />
            <Stat
              label="Suppression"
              value={fxMult(1 - state.measuredSwingK / Math.max(config.unprotectedSwingK, 0.01), 2)}
              tone="info"
              sub="roots-layer reduction"
            />
          </Grid>
          <div className="row-gap-2" />
          <Formula>
            N ∝ ΔT^−{K.nl_exponent} → a 1 K reduction in swing is worth{' '}
            {fx(Math.pow(config.unprotectedSwingK / Math.max(state.measuredSwingK, 1), K.nl_exponent), 3)}×
            in solder life
          </Formula>
        </Card>

        <Card title="Winter versus summer array" accent>
          <Formula>
            winter: tilt {ARRAY_WINTER.tilt}° · {fnum(ARRAY_WINTER.area, 2)} m² · η{' '}
            {pct(ARRAY_WINTER.efficiency, 0)} · derate {fx(ARRAY_WINTER.derate, 2)}
            <br />
            summer: tilt {ARRAY_SUMMER.tilt}° · {fnum(ARRAY_SUMMER.area, 2)} m² · η{' '}
            {pct(ARRAY_SUMMER.efficiency, 0)} · derate {fx(ARRAY_SUMMER.derate, 2)}
          </Formula>
          <div className="row-gap-2" />
          <KVList
            items={[
              { k: 'Winter nameplate', v: `${fnum(ARRAY_WINTER.nameplate, 0)} W` },
              { k: 'Summer nameplate', v: `${fnum(ARRAY_SUMMER.nameplate, 0)} W` },
              { k: 'Configured area', v: `${fnum(config.solarArrayAreaM2, 2)} m²` },
              { k: 'Configured efficiency', v: pct(config.solarEfficiency, 0) },
              { k: 'Present supply', v: `${fx(state.allocation.supplyW, 1)} W` },
            ]}
          />
        </Card>
      </Grid>
    </div>
  )
}

/* ------------------------------------------------------------- HELPERS ---- */

function ButtonlessNote() {
  return <span className="mlabel" style={{ margin: 0 }}>t = simulated hours</span>
}

function BarCompare({
  label,
  value,
  limit,
  unit,
  tone,
}: {
  label: string
  value: number
  limit: number
  unit: string
  tone: 'ok' | 'crit'
}) {
  const max = Math.max(value, limit) * 1.15
  return (
    <div className="cmp">
      <div className="cmp__row">
        <span className="mlabel">{label}</span>
        <span className="mono tnum">{fnum(value, 2)} {unit}</span>
      </div>
      <div className="cmp__bar">
        <div className="cmp__fill" style={{ width: `${(value / max) * 100}%`, background: tone === 'ok' ? 'var(--ok)' : 'var(--crit)' }} />
      </div>
      <div className="cmp__row cmp__row--limit">
        <span className="mlabel">darkness</span>
        <span className="mono tnum">{fnum(limit, 2)} {unit}</span>
      </div>
      <div className="cmp__bar cmp__bar--lim">
        <div className="cmp__fill cmp__fill--lim" style={{ width: `${(limit / max) * 100}%` }} />
      </div>
    </div>
  )
}
