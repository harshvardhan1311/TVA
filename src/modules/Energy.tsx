/* ============================================================================
   TVA — TRUNK ENERGY BUDGET
   ----------------------------------------------------------------------------
   One supply, seven ranked consumers, and a deterministic shedding order. The
   order is the design: instrumentation can be cut before comms, comms before
   cooling, and the controller is never shed at all.
   ========================================================================== */

import { BatteryCharging, Coins, Fan, Gauge, TrendingDown, Zap } from 'lucide-react'
import { LOADS } from '../lib/energy'
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
import { BarSeries, TimeSeries } from '../components/charts'
import { usePalette } from '../components/palette'
import { useCfg, useLive, useSeries, toHours, Grid2, KVList } from './common'
import { fClock, fnum, fWhFromJ, fx, fxMult, pct } from '../lib/format'

export default function Energy() {
  const state = useLive()
  const config = useCfg()
  const history = useSeries(1200)
  const p = usePalette()

  const a = state.allocation

  const rows = LOADS.map((l) => {
    const granted = a.granted[l.id] ?? 0
    return {
      ...l,
      granted,
      ratio: l.maxW > 0 ? granted / l.maxW : 0,
      satisfied: a.satisfied[l.id] ?? false,
    }
  })

  const series = history.map((h) => ({
    h: toHours(h.t),
    solar: h.solarW,
    load: h.loadW,
    soc: h.soc * 100,
  }))

  const densityPenalty = state.factors.fanPower
  const fanCost = state.thermal.fanW

  return (
    <div className="stack">
      {/* ======================================================== HEADLINE === */}
      <Grid cols={5}>
        <Stat
          label="Supply"
          value={fx(a.supplyW, 1)}
          unit="W"
          tone="accent"
          size="lg"
          sub={`POA ${fnum(state.solar.poa, 0)} W/m²`}
          icon={Zap}
        />
        <Stat
          label="Demand"
          value={fx(a.totalDemandW, 2)}
          unit="W"
          tone={a.totalDemandW > a.supplyW ? 'warn' : 'ok'}
          size="lg"
          sub={`${a.firstShortfall ? `first shortfall: ${a.firstShortfall}` : 'fully fundable'}`}
        />
        <Stat
          label="Granted"
          value={fx(a.totalGrantedW, 2)}
          unit="W"
          size="lg"
          sub={`${pct(a.totalDemandW > 0 ? a.totalGrantedW / a.totalDemandW : 1, 1)} of demand`}
          icon={Coins}
        />
        <Stat
          label="Regime"
          value={a.regime}
          tone={
            a.regime === 'CRITICAL' ? 'crit' : a.regime === 'SHEDDING' ? 'warn' : 'ok'
          }
          size="lg"
          sub={a.shed.length ? `shed: ${a.shed.join(', ')}` : 'nothing shed'}
        />
        <Stat
          label="Net pack current"
          value={fx(state.budget.netChargeW, 2)}
          unit="W"
          tone={state.budget.netChargeW >= 0 ? 'ok' : 'warn'}
          size="lg"
          sub={state.budget.netChargeW >= 0 ? 'charging' : 'discharging'}
          icon={BatteryCharging}
        />
      </Grid>

      <Alert
        tone={a.regime === 'CRITICAL' ? 'crit' : a.regime === 'SHEDDING' ? 'warn' : 'info'}
        icon={Gauge}
      >
        {a.rationale}
      </Alert>

      {/* ========================================================= RANKING == */}
      <Card
        title="Shedding order — priority 1 is funded first, priority 7 is cut first"
        accent
        tools={<ClaimChip provenance="DESIGN" />}
      >
        <div className="alloc">
          <div className="alloc__hdr">
            <span>Priority</span>
            <span>Consumer</span>
            <span>Layer</span>
            <span>Idle</span>
            <span>Max</span>
            <span>Granted</span>
            <span>Fill</span>
          </div>
          {rows.map((l) => (
            <div className="alloc__row" key={l.id} data-shed={!l.satisfied}>
              <span className="alloc__pri mono">{l.priority}</span>
              <span className="alloc__name">
                {l.name}
                {!l.sheddable && (
                  <Badge tone="ok" mono>
                    NO-SHED
                  </Badge>
                )}
              </span>
              <span className="alloc__layer mono" data-layer={l.layer}>
                {l.layer}
              </span>
              <span className="mono tnum">{fnum(l.idleW, 2)}</span>
              <span className="mono tnum">{fnum(l.maxW, 2)}</span>
              <span className="mono tnum alloc__g">{fnum(l.granted, 2)}</span>
              <span className="alloc__bar">
                <span
                  className="alloc__fill"
                  style={{
                    width: `${Math.max(0, Math.min(100, l.ratio * 100))}%`,
                    background: l.satisfied ? 'var(--ok)' : 'var(--warn)',
                  }}
                />
              </span>
            </div>
          ))}
        </div>

        <div className="row-gap-4" />
        <Formula>
          critical floor = Σ non-sheddable = {fx(a.criticalW, 2)} W
          <br />
          headroom above the floor = {fx(a.headroomW, 2)} W &nbsp;|&nbsp; net supply after the
          equipment itself = {fx(a.netSupplyW, 2)} W
          <br />
          shed = {a.shed.length ? a.shed.join(' → ') : 'nothing — every consumer is funded'}
        </Formula>
      </Card>

      {/* ===================================================== TREND + MATH = */}
      <Grid2 ratio="k2-1">
        <Card
          title="Supply against load across the run"
          tools={
            <Badge tone="neutral" mono>
              {history.length} SAMPLES
            </Badge>
          }
        >
          {history.length > 2 ? (
            <>
              <TimeSeries
                data={series}
                xKey="h"
                height={216}
                unit="W"
                xFormat={(v) => `${v.toFixed(1)} h`}
                series={[
                  { key: 'solar', label: 'Array output', color: p.warn },
                  { key: 'load', label: 'Equipment draw', color: p.info },
                ]}
              />
              <div className="row-gap-4" />
              <TimeSeries
                data={series}
                xKey="h"
                height={170}
                unit="%"
                xFormat={(v) => `${v.toFixed(1)} h`}
                series={[{ key: 'soc', label: 'State of charge', color: p.violet }]}
              />
            </>
          ) : (
            <Alert tone="info" icon={Gauge}>
              Telemetry is still filling. Both traces plot as soon as the buffer holds more than two
              samples.
            </Alert>
          )}
        </Card>

        <div className="stack">
          <Card title="The fan is the budget" tone="warn">
            <Stat
              label="Fan draw at altitude"
              value={fx(fanCost, 2)}
              unit="W"
              tone="warn"
              size="lg"
              icon={Fan}
              sub={`${fxMult(densityPenalty)} the sea-level shaft power`}
            />
            <div className="row-gap-3" />
            <Formula>
              P = ρ·N³·c with N = N₀/ρ_rel
              <br />
              → P/P₀ = ρ_rel·(1/ρ_rel)³ = 1/ρ_rel² ={' '}
              {fxMult(1 / Math.pow(state.atmosphere.densityRatio, 2), 3)}
              <br />
              measured density factor = {fxMult(densityPenalty, 3)} (agrees to{' '}
              {fnum(Math.abs(densityPenalty - 1 / Math.pow(state.atmosphere.densityRatio, 2)) * 100, 2)} %)
            </Formula>
            <div className="row-gap-3" />
            <BarSeries
              data={[
                { label: 'Sea level', fan: config.fanDesignShaftW },
                { label: 'Present site', fan: fanCost },
              ]}
              height={120}
              bars={[{ key: 'fan', label: 'Fan shaft power, W', color: p.warn }]}
            />
          </Card>

          <Card title="Budget health">
            <KVList
              items={[
                {
                  k: 'Demand served',
                  v: pct(state.budget.served),
                  tone: state.budget.served >= 0.999 ? 'ok' : 'warn',
                },
                {
                  k: 'Runway',
                  v: Number.isFinite(state.budget.runwayHours)
                    ? `${fnum(state.budget.runwayHours, 1)} h`
                    : '∞ (charging)',
                },
                { k: 'Autonomy at this draw', v: `${fnum(state.budget.autonomyHours, 1)} h` },
                { k: 'Clock', v: fClock(config.clockHours) },
                {
                  k: 'Overnight',
                  v: state.budget.overnightCapable ? 'CAPABLE' : 'DEFICIT',
                  tone: state.budget.overnightCapable ? 'ok' : 'crit',
                },
              ]}
            />
            <div className="row-gap-2" />
            <p className="prose muted">{state.budget.verdict}</p>
          </Card>
        </div>
      </Grid2>

      {/* ================================================= PACK + CONTROLLER = */}
      <Grid cols={3}>
        <Card title="Pack" accent>
          <KVList
            items={[
              { k: 'State of charge', v: `${fnum(state.battery.soc * 100, 1)} %` },
              { k: 'Deliverable', v: fWhFromJ(state.battery.energyWh * 3600, 1) },
              { k: 'Core temperature', v: `${fnum(state.battery.temperatureC, 1)} °C` },
              { k: 'Capacity factor', v: fxMult(state.battery.capacityFactor, 4) },
              {
                k: 'Charge lock',
                v: state.battery.chargeAllowed ? 'OPEN' : 'ENGAGED',
                tone: state.battery.chargeAllowed ? 'ok' : 'crit',
              },
              {
                k: 'Max charge rate',
                v: `${fx(state.battery.chargeCRateMax, 3)} C (${fnum(state.battery.chargeCurrentMaxA, 2)} A)`,
                tone: state.battery.chargeCRateMax < 0.1 ? 'crit' : 'ok',
              },
              { k: 'Cell resistance', v: `${fnum(state.battery.internalResistanceMohm, 1)} mΩ` },
              { k: 'Plating risk', v: fx(state.battery.platingRisk, 4) },
            ]}
          />
        </Card>

        <Card title="Controller budget" accent>
          <KVList
            items={[
              { k: 'Design target', v: `< ${K.p_controller} W` },
              { k: 'Allocated', v: `${fnum(a.granted.controller ?? 0, 3)} W` },
              { k: 'Idle', v: `${fnum(a.granted.controller ?? 0, 3)} W` },
              { k: 'Sheddable', v: 'NO', tone: 'ok' },
            ]}
          />
          <div className="row-gap-3" />
          <p className="prose muted">
            The controller is the one consumer that is never shed, because losing it blinds every
            Roots-layer fail-safe at once. {K.p_controller} W is a design target derived from a
            sleep-mode budget — no bench measurement exists.
          </p>
          <div className="row-gap-2" />
          <Badge tone="warn" mono>
            DESIGN TARGET — NOT MEASURED
          </Badge>
        </Card>

        <Card title="What shedding costs" accent>
          <div className="stack--tight">
            {LOADS.filter((l) => l.sheddable).map((l) => (
              <div className="shed" key={l.id}>
                <TrendingDown size={12} />
                <div>
                  <div className="shed__t">
                    {l.name} <b className="mono">{fnum(l.idleW, 2)} W</b>
                  </div>
                  <div className="shed__b">{l.description}</div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </Grid>
    </div>
  )
}
