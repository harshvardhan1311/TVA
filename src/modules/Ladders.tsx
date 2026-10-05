/* ============================================================================
   TVA — DECISION LADDERS
   ----------------------------------------------------------------------------
   LOKI never decides in software what it can decide in wax. Both ladders are
   printed here as rungs, each with the inequality that gates it and the layer
   that executes it, so the logic is auditable rather than implied.
   ========================================================================== */

import { Ban, ChevronRight, CircleCheck, CircleSlash, Zap } from 'lucide-react'
import { CONSTANTS as K } from '../lib/constants'
import { coldLadder, hotLadder, type LadderTrace } from '../lib/decisionLadder'
import {
  Alert,
  Badge,
  Card,
  ClaimChip,
  Formula,
  Grid,
  Stat,
} from '../components/ui'
import { useCfg, useLive, Grid2 } from './common'
import { fClock, fdegC, fnum, fx } from '../lib/format'

export default function Ladders() {
  const state = useLive()
  const config = useCfg()

  /* Recompute both ladders here from the live configuration so the page shows
     the decision the model would make right now, independent of whatever the
     last engine step cached. */
  const cold = coldLadder({
    batteryC: state.battery.temperatureC,
    dieC: state.thermal.die,
    bankFraction: state.pcm.liquidFraction,
    solarW: state.allocation.supplyW,
    wasteHeatW: state.wasteHeatW,
    soc: state.battery.soc,
    densityRatio: state.atmosphere.densityRatio,
    ambientC: config.ambientC,
  })
  const hot = hotLadder({
    dieC: state.thermal.die,
    bankFraction: state.pcm.liquidFraction,
    bankC: state.thermal.pcm,
    solarW: state.allocation.supplyW,
    radiatorAreaM2: config.radiatorAreaM2,
    densityRatio: state.atmosphere.densityRatio,
    ambientC: config.ambientC,
    loadW: config.loadW,
    soc: state.battery.soc,
  })

  return (
    <div className="stack">
      {/* ======================================================== HEADLINE === */}
      <Grid cols={4}>
        <Stat
          label="Cold ladder"
          value={cold.activeId.toUpperCase()}
          tone={cold.activeId === 'heater' ? 'crit' : cold.activeId === 'standby' ? 'ok' : 'warn'}
          sub={cold.headline}
          size="lg"
        />
        <Stat
          label="Hot ladder"
          value={hot.activeId.toUpperCase()}
          tone={hot.activeId === 'throttle' ? 'crit' : hot.activeId === 'standby' ? 'ok' : 'warn'}
          sub={hot.headline}
          size="lg"
        />
        <Stat
          label="Passive rungs"
          value={`${cold.passive ? 2 : 1}`}
          tone="ok"
          sub="operate with no firmware in the path"
        />
        <Stat
          label="Active spend"
          value={fx(cold.powerW + hot.powerW, 2)}
          unit="W"
          tone="info"
          sub="both ladders combined, this instant"
          icon={Zap}
        />
      </Grid>

      {/* ========================================================= LADDERS == */}
      <Grid2 ratio="k1-1">
        <Card
          title="Cold ladder — need heat?"
          tone={cold.activeId === 'heater' ? 'crit' : cold.activeId === 'standby' ? 'ok' : 'warn'}
          tools={
            <>
              <Badge tone={cold.passive ? 'ok' : 'violet'} mono>
                {cold.passive ? 'PASSIVE' : 'ACTIVE'}
              </Badge>
              <ClaimChip provenance="DESIGN" />
            </>
          }
        >
          <Formula>
            Need heat? &nbsp;→&nbsp; waste heat &nbsp;→&nbsp; heat bank &nbsp;→&nbsp; solar &nbsp;→&nbsp;
            electric heater &nbsp;→&nbsp; throttle
          </Formula>
          <div className="row-gap-3" />
          <div className="rungs">
            {cold.steps.map((s) => (
              <Rung key={s.id} step={s} />
            ))}
          </div>
          <div className="row-gap-3" />
          <KVFooter trace={cold} />
        </Card>

        <Card
          title="Hot ladder — need heat out?"
          tone={hot.activeId === 'throttle' ? 'crit' : hot.activeId === 'standby' ? 'ok' : 'warn'}
          tools={
            <>
              <Badge tone={hot.passive ? 'ok' : 'violet'} mono>
                {hot.passive ? 'PASSIVE' : 'ACTIVE'}
              </Badge>
              <ClaimChip provenance="DESIGN" />
            </>
          }
        >
          <Formula>
            Radiate &nbsp;→&nbsp; conduct to bank &nbsp;→&nbsp; open ports &nbsp;→&nbsp; radiator ramp
            &nbsp;→&nbsp; forced air &nbsp;→&nbsp; processor throttle
          </Formula>
          <div className="row-gap-3" />
          <div className="rungs">
            {hot.steps.map((s) => (
              <Rung key={s.id} step={s} />
            ))}
          </div>
          <div className="row-gap-3" />
          <KVFooter trace={hot} />
        </Card>
      </Grid2>

      {/* ================================================== WHY PASSIVE ===== */}
      <Grid cols={3}>
        <Card title="The wax gate does rung one" tone="ok" accent>
          <Formula>
            wax opens at {K.wax_open_c} °C
            <br />
            R_th: {K.rth_closed} K/W &nbsp;→&nbsp; {K.rth_open} K/W
            <br />
            ratio: {fx(K.rth_closed / K.rth_open, 0)} : 1
          </Formula>
          <div className="row-gap-2" />
          <p className="prose muted">
            The most important rung on the hot ladder has no microcontroller in it. A wax element
            expands at {K.wax_open_c} °C, opens the gate, and the radiator path appears. No firmware
            runs, no sensor is read, no allocation decision is made. The microcontroller cannot
            prevent it — which is precisely the point of putting it first.
          </p>
          <div className="row-gap-2" />
          <Stat
            label="Gate state now"
            value={state.thermal.gateOpen ? 'OPEN' : 'SEALED'}
            tone={state.thermal.gateOpen ? 'warn' : 'ok'}
            sub={`${fx(state.thermal.gateW, 2)} W through ${state.thermal.gateOpen ? K.rth_open : K.rth_closed} K/W`}
          />
        </Card>

        <Card title="The charge lock does rung zero" tone="ok" accent>
          <Formula>
            comparator: T_batt &lt; {K.charge_lock_c} °C
            <br />
            action: charge MOSFET → OFF
            <br />
            release: T_batt &gt; {fdegC(K.charge_lock_c)} °C + hysteresis
          </Formula>
          <div className="row-gap-2" />
          <p className="prose muted">
            Before the ladder is consulted at all, a hardware comparator holds the charge path open.
            It has no code path, no override and no timeout. It is the only rung that protects the
            pack against something the model cannot undo: lithium plating is permanent.
          </p>
          <div className="row-gap-2" />
          <Stat
            label="Charge lock"
            value={state.battery.chargeAllowed ? 'OPEN' : 'ENGAGED'}
            tone={state.battery.chargeAllowed ? 'ok' : 'crit'}
            sub={`pack at ${fdegC(state.battery.temperatureC)} °C`}
          />
        </Card>

        <Card title="What the ladders refuse to do">
          <div className="stack--tight">
            <Forbid
              title="Never charge a cold pack"
              body="Bypass, override and 'just this once' all end with a permanently damaged cell."
            />
            <Forbid
              title="Never heat the die directly"
              body="The heater lives in the battery sleeve. The die is served through the pipes."
            />
            <Forbid
              title="Never let software gate the wax"
              body="If the microcontroller hangs, the gate still opens. That is the design."
            />
            <Forbid
              title="Never throttle before the branches"
              body="Throttle is the last rung on both ladders, after every passive option."
            />
          </div>
        </Card>
      </Grid>

      {/* ==================================================== CURRENT INPUTS = */}
      <Card
        title="Live ladder inputs"
        tools={<Badge tone="accent" mono>{fClock(config.clockHours)}</Badge>}
      >
        <Grid cols={4}>
          <Stat
            label="Battery core"
            value={fdegC(state.battery.temperatureC)}
            unit="°C"
            tone={state.battery.temperatureC < K.charge_lock_c ? 'crit' : 'ok'}
            sub={`charge lock at ${K.charge_lock_c} °C`}
          />
          <Stat
            label="Die"
            value={fdegC(state.thermal.die)}
            unit="°C"
            tone={state.thermal.die > 78 ? 'crit' : state.thermal.die > 55 ? 'warn' : 'ok'}
            sub="soft limit 78 °C"
          />
          <Stat
            label="Bank liquid"
            value={pctOf(state.pcm.liquidFraction)}
            tone={state.pcm.liquidFraction < 0.01 ? 'crit' : state.pcm.liquidFraction < 0.35 ? 'warn' : 'ok'}
            sub={`${fnum(state.pcm.hoursRemaining, 1)} h of hold left`}
          />
          <Stat
            label="Available input"
            value={fx(Math.max(state.wasteHeatW, state.allocation.supplyW), 1)}
            unit="W"
            tone="info"
            sub={`waste ${fx(state.wasteHeatW, 1)} W · array ${fx(state.allocation.supplyW, 1)} W`}
          />
        </Grid>
      </Card>

      {cold.activeId === 'heater' && (
        <Alert tone="crit" icon={Ban}>
          The cold ladder has exhausted waste heat, the bank and the array, and is running the
          electric heater at {fnum(cold.powerW, 0)} W. This is the design working as intended — but it
          is also the sound of a mission that has run out of passive margin.
        </Alert>
      )}
    </div>
  )
}

/* ------------------------------------------------------------- HELPERS ---- */

function pctOf(v: number) {
  return `${fnum(v * 100, 1)}%`
}

function Rung({ step }: { step: LadderTrace['steps'][number] }) {
  const state_ = step.active ? 'active' : step.eligible ? 'ready' : 'idle'
  return (
    <div className="rung" data-state={state_}>
      <div className="rung__n mono">{step.rank}</div>
      <div className="rung__body">
        <div className="rung__head">
          <span className="rung__title">{step.title}</span>
          <Badge tone={LAYER_TONE[step.layer]} mono>
            {step.layer}
          </Badge>
          {step.powerW > 0 && (
            <Badge tone="warn" mono>
              {fx(step.powerW, 0)} W
            </Badge>
          )}
        </div>
        <div className="rung__action">{step.action}</div>
        <code className="rung__test">{step.test}</code>
        <div className="rung__verdict">
          {step.active ? <CircleCheck size={11} /> : <CircleSlash size={11} />}
          {step.verdict}
        </div>
      </div>
      <ChevronRight size={13} className="rung__arrow" />
    </div>
  )
}

const LAYER_TONE: Record<string, 'ok' | 'info' | 'violet'> = {
  ROOT: 'ok',
  TRUNK: 'info',
  BRANCH: 'violet',
}

function KVFooter({ trace }: { trace: LadderTrace }) {
  return (
    <div className="rung-foot">
      <div>
        <span className="mlabel">ACTIVE RUNG</span>
        <b className="mono">{trace.activeId}</b>
      </div>
      <div>
        <span className="mlabel">POWER</span>
        <b className="mono tnum">{fx(trace.powerW, 2)} W</b>
      </div>
      <div>
        <span className="mlabel">SOFTWARE IN PATH</span>
        <b className="mono">{trace.passive ? 'NO' : 'YES'}</b>
      </div>
    </div>
  )
}

function Forbid({ title, body }: { title: string; body: string }) {
  return (
    <div className="forbid">
      <Ban size={12} />
      <div>
        <div className="forbid__t">{title}</div>
        <div className="forbid__b">{body}</div>
      </div>
    </div>
  )
}
