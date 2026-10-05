/* ============================================================================
   TVA — VRIKSH ARCHITECTURE
   ----------------------------------------------------------------------------
   Roots, trunk, branches. Each layer is shown with what it weighs, what it
   draws, what it protects, and — crucially — what happens when you delete it.
   The "retrofit off" column is the whole point of the architecture: every
   component has to earn its mass on the same page it defends itself.
   ========================================================================== */

import type { ComponentType } from 'react'
import {
  BatteryCharging,
  CircuitBoard,
  Fan,
  Layers,
  Leaf,
  Radio,
  Snowflake,
  Thermometer,
  TriangleAlert,
  Zap,
} from 'lucide-react'
import { CONSTANTS as K, CONSTANT_REGISTRY } from '../lib/constants'
import { LOADS } from '../lib/energy'
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
import { useCfg, useLive, Grid2, KVList } from './common'
import { fnum, fx, fxMult, pct } from '../lib/format'

export default function Architecture() {
  const state = useLive()
  const config = useCfg()
  const p = usePalette()

  /* Fraction of the residual risk that the passive layer removes, averaged
     across the eight modes. This is the honest way to say "how much of LOKI is
     just physics" — it is not a power number. */
  const passiveCoverage = state.failures.length
    ? state.failures.reduce(
        (s, f) => s + Math.max(0, (f.riskUnprotected - f.risk) / Math.max(f.riskUnprotected, 1)),
        0,
      ) / state.failures.length
    : 0

  return (
    <div className="stack">
      {/* ======================================================== HEADLINE === */}
      <Grid cols={4}>
        <Stat
          label="Risk removed by passive measures"
          value={pct(passiveCoverage)}
          tone="ok"
          sub="mean reduction across all eight modes"
          icon={Leaf}
          size="lg"
        />
        <Stat
          label="Trunk draw"
          value={fx(K.p_controller, 2)}
          unit="W"
          tone="info"
          sub="design target, sleep-mode budget"
          icon={CircuitBoard}
          size="lg"
        />
        <Stat
          label="Pack mass"
          value={fnum(config.battery.massKg, 2)}
          unit="kg"
          sub={`${fnum(config.battery.capacityAh, 1)} Ah at ${fnum(config.battery.nominalV, 1)} V`}
          icon={BatteryCharging}
          size="lg"
        />
        <Stat
          label="Layers"
          value={3}
          tone="accent"
          sub="root, trunk, branch — independently defeatable"
          icon={Layers}
          size="lg"
        />
      </Grid>

      {/* ========================================================= LAYERS === */}
      <Card
        title="Three layers, independent lifelines"
        accent
        tools={<ClaimChip provenance="DESIGN" />}
      >
        <div className="grid grid--3">
          <LayerBlock
            name="ROOTS"
            subtitle="Passive · survives total power loss"
            tone="ok"
            icon={Snowflake}
            items={[
              {
                k: 'Aerogel jacket, 20 mm',
                v: `k = ${K.aerogel_k} W/m·K`,
                why: 'Conduction falls linearly with thickness and this is the cheapest heat path to cut.',
              },
              {
                k: 'PCM heat bank',
                v: `${fnum(config.pcm.massKg, 1)} kg paraffin`,
                why: `Stores ${fnum(config.pcm.massKg * K.pcm_latent / 3600, 0)} Wh on the ${K.pcm_tm} °C plateau without power.`,
              },
              {
                k: 'Wax heat gate',
                v: `${K.wax_open_c} °C element`,
                why: `Switches R_th ${K.rth_closed} → ${K.rth_open} K/W with no firmware in the path.`,
              },
              {
                k: 'Hardware Charge Lock',
                v: `${K.charge_lock_c} °C comparator`,
                why: 'Blocks the charge MOSFET below freezing on hardware alone.',
              },
              {
                k: 'Passive bleed port',
                v: `${fnum(config.portAreaM2 * 1e4, 1)} cm²`,
                why: 'Lets convection out of the cavity once the gate is open.',
              },
            ]}
          />
          <LayerBlock
            name="TRUNK"
            subtitle="One shared power budget"
            tone="info"
            icon={CircuitBoard}
            items={[
              {
                k: 'STM32 controller',
                v: `< ${K.p_controller} W`,
                why: 'DESIGN target from a sleep-mode budget. Never measured.',
              },
              {
                k: 'BMP390 + SHT40',
                v: 'pressure + RH/T',
                why: 'The sensor chain that lets the ladder know it is cold without guessing.',
              },
              {
                k: 'Priority allocator',
                v: `${LOADS.length} ranked consumers`,
                why: 'Deterministic shedding order so the trunk never browns out the branches.',
              },
              {
                k: 'Telemetry uplink',
                v: 'burst, not stream',
                why: 'Tactical net discipline: airtime costs more than it saves.',
              },
            ]}
          />
          <LayerBlock
            name="BRANCHES"
            subtitle="Active · allocated only when justified"
            tone="violet"
            icon={Zap}
            items={[
              {
                k: 'Smart Cooling',
                v: `${fnum(config.fanDesignFlowM3s, 3)} m³/s · ${fnum(config.fanDesignShaftW, 1)} W`,
                why: 'Density-compensated blower. Pays the cubic fan law to hold sea-level mass flow.',
              },
              {
                k: 'Battery Warmer',
                v: `${fnum(config.heaterMaxW, 0)} W film`,
                why: 'Polyimide heater in the aerogel sleeve. Last rung of the cold ladder.',
              },
              {
                k: 'Spark Guard',
                v: `${fnum(config.railVoltageV, 0)} V rail`,
                why: 'UV + HF coil. Only meaningful at 300 V and above — gated off otherwise.',
              },
              {
                k: 'Life Guard',
                v: '0 W',
                why: 'Rainflow scoring of internal swing. Pure arithmetic, so it costs nothing.',
              },
            ]}
          />
        </div>
      </Card>

      {/* ======================================================== BUDGETS === */}
      <Grid2 ratio="k2-1">
        <Card
          title="Power budget — ranked consumers"
          tools={
            <>
              <Badge tone={state.allocation.regime === 'CRITICAL' ? 'crit' : 'info'} mono>
                {state.allocation.regime}
              </Badge>
              <ClaimChip provenance="DESIGN" />
            </>
          }
        >
          <BarSeries
            data={LOADS.map((l) => ({
              label: l.name,
              request: l.maxW,
              granted: state.allocation.granted[l.id] ?? 0,
            }))}
            height={220}
            bars={[
              { key: 'request', label: 'Requested, W', color: p.text3 },
              { key: 'granted', label: 'Granted, W', color: p.ok },
            ]}
          />
          <div className="row-gap-3" />
          <Formula>
            Σ granted = {fx(state.allocation.totalGrantedW, 2)} W &nbsp;of&nbsp; demand{' '}
            {fx(state.allocation.totalDemandW, 2)} W &nbsp;·&nbsp; supply {fx(state.allocation.supplyW, 1)} W
            <br />
            critical floor = {fx(state.allocation.criticalW, 2)} W &nbsp;|&nbsp; headroom ={' '}
            {fx(state.allocation.headroomW, 2)} W
            <br />
            shed ={' '}
            {state.allocation.shed.length ? state.allocation.shed.join(', ') : 'nothing'} &nbsp;|&nbsp; net
            supply after equipment = {fx(state.allocation.netSupplyW, 2)} W
          </Formula>
          <div className="row-gap-2" />
          <p className="prose muted">{state.allocation.rationale}</p>
        </Card>

        <Card title="Allocation health" tone={state.budget.served >= 0.999 ? 'ok' : 'warn'}>
          <KVList
            items={[
              {
                k: 'Demand served',
                v: pct(state.budget.served),
                tone: state.budget.served >= 0.999 ? 'ok' : 'warn',
              },
              { k: 'Supply', v: `${fx(state.allocation.supplyW, 1)} W` },
              { k: 'Equipment load', v: `${fnum(config.loadW, 1)} W` },
              { k: 'Allocated', v: `${fx(state.allocation.totalGrantedW, 2)} W` },
              {
                k: 'Net pack current',
                v: `${fx(state.budget.netChargeW, 2)} W`,
                tone: state.budget.netChargeW >= 0 ? 'ok' : 'warn',
              },
              { k: 'Runway', v: RUNWAY(state.budget.runwayHours) },
              { k: 'Autonomy at this draw', v: `${fnum(state.budget.autonomyHours, 1)} h` },
              {
                k: 'Overnight capable',
                v: state.budget.overnightCapable ? 'YES' : 'NO',
                tone: state.budget.overnightCapable ? 'ok' : 'crit',
              },
            ]}
          />
          <div className="row-gap-3" />
          <Alert tone={state.budget.overnightCapable ? 'ok' : 'warn'} icon={TriangleAlert}>
            {state.budget.verdict}
          </Alert>
        </Card>
      </Grid2>

      {/* ================================================ MASS LEDGER ======= */}
      <Card
        title="Mass and material ledger"
        tools={<ClaimChip provenance="LITERATURE" />}
      >
        <div className="grid grid--2">
          <div>
            <div className="mlabel">MATERIAL CONSTANTS OF RECORD</div>
            <div className="row-gap-2" />
            <KVList
              items={[
                { k: 'Aerogel conductivity', v: `${K.aerogel_k} W/m·K (${K.aerogel_k_min}–${K.aerogel_k_max})` },
                { k: 'Jacket thickness', v: `${fnum(K.aerogel_t * 1000, 0)} mm` },
                { k: 'PCM latent heat', v: `${fnum(K.pcm_latent / 1000, 0)} kJ/kg` },
                { k: 'PCM melting point', v: `${K.pcm_tm} °C ± ${K.pcm_tm_band}` },
                { k: 'PCM bank mass', v: `${fnum(config.pcm.massKg, 2)} kg` },
                { k: 'Latent capacity', v: `${fnum((config.pcm.massKg * K.pcm_latent) / 3600, 1)} Wh` },
                { k: 'Pack mass', v: `${fnum(config.battery.massKg, 2)} kg` },
                { k: 'Heat-pipe fluid', v: HEAT_PIPE_FLUID },
              ]}
            />
          </div>
          <div>
            <div className="mlabel">PROTECTED EQUIPMENT</div>
            <div className="row-gap-2" />
            <KVList
              items={[
                { k: 'Asset', v: ASSET_NAME(config.assetId) },
                { k: 'Dissipation', v: `${fnum(config.loadW, 1)} W` },
                { k: 'Rail voltage', v: `${fnum(config.railVoltageV, 0)} V` },
                { k: 'Rail gate', v: config.railVoltageV >= 300 ? 'Spark Guard armed' : 'Below 300 V — off', tone: config.railVoltageV >= 300 ? 'warn' : 'ok' },
                { k: 'Die limit (soft)', v: '78 °C' },
                { k: 'Die limit (hard)', v: `${fnum(state.thermal.dieCapJK / 1000, 2)} kJ/K node capacitance` },
                { k: 'Bank hold', v: `${fnum(state.pcm.hoursRemaining, 1)} h at present draw` },
                { k: 'Sensors', v: 'BMP390 · SHT40' },
              ]}
            />
          </div>
        </div>
      </Card>

      {/* ============================================ RETROFIT-OFF TRUTH == */}
      <Card
        title="Delete a layer and this is what breaks"
        tone="warn"
        tools={<ClaimChip provenance="DESIGN" />}
      >
        <div className="grid grid--2">
          <RetrofitRow
            icon={Fan}
            title="Smart Cooling off"
            body={`Die rises with no forced path. Peak die temperature climbs by roughly ${fnum(K.dT_unprotected * 0.42, 0)} K over the LOKI case, and failure mode 03 moves straight from MITIGATED into the ELEVATED band.`}
            mode="03"
          />
          <RetrofitRow
            icon={Thermometer}
            title="Aerogel jacket removed"
            body={`Jacket resistance vanishes and conduction loss rises by ${fxMult(K.aerogel_k_max / K.aerogel_k, 2)}–${fxMult(K.aerogel_k_min / K.aerogel_k, 2)} relative to the fitted value. This is the single largest passive term in the model.`}
            mode="01"
          />
          <RetrofitRow
            icon={BatteryCharging}
            title="Charge Lock removed"
            body={`Below ${K.charge_lock_c} °C the pack is allowed to charge, plating begins, and mode 05 goes unprotected. Lithium plating is not reversible — this one damages hardware permanently.`}
            mode="05"
          />
          <RetrofitRow
            icon={Radio}
            title="Spark Guard removed on an HV rail"
            body={`The UV/HF coil is the only suppression at ${fnum(config.railVoltageV, 0)} V. Without it, mode 07 sits unprotected and Paschen margin becomes the sole defence.`}
            mode="07"
          />
        </div>
      </Card>

      {/* ================================================ CONSTANT REGISTRY = */}
      <Card title="Constants used by this model" accent>
        <div className="reg">
          {CONSTANT_REGISTRY.slice(0, 14).map((c) => (
            <div className="reg__row" key={c.id}>
              <span className="reg__id mono">{c.id}</span>
              <span className="reg__v mono tnum">{c.value} {c.unit}</span>
              <span className="reg__s">{c.source}</span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}

/* ------------------------------------------------------------- HELPERS ---- */

const HEAT_PIPE_FLUID = 'methanol / ammonia — never water'

/** Runway can legitimately be Infinity while the pack is charging. */
function RUNWAY(hours: number): string {
  return Number.isFinite(hours) ? `${fnum(hours, 1)} h` : '∞ (charging)'
}

function ASSET_NAME(id: string) {
  return (
    {
      radio: 'Tactical radio set',
      compute: 'Edge compute node',
      hv: 'HV transmitter',
      uav: 'UAV avionics pack',
      sensor: 'Meteorological sensor head',
    }[id] ?? id
  )
}

function LayerBlock({
  name,
  subtitle,
  tone,
  icon: Icon,
  items,
}: {
  name: string
  subtitle: string
  tone: 'ok' | 'info' | 'violet'
  icon: ComponentType<{ size?: number; strokeWidth?: number }>
  items: { k: string; v: string; why: string }[]
}) {
  return (
    <div className="layer layer--tall" data-tone={tone}>
      <div className="layer__head">
        <span className="layer__name">
          <Icon size={13} strokeWidth={2.2} /> {name}
        </span>
        <span className="layer__sub">{subtitle}</span>
      </div>
      <div className="stack--tight">
        {items.map((i) => (
          <div className="bit" key={i.k}>
            <div className="bit__h">
              {i.k} <b className="mono">{i.v}</b>
            </div>
            <div className="bit__t">{i.why}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

function RetrofitRow({
  icon: Icon,
  title,
  body,
  mode,
}: {
  icon: ComponentType<{ size?: number; strokeWidth?: number }>
  title: string
  body: string
  mode: string
}) {
  return (
    <div className="retro">
      <div className="retro__h">
        <Icon size={13} strokeWidth={2} />
        {title}
        <Badge tone="crit" mono>
          MODE {mode}
        </Badge>
      </div>
      <p className="retro__b">{body}</p>
    </div>
  )
}
