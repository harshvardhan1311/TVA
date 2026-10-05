/* ============================================================================
   TVA — FAILURE MODE LAB
   ----------------------------------------------------------------------------
   Eight modes, each scored twice: once as built, once with its countermeasure
   deleted. The grey bar behind each coloured bar is the unprotected case, and
   the gap between them is the entire value proposition of LOKI.
   ========================================================================== */

import { useState } from 'react'
import { Beaker, ChevronDown, ShieldCheck, TriangleAlert, Zap } from 'lucide-react'
import { FAILURE_MODES } from '../lib/failureModes'
import type { FailureId } from '../lib/failureModes'
import { Alert, Badge, Button, Card, ClaimChip, Grid, Stat } from '../components/ui'
import { useCfg, useLive, useSetConfig, Grid2, KVList, statusTone } from './common'
import { fnum, fx, pct } from '../lib/format'

export default function Stress() {
  const state = useLive()
  const config = useCfg()
  const setConfig = useSetConfig()
  const [open, setOpen] = useState<FailureId | null>('overheat')

  const toggle = (id: FailureId) => setOpen((cur) => (cur === id ? null : id))

  const severe = state.failures.filter((f) => f.status === 'SEVERE')
  const elevated = state.failures.filter((f) => f.status === 'ELEVATED')
  const meanMiti =
    state.failures.reduce((s, f) => s + f.mitigation, 0) / Math.max(state.failures.length, 1)
  const worstUnprotected = state.failures.reduce((a, b) =>
    b.riskUnprotected > a.riskUnprotected ? b : a,
  )

  return (
    <div className="stack">
      {/* ======================================================== HEADLINE === */}
      <Grid cols={4}>
        <Stat
          label="Modes in register"
          value={8}
          tone="accent"
          icon={Beaker}
          size="lg"
          sub="from the problem statement, not invented"
        />
        <Stat
          label="Mean mitigation"
          value={pct(meanMiti)}
          tone={meanMiti > 0.5 ? 'ok' : 'warn'}
          size="lg"
          sub="risk removed by the retrofit, averaged"
          icon={ShieldCheck}
        />
        <Stat
          label="Elevated or worse"
          value={severe.length + elevated.length}
          unit="/ 8"
          tone={severe.length ? 'crit' : elevated.length ? 'warn' : 'ok'}
          size="lg"
          sub={`${severe.length} severe · ${elevated.length} elevated`}
          icon={TriangleAlert}
        />
        <Stat
          label="Worst unprotected"
          value={worstUnprotected.id.toUpperCase()}
          tone="crit"
          size="lg"
          sub={`${fnum(worstUnprotected.riskUnprotected, 0)}/100 with the retrofit removed`}
          icon={Zap}
        />
      </Grid>

      <Alert tone={severe.length ? 'crit' : elevated.length ? 'warn' : 'ok'} icon={TriangleAlert}>
        {severe.length > 0
          ? `${severe.length} mode${severe.length === 1 ? '' : 's'} in the SEVERE band: ${severe.map((f) => f.id).join(', ')}. The countermeasure is either unfitted, out of scope, or out of authority.`
          : elevated.length > 0
            ? `${elevated.length} mode${elevated.length === 1 ? '' : 's'} ELEVATED: ${elevated.map((f) => f.id).join(', ')}. The countermeasure is engaged but the exposure is still large enough to matter.`
            : 'Every mode is MITIGATED or CONTROLLED at the present configuration. The grey bars show what each score would be with the retrofit removed.'}
      </Alert>

      {/* ==================================================== MASTER TOGGLE = */}
      <Card
        title="Retrofit switch — the only global experiment"
        tone="warn"
        tools={<ClaimChip provenance="DESIGN" />}
      >
        <div className="lab-toggle">
          <div>
            <div className="lab-toggle__t">Disable every LOKI countermeasure at once</div>
            <div className="lab-toggle__b">
              Clears the roots-layer flag and the Spark Guard flag together. Failure modes 02, 04, 05
              and 08 respond immediately; 01, 03, 06 and 07 follow over the next simulated minutes as
              the thermal state runs up to its unprotected equilibrium.
            </div>
          </div>
          <Button
            icon={Beaker}
            variant={config.lokiFitted ? 'primary' : 'danger'}
            onClick={() =>
              setConfig({
                lokiFitted: !config.lokiFitted,
                sparkGuardFitted: config.lokiFitted ? config.sparkGuardFitted : false,
              })
            }
          >
            {config.lokiFitted ? 'Remove LOKI' : 'Restore LOKI'}
          </Button>
        </div>
      </Card>

      {/* ========================================================= REGISTER == */}
      <div className="stack--tight">
        {FAILURE_MODES.map((m) => {
          const reading = state.failures.find((f) => f.id === m.id)
          if (!reading) return null
          const tone = statusTone(reading.status)
          const isOpen = open === m.id
          return (
            <Card
              key={m.id}
              className={`fm fm--${tone}`}
              tone={tone}
              bodyClass="card__body--tight"
            >
              <div className="fm__head" onClick={() => toggle(m.id)}>
                <span className="fm__idx mono">{String(m.index).padStart(2, '0')}</span>
                <div className="fm__title">
                  <div className="fm__name">{m.name}</div>
                  <div className="fm__mech">{m.mechanism}</div>
                </div>
                <Badge tone={tone} mono>
                  {reading.status}
                </Badge>
                <ChevronDown size={14} className={`fm__chev ${isOpen ? 'is-open' : ''}`} />
              </div>

              <div className="fm__bars">
                <Bar
                  label="WITH LOKI"
                  value={reading.risk}
                  tone={tone}
                  ghost={reading.riskUnprotected}
                />
                <Bar label="UNPROTECTED" value={reading.riskUnprotected} tone="ghost" />
              </div>

              <div className="fm__foot">
                <span className="fm__driver mono">
                  {reading.driver}: <b>{fx(reading.driverValue, 2)}</b> {reading.driverUnit}
                </span>
                <span className="fm__miti mono">
                  −{fnum(reading.riskUnprotected - reading.risk, 0)} pts ({pct(reading.mitigation, 0)})
                </span>
              </div>

              {isOpen && (
                <div className="fm__detail">
                  <div className="grid grid--2">
                    <div>
                      <div className="mlabel">COUNTERMEASURE</div>
                      <div className="row-gap-2" />
                      <p className="prose">{m.countermeasure}</p>
                      <div className="row-gap-3" />
                      <KVList
                        items={[
                          { k: 'Layer', v: m.layer },
                          { k: 'Modules', v: m.modules.join(', ') },
                          { k: 'Basis', v: m.basis },
                          { k: 'Provenance', v: m.provenance },
                        ]}
                      />
                    </div>
                    <div>
                      <div className="mlabel">ASSESSMENT</div>
                      <div className="row-gap-2" />
                      <p className="prose">{reading.note}</p>
                      <div className="row-gap-3" />
                      <KVList
                        items={[
                          { k: 'Risk, fitted', v: `${fnum(reading.risk, 1)} / 100`, tone },
                          { k: 'Risk, unfitted', v: `${fnum(reading.riskUnprotected, 1)} / 100`, tone: 'crit' },
                          { k: 'Mitigation', v: pct(reading.mitigation) },
                          {
                            k: 'Mode id',
                            v: m.id,
                          },
                        ]}
                      />
                    </div>
                  </div>
                </div>
              )}
            </Card>
          )
        })}
      </div>

      {/* ============================================== ENVIRONMENTAL INDEX = */}
      <Grid2 ratio="k2-1">
        <Card
          title="Environmental drivers behind the register"
          tools={<ClaimChip provenance="DERIVED" />}
        >
          <Grid cols={3}>
            <Stat
              label="Dew point"
              value={fx(state.environment.dewPointC, 1)}
              unit="°C"
              tone={state.environment.dewPointC > state.thermal.die ? 'crit' : 'info'}
              sub="Magnus–Tetens from operator humidity"
            />
            <Stat
              label="Condensation risk"
              value={state.environment.condensationRisk}
              tone={
                state.environment.condensationRisk === 'CERTAIN'
                  ? 'crit'
                  : state.environment.condensationRisk === 'LIKELY'
                    ? 'warn'
                    : 'ok'
              }
              sub={`surface ${fnum(state.thermal.die, 1)} °C`}
            />
            <Stat
              label="Wind chill"
              value={fx(state.environment.windChillC, 1)}
              unit="°C"
              tone="info"
              sub={`${fnum(config.windMs, 1)} m/s against the outer jacket`}
            />
            <Stat
              label="Absolute humidity"
              value={fx(state.environment.absoluteHumidity, 2)}
              unit="g/m³"
              sub={`${fnum(config.humidity, 0)} % RH`}
            />
            <Stat
              label="UV index proxy"
              value={fx(state.environment.uvIndex, 2)}
              tone={state.environment.uvIndex > 7 ? 'warn' : 'neutral'}
              sub="clear-sky proxy at present elevation"
            />
            <Stat
              label="Darkness"
              value={fx(state.environment.darknessHours, 2)}
              unit="h"
              tone="info"
              sub="effective night length, solar depression included"
            />
          </Grid>
        </Card>

        <Card title="How to read this register">
          <div className="stack--tight">
            <Read
              tone="ok"
              t="MITIGATED"
              b="The countermeasure is fitted, in scope, and has authority. Residual risk is what is left after it acts."
            />
            <Read
              tone="info"
              t="CONTROLLED"
              b="The exposure is real but the countermeasure is deliberately holding it below the failure band — the designer accepted this residual."
            />
            <Read
              tone="warn"
              t="ELEVATED"
              b="The countermeasure is working but the driving exposure has grown past the point where it is comfortable."
            />
            <Read
              tone="crit"
              t="SEVERE"
              b="The countermeasure is absent, out of scope, or saturated. This is the band that reaches the Failure Mode Lab."
            />
          </div>
        </Card>
      </Grid2>
    </div>
  )
}

/* ------------------------------------------------------------- HELPERS ---- */

function Bar({
  label,
  value,
  tone,
  ghost,
}: {
  label: string
  value: number
  tone: string
  ghost?: number
}) {
  const color =
    tone === 'ok'
      ? 'var(--ok)'
      : tone === 'info'
        ? 'var(--info)'
        : tone === 'warn'
          ? 'var(--warn)'
          : tone === 'crit'
            ? 'var(--crit)'
            : 'var(--text-3)'
  return (
    <div className="fmbar">
      <span className="mlabel">{label}</span>
      <div className="fmbar__track">
        {ghost !== undefined && (
          <div className="fmbar__ghost" style={{ width: `${ghost}%` }} />
        )}
        <div className="fmbar__fill" style={{ width: `${value}%`, background: color }} />
      </div>
      <span className="fmbar__v mono tnum">{fnum(value, 0)}</span>
    </div>
  )
}

function Read({ tone, t, b }: { tone: 'ok' | 'info' | 'warn' | 'crit'; t: string; b: string }) {
  return (
    <div className="read" data-tone={tone}>
      <Badge tone={tone} mono>
        {t}
      </Badge>
      <span>{b}</span>
    </div>
  )
}
