/* ============================================================================
   TVA — LIVE DIGITAL TWIN
   ----------------------------------------------------------------------------
   The enclosure, solved. Every readout on this page comes from the same
   SimState object the viewport renders, so the picture and the numbers can
   never disagree.
   ========================================================================== */

import { useState } from 'react'
import {
  Activity,
  ArrowDownUp,
  Gauge,
  Snowflake,
  Thermometer,
  TriangleAlert,
  Wind,
  Zap,
} from 'lucide-react'
import { EnclosureField } from '../components/EnclosureField'
import { TimeSeries } from '../components/charts'
import { usePalette } from '../components/palette'
import { Alert, Badge, Card, Formula, Grid, Stat, Switch } from '../components/ui'
import { useSim } from '../sim/store'
import {
  Grid2,
  KVList,
  useCfg,
  useHasHistory,
  useSeries,
  toHours,
} from './common'
import { fClock, fdegC, fnum, fWhFromJ, fx, fxMult, pct } from '../lib/format'
import { CONSTANTS as K } from '../lib/constants'

export default function Twin() {
  const state = useSim((s) => s.state)
  const config = useCfg()
  const history = useSeries(900)
  const p = usePalette()
  const hasHistory = useHasHistory()
  const [showFlow, setShowFlow] = useState(true)
  const [showTracers, setShowTracers] = useState(true)

  const series = history.map((h) => ({
    h: toHours(h.t),
    die: h.dieC,
    pcm: h.pcmC,
    bat: h.batteryC,
    amb: h.ambientC,
    bank: h.bankFraction * 100,
  }))

  /* --- Where the heat is going right now --------------------------------- */
  const paths = [
    { label: 'Heat pipe → bank', w: Math.max(0, state.thermal.pipeFlowW), color: p.warn },
    { label: 'Wax gate → radiator', w: Math.max(0, state.thermal.gateW), color: p.info },
    { label: 'Open port convection', w: Math.max(0, state.thermal.portLossW), color: p.accent },
    { label: 'Aerogel jacket', w: Math.max(0, state.thermal.lossW), color: p.ok },
    { label: 'Battery bay leak', w: Math.max(0, state.thermal.battLossW), color: p.violet },
    { label: 'Radiator rejection', w: Math.max(0, state.thermal.radLossW), color: p.text2 },
  ]
  const totalPath = paths.reduce((s, x) => s + x.w, 0)
  const loadTotal = config.loadW

  return (
    <div className="stack">
      {/* ======================================================= VIEWPORT === */}
      <Card
        title="Enclosure cross-section"
        tools={
          <>
            <Switch label="Flow field" checked={showFlow} onChange={setShowFlow} />
            <Switch label="Tracers" checked={showTracers} onChange={setShowTracers} />
          </>
        }
        bodyClass="card__body--pad0"
      >
        <div className="viewport-frame">
          <EnclosureField
            state={state}
            ambientC={config.ambientC}
            loadW={config.loadW}
            insulationT={config.enclosure.insulationT}
            showFlow={showFlow}
            showTracers={showTracers}
          />

          <div className="viewport__hud viewport__hud--tl">
            <div>
              <span className="k">SITE </span>
              <b>{fnum(config.altitudeM, 0)} m</b> · {fnum(state.atmosphere.pressure, 1)} kPa
            </div>
            <div>
              <span className="k">ρ/ρ₀ </span>
              <b>{pct(state.atmosphere.densityRatio)}</b> · Kn {fx(state.atmosphere.knudsen, 5)}
            </div>
            <div>
              <span className="k">TAMB </span>
              <b>{fdegC(config.ambientC)} °C</b> · {fClock(config.clockHours)}
            </div>
          </div>

          <div className="viewport__hud viewport__hud--tr">
            <div>
              <span className="k">SUPPLY </span>
              <b>{fx(state.allocation.supplyW)} W</b>
            </div>
            <div>
              <span className="k">LOAD </span>
              <b>{fx(loadTotal, 0)} W</b>
            </div>
            <div>
              <span className="k">NET </span>
              <b style={{ color: state.netPowerW < 0 ? p.crit : p.ok }}>
                {fx(state.netPowerW)} W
              </b>
            </div>
          </div>

          <div className="viewport__hud viewport__hud--bl">
            <div>
              <span className="k">BANK </span>
              <b>{(state.pcm.liquidFraction * 100).toFixed(1)} %</b> ·{' '}
              {fWhFromJ(state.pcm.latentStoredJ, 1)} of{' '}
              {fWhFromJ(state.pcm.latentCapacityJ, 0)}
            </div>
            <div>
              <span className="k">GATE </span>
              <b>{state.thermal.gateOpen ? 'OPEN' : 'SEALED'}</b> · R_th{' '}
              {state.thermal.gateOpen ? K.rth_open : K.rth_closed} K/W
            </div>
          </div>

          <div className="viewport__hud viewport__hud--br">
            <div>
              <span className="k">FIELD </span>
              analytic reconstruction of the 4-node solution
            </div>
            <div>
              <span className="k">SCALE </span>
              <b>{fnum(Math.min(config.ambientC, -40), 0)} °C</b> →{' '}
              <b>{fnum(Math.max(state.thermal.die, 45), 0)} °C</b>
            </div>
          </div>
        </div>
      </Card>

      {/* ========================================================== STATS === */}
      <Grid cols={6}>
        <Stat
          label="Die"
          value={fdegC(state.thermal.die)}
          unit="°C"
          tone={state.thermal.die > 78 ? 'crit' : state.thermal.die > 55 ? 'warn' : 'ok'}
          icon={Thermometer}
        />
        <Stat
          label="Bank"
          value={fdegC(state.thermal.pcm)}
          unit="°C"
          tone={state.pcm.inPlateau ? 'accent' : 'neutral'}
          sub={state.pcm.inPlateau ? 'ON PLATEAU' : 'SENSIBLE ONLY'}
          icon={Snowflake}
        />
        <Stat
          label="Radiator"
          value={fdegC(state.thermal.radiator)}
          unit="°C"
          icon={ArrowDownUp}
          sub={`${fx(state.thermal.radLossW)} W rejected`}
        />
        <Stat
          label="Pack"
          value={fdegC(state.thermal.battery)}
          unit="°C"
          tone={state.battery.temperatureC < 5 ? 'crit' : 'ok'}
          sub={state.battery.chargeAllowed ? 'CHARGE OK' : 'LOCK ENGAGED'}
          icon={Zap}
        />
        <Stat
          label="State of charge"
          value={fnum(state.battery.soc * 100, 1)}
          unit="%"
          tone={state.battery.soc < 0.15 ? 'crit' : state.battery.soc < 0.3 ? 'warn' : 'ok'}
          sub={`${fWhFromJ(state.battery.energyWh * 3600, 1)} deliverable`}
        />
        <Stat
          label="Fan draw"
          value={fx(state.thermal.fanW, 2)}
          unit="W"
          tone="info"
          sub={`×${fxMult(state.factors.fanPower)} penalty`}
          icon={Wind}
        />
      </Grid>

      {/* ================================================ TRENDS + FLOWS == */}
      <Grid2 ratio="k2-1">
        <Card
          title="Node temperatures"
          tools={
            <Badge tone="neutral" mono>
              {history.length ? `${history.length} SAMPLES` : 'AWAITING DATA'}
            </Badge>
          }
        >
          {hasHistory ? (
            <TimeSeries
              data={series}
              xKey="h"
              height={236}
              unit="°C"
              xFormat={(v) => `${v.toFixed(1)} h`}
              referenceLines={[
                { y: K.wax_open_c, label: 'wax gate 40 °C', color: p.warn },
                { y: K.charge_lock_c, label: 'charge lock +5 °C', color: p.info },
                { y: K.pcm_tm, label: 'PCM 15 °C', color: p.ok },
              ]}
              series={[
                { key: 'die', label: 'Die', color: p.crit },
                { key: 'pcm', label: 'Heat bank', color: p.ok },
                { key: 'bat', label: 'Battery bay', color: p.violet },
                { key: 'amb', label: 'Ambient', color: p.text3, dashed: true },
              ]}
            />
          ) : (
            <Alert tone="info" icon={Activity}>
              Telemetry buffer is empty. The solver appends a sample every 30 simulated seconds —
              run it and this chart fills.
            </Alert>
          )}
        </Card>

        <div className="stack">
          <Card title="Heat paths" accent>
            <div className="paths">
              <div className="paths__in">
                <div className="mlabel">LOAD ENTERING THE CAVITY</div>
                <div className="paths__in-v mono tnum">{fx(loadTotal, 1)} W</div>
              </div>
              {paths.map((x) => (
                <div className="paths__row" key={x.label}>
                  <span className="paths__label">{x.label}</span>
                  <div className="paths__bar">
                    <div
                      className="paths__fill"
                      style={{
                        width: `${loadTotal > 0 ? Math.min(100, (x.w / Math.max(loadTotal, x.w)) * 100) : 0}%`,
                        background: x.color,
                      }}
                    />
                  </div>
                  <span className="paths__v mono tnum">{fx(x.w, 2)} W</span>
                </div>
              ))}
              <div className="paths__foot mono">
                {`total accounted: ${fx(totalPath, 2)} W of ${fx(loadTotal, 2)} W`}
                {Math.abs(totalPath - loadTotal) > 0.6 && ' · solver residual below 0.6 W'}
              </div>
            </div>
          </Card>

          <Card title="Energy ledger">
            <KVList
              items={[
                { k: 'Solar array', v: `${fx(state.solar.poa, 0)} W/m² · ${fx(state.allocation.supplyW)} W` },
                { k: 'Equipment dissipation', v: `${fx(loadTotal, 1)} W` },
                { k: 'Allocated to branches', v: `${fx(state.allocation.totalGrantedW, 2)} W` },
                {
                  k: 'Regime',
                  v: state.allocation.regime,
                  tone:
                    state.allocation.regime === 'CRITICAL'
                      ? 'crit'
                      : state.allocation.regime === 'SHEDDING'
                        ? 'warn'
                        : 'ok',
                },
                { k: 'Waste heat available', v: `${fx(state.wasteHeatW, 1)} W` },
                {
                  k: 'Cold ladder',
                  v: state.coldLadder.activeId,
                  tone: state.coldLadder.activeId === 'heater' ? 'warn' : 'ok',
                },
                {
                  k: 'Hot ladder',
                  v: state.hotLadder.activeId,
                  tone: state.hotLadder.activeId === 'throttle' ? 'warn' : 'ok',
                },
              ]}
            />
          </Card>
        </div>
      </Grid2>

      {/* ==================================================== CAPACITANCE == */}
      <Grid cols={3}>
        <Card title="Node capacitances" accent>
          <Formula>
            C_die = {fx(state.thermal.dieCapJK, 1)} J/K
            <br />
            C_bank = {fnum(state.thermal.bankCapJK / 1000, 2)} kJ/K
            <br />
            C_batt = {fnum(state.thermal.battCapJK, 0)} J/K
            <br />
            C_rad = {fnum(state.thermal.radCapJK, 0)} J/K
          </Formula>
          <div className="row-gap-2" />
          <p className="prose muted">
            The bank's capacitance is {fnum(state.thermal.bankCapJK / Math.max(state.thermal.dieCapJK, 1e-6), 0)}×
            the die's because it is on its latent plateau. That ratio is the entire argument for
            storing heat in wax rather than in aluminium.
          </p>
        </Card>

        <Card title="Convection derating">
          <Formula>
            h ∝ √(ρ/ρ₀) → {fxMult(state.factors.naturalConvection)}
            <br />
            ṁ = ρ·V̇ → {fxMult(state.factors.forcedConvection, 3)}
            <br />
            N = N₀/ρ_rel → {fxMult(state.factors.fanSpeed)}
            <br />
            P = ρN³ → {fxMult(state.factors.fanPower)}
          </Formula>
          <div className="row-gap-2" />
          <p className="prose muted">
            Restoring sea-level mass flow costs {fxMult(state.factors.fanPower)} the shaft power.
            The master report's 2.8× figure is confirmed; the preliminary CFD workbench's 1.77× speed
            multiplier came from an erroneous air density and is corrected in the claims ledger.
          </p>
        </Card>

        <Card title="Bank remaining hold">
          <Stat
            label="Night runtime at present draw"
            value={fnum(state.pcm.hoursRemaining, 1)}
            unit="h"
            tone={state.pcm.hoursRemaining < 3 ? 'crit' : state.pcm.hoursRemaining < 7 ? 'warn' : 'ok'}
            icon={Gauge}
            size="lg"
          />
          <div className="row-gap-2" />
          <KVList
            items={[
              { k: 'Latent stored', v: fWhFromJ(state.pcm.latentStoredJ, 1) },
              { k: 'Latent capacity', v: fWhFromJ(state.pcm.latentCapacityJ, 0) },
              {
                k: 'Darkness remaining',
                v: `${fnum(state.environment.darknessHours, 1)} h`,
              },
              { k: 'Bank state', v: state.pcm.inPlateau ? 'ON PLATEAU' : 'SENSIBLE' },
            ]}
          />
        </Card>
      </Grid>

      {/* ======================================================= WARNINGS === */}
      {state.warnings.length > 0 && (
        <Card title={`Active advisories — ${state.warnings.length}`} tone="warn">
          <div className="stack--tight">
            {state.warnings.map((w) => (
              <Alert
                key={w.id}
                tone={w.severity === 'crit' ? 'crit' : w.severity === 'warn' ? 'warn' : 'info'}
                icon={TriangleAlert}
              >
                {w.text}
              </Alert>
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}
