/* ============================================================================
   TVA — SCENARIO LIBRARY
   ----------------------------------------------------------------------------
   A design is only as good as the cases it was argued against. Each card states
   what the case is for, what the operator should watch, and — before anything is
   loaded — whether the design is expected to survive it.
   ========================================================================== */

import { CircleAlert, CircleCheck, CircleX, FlaskConical, Play, RotateCcw } from 'lucide-react'
import { SCENARIOS, CATEGORY_META, getScenario } from '../lib/scenarios'
import type { ScenarioCategory } from '../lib/scenarios'
import { useSim } from '../sim/store'
import { Badge, Button, Card, Grid, Stat } from '../components/ui'
import { useCfg, useLive } from './common'
import { fClock, fnum, fx } from '../lib/format'
import type { Tone } from '../lib/format'

const ORDER: ScenarioCategory[] = ['REFERENCE', 'STRESS', 'ADVERSE', 'BENIGN']

export default function Scenarios() {
  const applyScenario = useSim((s) => s.applyScenario)
  const scenarioId = useSim((s) => s.scenarioId)
  const reset = useSim((s) => s.reset)
  const config = useCfg()
  const state = useLive()

  const load = (id: string) => () => applyScenario(id)

  return (
    <div className="stack">
      {/* ======================================================== HEADLINE === */}
      <Grid cols={4}>
        <Stat
          label="Cases in library"
          value={SCENARIOS.length}
          tone="accent"
          icon={FlaskConical}
          size="lg"
          sub={`${SCENARIOS.filter((s) => s.survivable).length} expected survivable`}
        />
        <Stat
          label="Loaded case"
          value={scenarioId ? (getScenario(scenarioId)?.name ?? scenarioId).toUpperCase() : 'NONE'}
          tone={scenarioId ? 'info' : 'neutral'}
          size="lg"
          sub={scenarioId ? 'live configuration comes from this case' : 'live configuration is operator-set'}
        />
        <Stat
          label="Live supply"
          value={fx(state.allocation.supplyW, 1)}
          unit="W"
          tone={state.allocation.regime === 'CRITICAL' ? 'crit' : 'info'}
          sub={`${state.allocation.regime} · die ${fnum(state.thermal.die, 1)} °C`}
        />
        <Stat
          label="Mission clock"
          value={fClock(config.clockHours)}
          sub={`day ${fnum(config.dayOfYear, 0)} · ${fnum(config.altitudeM, 0)} m`}
          size="lg"
        />
      </Grid>

      {/* ======================================================== LIBRARY === */}
      {ORDER.map((cat) => {
        const cases = SCENARIOS.filter((s) => s.category === cat)
        if (!cases.length) return null
        const meta = CATEGORY_META[cat]
        return (
          <Card
            key={cat}
            title={`${meta.label} cases`}
            tone={meta.tone as Tone}
            tools={<Badge tone={meta.tone as Tone} mono>{cases.length}</Badge>}
          >
            <div className="grid grid--2">
              {cases.map((s) => {
                const loaded = scenarioId === s.id
                return (
                  <div className="scn" key={s.id} data-loaded={loaded}>
                    <div className="scn__head">
                      <span className="scn__name">{s.name}</span>
                      {s.survivable ? (
                        <Badge tone="ok" mono>
                          <CircleCheck size={9} /> SURVIVABLE
                        </Badge>
                      ) : (
                        <Badge tone="crit" mono>
                          <CircleX size={9} /> NOT SURVIVABLE
                        </Badge>
                      )}
                    </div>
                    <p className="scn__intent">{s.intent}</p>
                    <div className="scn__watch">
                      <CircleAlert size={11} />
                      <span>{s.expectation}</span>
                    </div>
                    <div className="scn__tags">
                      {s.tags.map((t) => (
                        <span className="tagchip" key={t}>
                          {t}
                        </span>
                      ))}
                    </div>
                    <div className="scn__actions">
                      <Button icon={loaded ? RotateCcw : Play} onClick={load(s.id)}>
                        {loaded ? 'Reload' : 'Load case'}
                      </Button>
                      {loaded && (
                        <Badge tone="accent" mono>
                          ACTIVE
                        </Badge>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </Card>
        )
      })}

      {/* ========================================================== RESET === */}
      <Card title="Return to the reference configuration">
        <div className="scn-reset">
          <div>
            <div className="scn-reset__t">Clears the scenario, the telemetry history and the clock.</div>
            <div className="scn-reset__b">
              The thermal and battery states re-seed at the reference case so the panel never
              inherits a transient from a case it was not designed for.
            </div>
          </div>
          <Button icon={RotateCcw} variant="ghost" onClick={reset}>
            Reset to reference
          </Button>
        </div>
      </Card>
    </div>
  )
}
