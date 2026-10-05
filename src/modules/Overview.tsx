/* ============================================================================
   TVA — MISSION OVERVIEW
   ----------------------------------------------------------------------------
   The one screen the whole project can be understood from. Everything here is
   read from the same live store as every other module, so nothing on this page
   can disagree with the detail panels.
   ========================================================================== */

import {
  ArrowRight,
  Battery,
  Cpu,
  Gauge,
  Info,
  ShieldCheck,
  Siren,
  Snowflake,
  Thermometer,
  Zap,
} from 'lucide-react'
import type { ComponentType } from 'react'
import { FAILURE_MODES } from '../lib/failureModes'
import { CONSTANTS as K, SCOPE_BOUNDARIES } from '../lib/constants'
import { Badge, Button, Card, ClaimChip, Formula, Grid, Stat, Alert } from '../components/ui'
import { Sparkline } from '../components/charts'
import { usePalette } from '../components/palette'
import {
  BarStat,
  Grid2,
  KVList,
  ProvenanceLegend,
  ThresholdStat,
  statusTone,
  useCfg,
  useLive,
  useSeries,
} from './common'
import { fClock, fdegC, fnum, fWhFromJ, fx, fxMult, pct } from '../lib/format'

export default function Overview() {
  const state = useLive()
  const config = useCfg()
  const history = useSeries(600)
  const p = usePalette()

  const severe = state.failures.filter((f) => f.status === 'SEVERE')
  const elevated = state.failures.filter((f) => f.status === 'ELEVATED')
  const worst = state.failures.reduce((a, b) => (b.risk > a.risk ? b : a), state.failures[0])

  const go = (id: string) => () => {
    window.location.hash = `#/${id}`
  }

  return (
    <div className="stack">
      {/* ==================================================== HEADLINE ==== */}
      <Grid cols={4}>
        <Stat
          label="Equipment die"
          value={fdegC(state.thermal.die)}
          unit="°C"
          tone={state.thermal.die > 78 ? 'crit' : state.thermal.die > 55 ? 'warn' : 'ok'}
          sub={`${fx(state.thermal.rejectW)} W rejected to ambient`}
          icon={Thermometer}
          size="lg"
        />
        <Stat
          label="Heat bank"
          value={fdegC(state.thermal.pcm)}
          unit="°C"
          tone={state.pcm.liquidFraction > 0.02 ? 'ok' : 'warn'}
          sub={`${(state.pcm.liquidFraction * 100).toFixed(1)} % liquid · ${fWhFromJ(state.pcm.latentStoredJ, 1)} stored`}
          icon={Snowflake}
          size="lg"
        />
        <Stat
          label="Battery core"
          value={fdegC(state.battery.temperatureC)}
          unit="°C"
          tone={
            state.battery.temperatureC < 0
              ? 'crit'
              : state.battery.temperatureC < 5
                ? 'warn'
                : 'ok'
          }
          sub={
            state.battery.chargeAllowed
              ? 'Charge lock armed — path open'
              : 'CHARGE LOCK ENGAGED below +5 °C'
          }
          icon={Battery}
          size="lg"
        />
        <Stat
          label="Air density"
          value={pct(state.atmosphere.densityRatio)}
          tone={state.atmosphere.densityRatio < 0.5 ? 'warn' : 'accent'}
          sub={`${fnum(state.atmosphere.pressure, 1)} kPa · ${fnum(config.altitudeM, 0)} m`}
          icon={Gauge}
          size="lg"
        />
      </Grid>

      {/* ============================================ POSTURE + VERDICT === */}
      <Grid2 ratio="k2-1">
        <Card
          title="Failure mode register — all eight, live"
          tools={
            <>
              <Badge tone={severe.length ? 'crit' : elevated.length ? 'warn' : 'ok'} mono>
                {severe.length ? `${severe.length} SEVERE` : elevated.length ? `${elevated.length} ELEVATED` : 'NO SEVERE'}
              </Badge>
              <Button icon={ArrowRight} variant="ghost" onClick={go('stress')}>
                Lab
              </Button>
            </>
          }
          bodyClass="card__body--tight"
        >
          <div className="grid grid--2">
            {state.failures.map((f) => {
              const meta = FAILURE_MODES.find((m) => m.id === f.id)
              return (
                <div className="fm-row" key={f.id} data-tone={statusTone(f.status)}>
                  <div className="fm-row__head">
                    <span className="fm-row__idx mono">{String(meta?.index ?? 0).padStart(2, '0')}</span>
                    <span className="fm-row__name">{meta?.name ?? f.id}</span>
                    <Badge tone={statusTone(f.status)} mono>
                      {f.status}
                    </Badge>
                  </div>
                  <div className="fm-row__bars">
                    <div className="fm-row__bar">
                      <span className="mlabel">WITH LOKI</span>
                      <div className="meter">
                        <div
                          className="meter__fill"
                          style={{
                            width: `${f.risk}%`,
                            background:
                              statusTone(f.status) === 'ok'
                                ? 'var(--ok)'
                                : statusTone(f.status) === 'warn'
                                  ? 'var(--warn)'
                                  : 'var(--crit)',
                          }}
                        />
                      </div>
                      <span className="mono tnum">{f.risk.toFixed(0)}</span>
                    </div>
                    <div className="fm-row__bar">
                      <span className="mlabel">UNPROTECTED</span>
                      <div className="meter">
                        <div
                          className="meter__fill"
                          style={{
                            width: `${f.riskUnprotected}%`,
                            background: 'var(--text-3)',
                            opacity: 0.55,
                          }}
                        />
                      </div>
                      <span className="mono tnum">{f.riskUnprotected.toFixed(0)}</span>
                    </div>
                  </div>
                  <div className="fm-row__driver mono">
                    {f.driver}: <b>{fx(f.driverValue, 2)}</b> {f.driverUnit}
                  </div>
                </div>
              )
            })}
          </div>
        </Card>

        <div className="stack">
          <Card
            title="Posture"
            tone={worst.status === 'SEVERE' ? 'crit' : worst.status === 'ELEVATED' ? 'warn' : 'ok'}
          >
            <KVList
              items={[
                {
                  k: 'Worst failure mode',
                  v: `${worst.id.toUpperCase()} · ${worst.risk.toFixed(0)}/100`,
                  tone: statusTone(worst.status),
                },
                { k: 'Ladders', v: `${state.coldLadder.activeId} / ${state.hotLadder.activeId}` },
                { k: 'Supply', v: `${fx(state.allocation.supplyW)} W · ${state.allocation.regime}` },
                {
                  k: 'Net power',
                  v: `${fx(state.netPowerW)} W`,
                  tone: state.netPowerW < 0 ? 'warn' : 'ok',
                },
                { k: 'Sim clock', v: fClock(config.clockHours) },
                {
                  k: 'Overnight',
                  v: state.budget.overnightCapable ? 'CAPABLE' : 'DEFICIT',
                  tone: state.budget.overnightCapable ? 'ok' : 'warn',
                },
              ]}
            />
          </Card>

          <Card title="Scope guardrails" tone="warn">
            <div className="stack--tight">
              {SCOPE_BOUNDARIES.map((b) => (
                <div className="guard" key={b.id}>
                  <ShieldCheck size={11} />
                  <span>{b.text}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </Grid2>

      {/* ================================================== ARCHITECTURE == */}
      <Card
        title="The Vriksh architecture — three layers, independent lifelines"
        accent
        tools={<ClaimChip provenance="LITERATURE" />}
      >
        <div className="grid grid--3">
          <LayerCard
            name="Roots"
            subtitle="Passive · no power required"
            tone="ok"
            items={[
              'Aerogel jacket — 20 mm, k = 17.5 mW/m·K',
              'PCM heat bank — 1.2 kg paraffin, 216 kJ latent',
              'Wax heat gate — 40 °C element, 125:1 conductance switch',
              'Hardware Charge Lock — comparator + MOSFET, +5 °C',
            ]}
          />
          <LayerCard
            name="Trunk"
            subtitle="One shared power budget"
            tone="info"
            items={[
              'STM32 controller — design target < 0.5 W',
              'BMP390 + SHT40 sensing chain',
              'Priority allocator — 7 ranked consumers',
              'Telemetry uplink and comms relay buffer',
            ]}
          />
          <LayerCard
            name="Branches"
            subtitle="Active, allocated on demand"
            tone="violet"
            items={[
              'Smart Cooling — density-compensated blower',
              'Battery Warmer — 20 W polyimide film, last resort',
              'Spark Guard — UV + HF coil, ≥ 300 V only',
              'Life Guard — rainflow scoring, no power draw',
            ]}
          />
        </div>
      </Card>

      {/* =================================================== HEADLINE ARGS = */}
      <Grid cols={3}>
        <Card title="Thin air is the enemy">
          <ThresholdStat
            label="Forced convection at fixed rpm"
            value={state.factors.forcedConvection * 100}
            unit="%"
            digits={1}
            low={40}
            high={75}
            lowTone="crit"
            highTone="ok"
            lowLabel="collapsed"
            highLabel="sea level"
            provenance="DERIVED"
          />
          <div className="row-gap-2" />
          <ThresholdStat
            label="Fan speed to restore sea-level ṁ"
            value={state.factors.fanSpeed}
            unit="×"
            digits={2}
            provenance="DERIVED"
          />
          <div className="row-gap-2" />
          <Formula>
            ṁ = ρ·V̇ &nbsp;→&nbsp; ṁ ∝ ρ &nbsp;|&nbsp; N = N₀/ρ_rel = {fxMult(state.factors.fanSpeed)} &nbsp;|&nbsp; P/P₀ =
            1/ρ_rel² = {fxMult(state.factors.fanPower)}
          </Formula>
        </Card>

        <Card title="Wax gate is a switch, not a controller">
          <Stat
            label="Gate state"
            value={state.thermal.gateOpen ? 'OPEN' : 'SEALED'}
            tone={state.thermal.gateOpen ? 'warn' : 'ok'}
            sub={`${fx(state.thermal.gateW)} W through the gate · R_th ${K.rth_closed} → ${K.rth_open} K/W`}
            icon={Siren}
          />
          <div className="row-gap-2" />
          <BarStat
            label="Gate throughput"
            value={state.thermal.gateW}
            max={Math.max(6, state.thermal.gateW * 1.2)}
            unit="W"
            tone={state.thermal.gateOpen ? 'warn' : 'accent'}
          />
          <div className="row-gap-2" />
          <Formula>
            wax opens at {K.wax_open_c} °C ± {K.wax_hyst} K hysteresis → R_th {K.rth_closed} K/W →{' '}
            {K.rth_open} K/W = {fxMult(K.rth_closed / K.rth_open, 0)} conductance ratio. No firmware in
            the path.
          </Formula>
        </Card>

        <Card title="Daylight is the only free lunch">
          <ThresholdStat
            label="Array output"
            value={state.allocation.supplyW}
            unit="W"
            digits={1}
            low={0}
            lowTone="warn"
            lowLabel="night"
            sub={`POA irradiance ${fnum(state.solar.poa, 0)} W/m² · elevation ${fx(state.solar.elevation, 1)}°`}
          />
          <div className="row-gap-2" />
          <div className="spark-wrap">
            <Sparkline
              values={history.length > 3 ? history.map((h) => h.solarW) : [0, 0, 0]}
              color={p.warn}
              height={34}
            />
            <span className="mlabel">array output, retained window</span>
          </div>
        </Card>
      </Grid>

      {/* ==================================================== TEMPERATURES = */}
      <Grid2 ratio="k2-1">
        <Card
          title="Node temperatures"
          tools={<Badge tone="accent" mono>{fClock(config.clockHours)}</Badge>}
        >
          <div className="grid grid--2">
            {[
              { label: 'Equipment die', v: state.thermal.die, spark: p.crit },
              { label: 'Heat bank', v: state.thermal.pcm, spark: p.ok },
              { label: 'Radiator', v: state.thermal.radiator, spark: p.info },
              { label: 'Battery bay', v: state.battery.temperatureC, spark: p.violet },
            ].map((n) => (
              <div key={n.label} className="node-tile">
                <div className="mlabel">{n.label}</div>
                <div className="node-tile__v mono tnum">{fdegC(n.v)} <span>°C</span></div>
                <Sparkline
                  values={history.length > 3 ? history.map((h) => nodeOf(h, n.label)) : [0, 0]}
                  color={n.spark}
                  height={20}
                />
              </div>
            ))}
          </div>
        </Card>

        <Card title="What the panel should hold TVA to">
          <div className="stack--tight">
            <div className="guard guard--crit">
              <Info size={11} />
              <span>
                Nothing in this application is a measurement. Every figure is produced by a model
                whose constants are individually tagged in the claims ledger.
              </span>
            </div>
            <div className="guard">
              <ShieldCheck size={11} />
              <span>
                Protocols E1–E4 are written and unexecuted. Their status field says PLANNED and the
                UI will not let that be mistaken for a pass.
              </span>
            </div>
            <div className="guard">
              <Cpu size={11} />
              <span>
                The <b>&lt; 0.5 W</b> controller figure is a design target from a sleep-mode budget,
                not a bench reading.
              </span>
            </div>
          </div>
          <div className="row-gap-3" />
          <ProvenanceLegend />
        </Card>
      </Grid2>

      {/* ==================================================== ENTRY POINTS = */}
      <Card title="Where to go next">
        <div className="grid grid--4">
          <Jump icon={Thermometer} label="Live Digital Twin" text="The enclosure, solved live." go={go('twin')} />
          <Jump icon={Snowflake} label="Atmosphere" text="The four thin-air laws, with arithmetic." go={go('atmosphere')} />
          <Jump icon={Zap} label="Decision Ladders" text="Cold and hot, evaluated." go={go('ladder')} />
          <Jump icon={Siren} label="Failure Mode Lab" text="All eight, with the retrofit off." go={go('stress')} />
        </div>
      </Card>

      {severe.length > 0 && (
        <Alert tone="crit" icon={Siren}>
          {severe.length} failure mode{severe.length === 1 ? '' : 's'} in the SEVERE band:{' '}
          {severe.map((f) => f.id).join(', ')}. Open the operator console and look at the ladder
          module before drawing any conclusion from the rest of the dashboard.
        </Alert>
      )}
    </div>
  )
}

/* ------------------------------------------------------------- HELPERS ---- */

function nodeOf(h: { dieC: number; pcmC: number; radiatorC: number; batteryC: number }, label: string) {
  switch (label) {
    case 'Equipment die':
      return h.dieC
    case 'Heat bank':
      return h.pcmC
    case 'Radiator':
      return h.radiatorC
    default:
      return h.batteryC
  }
}

function LayerCard({
  name,
  subtitle,
  tone,
  items,
}: {
  name: string
  subtitle: string
  tone: 'ok' | 'info' | 'violet'
  items: string[]
}) {
  return (
    <div className="layer" data-tone={tone}>
      <div className="layer__head">
        <span className="layer__name">{name}</span>
        <span className="layer__sub">{subtitle}</span>
      </div>
      <ul className="layer__list">
        {items.map((i) => (
          <li key={i}>{i}</li>
        ))}
      </ul>
    </div>
  )
}

function Jump({
  icon: Icon,
  label,
  text,
  go,
}: {
  icon: ComponentType<{ size?: number; strokeWidth?: number }>
  label: string
  text: string
  go: () => void
}) {
  return (
    <button className="jump" onClick={go}>
      <Icon size={16} strokeWidth={2} />
      <span className="jump__label">{label}</span>
      <span className="jump__text">{text}</span>
      <ArrowRight size={13} strokeWidth={2.2} className="jump__go" />
    </button>
  )
}
