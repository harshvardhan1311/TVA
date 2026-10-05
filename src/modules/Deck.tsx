/* ============================================================================
   TVA — SIH DECK
   ----------------------------------------------------------------------------
   The eleven slides a panel walks through. Each one states the claim, the
   arithmetic, and the provenance — in that order, because a defence audience
   cares about the third least and the audience that funds it cares most.
   ========================================================================== */

import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, Maximize2, TriangleAlert, X } from 'lucide-react'
import { CONSTANTS as K, SCOPE_BOUNDARIES } from '../lib/constants'
import { enduranceBreakdown, ENDURANCE_CASES } from '../lib/battery'
import { FAILURE_MODES } from '../lib/failureModes'
import { PROTOCOLS } from '../lib/validation'
import { SCENARIOS } from '../lib/scenarios'
import { Alert, Badge, Button, Card, ClaimChip, Formula, Grid, Stat } from '../components/ui'
import { useCfg, useLive, KVList, statusTone } from './common'
import { fClock, fdegC, fnum, fWhFromJ, fx, fxMult, pct } from '../lib/format'

type Slide = {
  id: string
  kicker: string
  title: string
  claim: string
  provenance: 'LITERATURE' | 'DERIVED' | 'DESIGN' | 'PLANNED'
  body: (s: ReturnType<typeof useLive>, c: ReturnType<typeof useCfg>) => React.ReactNode
}

const SLIDES: Slide[] = [
  {
    id: 'problem',
    kicker: '01 — Problem',
    title: 'Thin air kills two ways at once',
    claim:
      'At Chang La, 5,364 m, equipment overheats because the air cannot carry heat away, while the battery dies because the same air cannot be charged into. Both failures have the same root cause and the same fix: keep the air out of the argument.',
    provenance: 'LITERATURE',
    body: (s, c) => (
      <Grid cols={3}>
        <Stat
          label="Convection carried away"
          value={pct(s.atmosphere.densityRatio)}
          tone="crit"
          size="lg"
          sub="forced convection at fixed rpm"
        />
        <Stat
          label="Capacity factor at ambient"
          value={fxMult(s.battery.capacityFactor, 3)}
          tone={s.battery.capacityFactor < 0.8 ? 'crit' : 'ok'}
          size="lg"
          sub={`pack at ${fdegC(c.ambientC)} °C`}
        />
        <Stat
          label="Conductor risk"
          value={fx(s.hv.margin, 2)}
          unit="×"
          tone={s.hv.margin >= 1.5 ? 'ok' : 'warn'}
          size="lg"
          sub={`Paschen margin at ${fnum(c.railVoltageV, 0)} V`}
        />
      </Grid>
    ),
  },
  {
    id: 'vriksh',
    kicker: '02 — Architecture',
    title: 'Vriksh: three layers, independent lifelines',
    claim:
      'Passive protections that need no power are separated from the trunk that budgets it, and from the branches that spend it. Deleting any layer degrades the design; it never silently inverts it.',
    provenance: 'DESIGN',
    body: (s) => (
      <div className="grid grid--3">
        {[
          {
            n: 'ROOTS',
            t: 'Passive, powerless',
            d: `Aerogel 20 mm at k = ${K.aerogel_k} W/m·K · ${fWhFromJ(c2(s) * K.pcm_latent, 0)} of PCM latent hold · wax gate · hardware charge lock`,
            tone: 'ok',
          },
          {
            n: 'TRUNK',
            t: 'One shared budget',
            d: `STM32 at < ${K.p_controller} W design target · BMP390 + SHT40 · deterministic 7-way priority allocator`,
            tone: 'info',
          },
          {
            n: 'BRANCHES',
            t: 'Active, allocated',
            d: 'Density-compensated Smart Cooling · 20 W film warmer · Spark Guard above 300 V · Life Guard at zero watts',
            tone: 'violet',
          },
        ].map((l) => (
          <div className="layer" data-tone={l.tone} key={l.n}>
            <div className="layer__head">
              <span className="layer__name">{l.n}</span>
              <span className="layer__sub">{l.t}</span>
            </div>
            <p className="law__note" style={{ marginTop: 'var(--s-2)' }}>
              {l.d}
            </p>
          </div>
        ))}
      </div>
    ),
  },
  {
    id: 'derating',
    kicker: '03 — Derating',
    title: 'The cubic fan law is the whole altitude tax',
    claim:
      'Restoring sea-level mass flow needs 1/ρ_rel in speed, and speed enters power cubed, so the tax is 1/ρ_rel². At 5,000 m that is 2.78×.',
    provenance: 'DERIVED',
    body: (s) => (
      <>
        <Grid cols={4}>
          <Stat label="Density ratio" value={fx(s.atmosphere.densityRatio, 4)} tone="accent" size="lg" />
          <Stat label="Convection" value={fxMult(s.factors.forcedConvection, 3)} size="lg" tone="warn" />
          <Stat label="Fan speed" value={fxMult(s.factors.fanSpeed)} size="lg" tone="info" />
          <Stat label="Fan power" value={fxMult(s.factors.fanPower)} size="lg" tone="crit" />
        </Grid>
        <div className="row-gap-3" />
        <Formula>
          ṁ = ρ·V̇ &nbsp;→&nbsp; N = N₀/ρ_rel = {fxMult(s.factors.fanSpeed)} &nbsp;|&nbsp; P = ρN³c =
          1/ρ_rel² = {fxMult(s.factors.fanPower)}
        </Formula>
      </>
    ),
  },
  {
    id: 'wax',
    kicker: '04 — The passive win',
    title: 'The most important rung has no microcontroller in it',
    claim:
      'A wax element opens the radiator path at 40 °C, switching thermal resistance from 100 K/W to 0.8 K/W with no firmware, no sensor and no allocation decision.',
    provenance: 'DESIGN',
    body: (s) => (
      <>
        <Grid cols={3}>
          <Stat
            label="Gate state"
            value={s.thermal.gateOpen ? 'OPEN' : 'SEALED'}
            tone={s.thermal.gateOpen ? 'warn' : 'ok'}
            size="lg"
            sub={`${fx(s.thermal.gateW, 2)} W through the gate`}
          />
          <Stat
            label="Resistance ratio"
            value={fxMult(K.rth_closed / K.rth_open, 0)}
            tone="ok"
            size="lg"
            sub={`${K.rth_closed} → ${K.rth_open} K/W`}
          />
          <Stat
            label="Wax opening"
            value={K.wax_open_c}
            unit="°C"
            tone="info"
            size="lg"
            sub={`±${K.wax_hyst} K hysteresis`}
          />
        </Grid>
        <div className="row-gap-3" />
        <p className="prose">
          If the microcontroller hangs, the gate still opens. That is the whole argument for putting
          the passive layer first in the ladder rather than treating it as a fallback.
        </p>
      </>
    ),
  },
  {
    id: 'thermal',
    kicker: '05 — Thermal store',
    title: 'Latent heat is why the bank beats aluminium',
    claim:
      'A 1.2 kg paraffin bank holds its plateau with a heat capacity an order of magnitude above the die, so the diurnal cycle lands in the flat part of the curve instead of the steep part.',
    provenance: 'LITERATURE',
    body: (s, c) => (
      <>
        <Grid cols={4}>
          <Stat
            label="Bank plateau"
            value={K.pcm_tm}
            unit="°C"
            tone="accent"
            size="lg"
            sub={`±${K.pcm_tm_band} K`}
          />
          <Stat
            label="Latent hold"
            value={fWhFromJ(c.pcm.massKg * K.pcm_latent, 0)}
            tone="ok"
            size="lg"
            sub={`${fnum(c.pcm.massKg, 2)} kg paraffin`}
          />
          <Stat
            label="Liquid now"
            value={pct(s.pcm.liquidFraction)}
            tone={s.pcm.liquidFraction < 0.02 ? 'warn' : 'ok'}
            size="lg"
            sub={`${fnum(s.pcm.hoursRemaining, 1)} h of hold`}
          />
          <Stat
            label="Die"
            value={fdegC(s.thermal.die)}
            unit="°C"
            tone={s.thermal.die > 78 ? 'crit' : 'ok'}
            size="lg"
            sub="soft limit 78 °C"
          />
        </Grid>
        <div className="row-gap-3" />
        <Formula>
          t_night = m·L/P = {fnum(c.pcm.massKg, 2)} × {fnum(K.pcm_latent / 1000, 0)} kJ/kg ÷{' '}
          {fnum(c.loadW, 0)} W = {fnum(s.pcm.hoursRemaining, 1)} h
        </Formula>
      </>
    ),
  },
  {
    id: 'ladders',
    kicker: '06 — Decision logic',
    title: 'Both ladders, ranked and auditable',
    claim:
      'Every rung prints the inequality that gates it and the layer that executes it, so the control logic can be reviewed rather than inferred.',
    provenance: 'DESIGN',
    body: (s) => (
      <Grid cols={2}>
        <Card title="Cold" inset tone={s.coldLadder.activeId === 'heater' ? 'crit' : 'ok'}>
          <KVList
            items={s.coldLadder.steps.map((r) => ({
              k: `${r.rank}. ${r.title}`,
              v: r.active ? 'ACTIVE' : r.eligible ? 'ready' : 'skip',
              tone: r.active ? 'ok' : r.eligible ? 'info' : 'crit',
            }))}
          />
        </Card>
        <Card title="Hot" inset tone={s.hotLadder.activeId === 'throttle' ? 'crit' : 'ok'}>
          <KVList
            items={s.hotLadder.steps.map((r) => ({
              k: `${r.rank}. ${r.title}`,
              v: r.active ? 'ACTIVE' : r.eligible ? 'ready' : 'skip',
              tone: r.active ? 'ok' : r.eligible ? 'info' : 'crit',
            }))}
          />
        </Card>
      </Grid>
    ),
  },
  {
    id: 'lifeguard',
    kicker: '07 — Life Guard',
    title: 'Solder life goes as ΔT to the power of minus 2.65',
    claim:
      'That exponent makes one kelvin of swing reduction worth more than any software feature in the trunk. Life Guard costs no watts because it is arithmetic, not hardware.',
    provenance: 'LITERATURE',
    body: (s, c) => (
      <>
        <Grid cols={4}>
          <Stat label="Protected swing" value={fnum(s.measuredSwingK, 2)} unit="K" tone="ok" size="lg" />
          <Stat label="Unprotected swing" value={fnum(c.unprotectedSwingK, 1)} unit="K" tone="crit" size="lg" />
          <Stat label="Life score" value={fnum(s.life.score, 1)} unit="/100" tone={statusTone(s.life.status) === 'ok' ? 'ok' : 'warn'} size="lg" />
          <Stat label="Published multiplier" value={fxMult(2.1, 1)} tone="ok" size="lg" />
        </Grid>
        <div className="row-gap-3" />
        <Formula>
          N ∝ ΔT^−{K.nl_exponent} → the reduction from {fnum(c.unprotectedSwingK, 0)} K to{' '}
          {fnum(s.measuredSwingK, 2)} K is a{' '}
          {fxMult(Math.pow(c.unprotectedSwingK / Math.max(s.measuredSwingK, 0.5), K.nl_exponent))}{' '}
          acceleration factor
        </Formula>
      </>
    ),
  },
  {
    id: 'sparkguard',
    kicker: '08 — Spark Guard',
    title: 'Scope discipline: 300 V and above, or nothing',
    claim:
      'Below 300 V the dielectric is nowhere near breakdown for any clearance a sealed enclosure can hold, so Spark Guard declares itself out of scope rather than manufacturing a reassuring number.',
    provenance: 'LITERATURE',
    body: (s, c) => (
      <>
        <Grid cols={4}>
          <Stat label="Rail" value={fnum(c.railVoltageV, 0)} unit="V" tone={s.hv.inScope ? 'warn' : 'neutral'} size="lg" />
          <Stat label="Clearance" value={fnum(c.hv.clearanceMm, 2)} unit="mm" size="lg" />
          <Stat label="IEC factor" value={fx(s.hv.iecFactor, 3)} size="lg" tone="info" />
          <Stat label="Margin" value={fx(s.hv.margin, 2)} unit="×" tone={s.hv.margin >= 1.5 ? 'ok' : 'warn'} size="lg" />
        </Grid>
        <div className="row-gap-3" />
        <Badge tone={s.hv.inScope ? 'warn' : 'info'} mono>
          {s.hv.inScope ? 'IN SCOPE — ARMED' : 'OUT OF SCOPE — INTERLOCKED OFF'}
        </Badge>
        <div className="row-gap-2" />
        <p className="prose">{s.hv.action}</p>
      </>
    ),
  },
  {
    id: 'endurance',
    kicker: '09 — Endurance',
    title: 'The claim LOKI will not make',
    claim:
      'Short flight at altitude is aerodynamic. LOKI recovers the battery-capacity share of the shortfall and reports it separately, never blended into a headline endurance figure.',
    provenance: 'LITERATURE',
    body: (s, c) => {
      const primary = ENDURANCE_CASES[1]
      const b = enduranceBreakdown(
        { ...primary, liftFactor: s.atmosphere.densityRatio },
        Math.max(c.ambientC, -40),
      )
      return (
        <>
          <Grid cols={3}>
            <Stat
              label="Aerodynamic loss"
              value={fnum((1 - s.atmosphere.densityRatio) * 100, 1)}
              unit="%"
              tone="crit"
              size="lg"
              sub="LOKI does not touch this"
            />
            <Stat
              label="Baseline endurance"
              value={fnum(b.baselineMin, 0)}
              unit="min"
              tone="neutral"
              size="lg"
              sub={`${primary.label} at sea level`}
            />
            <Stat
              label="Battery minutes recovered"
              value={fnum(b.recoveredMin, 1)}
              unit="min"
              tone="ok"
              size="lg"
              sub={`${fnum(b.liftMin, 0)} → ${fnum(b.lokiMin, 0)} min`}
            />
          </Grid>
          <div className="row-gap-3" />
          {SCOPE_BOUNDARIES.slice(0, 2).map((x) => (
            <div className="guard guard--crit" key={x.id}>
              <TriangleAlert size={11} />
              <span>{x.text}</span>
            </div>
          ))}
        </>
      )
    },
  },
  {
    id: 'register',
    kicker: '10 — Failure register',
    title: 'Eight modes, each scored with the retrofit off',
    claim:
      'Every mode carries a grey bar showing its score without its countermeasure. The gap between the two bars is the value proposition of the programme.',
    provenance: 'DERIVED',
    body: (s) => (
      <div className="grid grid--2">
        {FAILURE_MODES.map((m) => {
          const r = s.failures.find((f) => f.id === m.id)
          if (!r) return null
          return (
            <div className="fm-row" data-tone={statusTone(r.status)} key={m.id}>
              <div className="fm-row__head">
                <span className="fm-row__idx mono">{String(m.index).padStart(2, '0')}</span>
                <span className="fm-row__name">{m.name}</span>
                <Badge tone={statusTone(r.status)} mono>
                  {r.status}
                </Badge>
              </div>
              <div className="fm-row__driver mono">
                −{fnum(r.riskUnprotected - r.risk, 0)} pts vs unprotected ({pct(r.mitigation, 0)})
              </div>
            </div>
          )
        })}
      </div>
    ),
  },
  {
    id: 'validation',
    kicker: '11 — Validation',
    title: 'Four protocols written, none executed',
    claim:
      'This is the honest state of the programme. The protocols are quantified and standards-referenced; the laboratory results do not exist yet, and the deck does not pretend otherwise.',
    provenance: 'PLANNED',
    body: () => (
      <>
        <Grid cols={4}>
          {PROTOCOLS.map((p) => (
            <Stat key={p.id} label={p.code} value={p.status} tone="warn" size="lg" sub={`${p.durationDays} days planned`} />
          ))}
        </Grid>
        <div className="row-gap-3" />
        <Alert tone="warn">
          {fnum(PROTOCOLS.reduce((s, p) => s + p.durationDays, 0), 0)} days of laboratory time remain.
          Everything in this deck is a model output until that time is spent.
        </Alert>
        <div className="row-gap-3" />
        <div className="stack--tight">
          {SCENARIOS.filter((x) => !x.survivable).map((x) => (
            <div className="guard guard--crit" key={x.id}>
              <TriangleAlert size={11} />
              <span>
                <b>{x.name}</b> is not survivable by design: {x.expectation}
              </span>
            </div>
          ))}
        </div>
      </>
    ),
  },
]

/* Small helper so the Vriksh slide can quote the fitted bank without threading
   the whole config through the slide signature. */
function c2(s: ReturnType<typeof useLive>) {
  return s.pcm.latentCapacityJ > 0 ? s.pcm.latentCapacityJ / K.pcm_latent : 1.2
}

export default function Deck() {
  const state = useLive()
  const config = useCfg()
  const [i, setI] = useState(0)
  const [present, setPresent] = useState(false)

  const slide = SLIDES[i]
  const clamp = (cur: number) => Math.max(0, Math.min(SLIDES.length - 1, cur))
  const go = (d: number) => () => setI((cur) => clamp(cur + d))

  /* Presenter keys. Arrows step, Escape leaves the stage. Suppressed while the
     operator is typing, which the tag check mirrors from the app shell. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'PageDown') {
        e.preventDefault()
        setI((cur) => clamp(cur + 1))
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        e.preventDefault()
        setI((cur) => clamp(cur - 1))
      } else if (e.key === 'Escape' && present) {
        setPresent(false)
      } else if (e.key.toLowerCase() === 'p') {
        setPresent((v) => !v)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [present])

  const claim = (
    <>
      <div className="deck__claim">{slide.claim}</div>
      <div className="row-gap-4" />
      <div className="deck__body">{slide.body(state, config)}</div>
    </>
  )

  /* ------------------------------------------------- PRESENTER STAGE ---- */
  if (present) {
    return (
      <div className="stage">
        <div className="stage__bar">
          <span className="stage__bar-l">
            <Badge tone="accent" mono>
              {slide.kicker}
            </Badge>
            <ClaimChip provenance={slide.provenance} />
          </span>
          <span className="stage__bar-r mono">
            {i + 1} / {SLIDES.length}
            <button className="stage__close" onClick={() => setPresent(false)} title="Exit (Esc)">
              <X size={13} />
            </button>
          </span>
        </div>

        <div className="stage__progress">
          <span style={{ width: `${((i + 1) / SLIDES.length) * 100}%` }} />
        </div>

        <div className="stage__slide">
          <h2 className="stage__title">{slide.title}</h2>
          <div className="row-gap-5" />
          {claim}
        </div>

        <div className="stage__foot">
          <span className="mlabel" style={{ margin: 0 }}>
            {fClock(config.clockHours)} · {fnum(config.altitudeM, 0)} m · {fdegC(config.ambientC)} °C
          </span>
          <span className="mlabel" style={{ margin: 0 }}>
            ← → to step · Esc to exit
          </span>
          <span className="mlabel" style={{ margin: 0 }}>
            Project LOKI · Chang La, Ladakh
          </span>
        </div>
      </div>
    )
  }

  return (
    <div className="stack">
      {/* ========================================================== NAV ======= */}
      <div className="decknav">
        <Button icon={ChevronLeft} onClick={go(-1)} disabled={i === 0}>
          Back
        </Button>
        <div className="decknav__strip">
          {SLIDES.map((s, n) => (
            <button
              key={s.id}
              className={`deckdot ${n === i ? 'is-on' : ''}`}
              onClick={() => setI(n)}
              title={`${s.kicker} — ${s.title}`}
            >
              <span className="deckdot__n mono">{String(n + 1).padStart(2, '0')}</span>
              <span className="deckdot__t">{s.title}</span>
            </button>
          ))}
        </div>
        <Button icon={Maximize2} onClick={() => setPresent(true)} title="Presenter mode (P)">
          Present
        </Button>
        <Button icon={ChevronRight} onClick={go(1)} disabled={i === SLIDES.length - 1}>
          Next
        </Button>
      </div>

      {/* ========================================================= SLIDE ====== */}
      <Card
        className="deck"
        title={slide.title}
        tools={
          <>
            <Badge tone="accent" mono>
              {slide.kicker}
            </Badge>
            <ClaimChip provenance={slide.provenance} />
            <Badge tone="neutral" mono>
              {i + 1} / {SLIDES.length}
            </Badge>
          </>
        }
      >
        {claim}
        <div className="row-gap-4" />
        <div className="deck__foot">
          <span className="mlabel" style={{ margin: 0 }}>
            {fClock(config.clockHours)} · {fnum(config.altitudeM, 0)} m ·{' '}
            {fdegC(config.ambientC)} °C
          </span>
          <span className="mlabel" style={{ margin: 0 }}>
            Project LOKI · Chang La, Ladakh
          </span>
        </div>
      </Card>

      <Card title="Speaker notes" inset>
        <p className="prose">
          {i === 0 && 'Open with the physical contradiction, not the technology. The panel should be asking how one environment causes both an overheat and a charging failure before you name a single component.'}
          {i === 1 && 'Name the three layers and immediately say what deleting each one costs. The retrofit-off framing is what separates this from a brochure.'}
          {i === 2 && 'The 2.78× is the number a reviewer will check. Have the three-step derivation ready: mass flow, speed, cubic power.'}
          {i === 3 && 'This is the strongest slide in the deck. Wax opens at 40 °C with no firmware — say it plainly and pause.'}
          {i === 4 && 'Contrast the bank heat capacity with the die capacitance. Latent storage is why the diurnal cycle lands on the flat part of the curve.'}
          {i === 5 && 'Walk the rungs top to bottom. If anyone asks where the software is, the answer is that it comes last on purpose.'}
          {i === 6 && 'Lead with the exponent. ΔT^-2.65 makes the roots layer the cheapest life-extension available by a wide margin.'}
          {i === 7 && 'Volunteering the 300 V boundary builds more credibility than claiming a wider scope would. Offer the scope note before it is asked for.'}
          {i === 8 && 'State the non-claim before anyone asks. An endurance panel that declines to claim aerodynamic recovery is the reason the rest of the claims get believed.'}
          {i === 9 && 'The grey bars are the argument. Point at a large gap, then at a small one, and explain why the small one is the honest weak point.'}
          {i === 10 && 'Close on this slide, not on the technology. Four protocols, zero results, and a schedule that depends on laboratory time is the most credible thing you can say last.'}
        </p>
      </Card>
    </div>
  )
}
