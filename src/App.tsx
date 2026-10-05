/* ============================================================================
   TVA — APPLICATION SHELL
   ----------------------------------------------------------------------------
   Top bar · navigation · page canvas · status rail · operator drawer.

   Everything below the shell reads from one zustand store through one pure
   evaluator, so a figure can never disagree with itself between two modules.
   ========================================================================== */

import { Suspense, lazy, useEffect, useState } from 'react'
import {
  Download,
  Gauge,
  Menu,
  Moon,
  Pause,
  Play,
  RotateCcw,
  Settings2,
  Sun,
  Trash2,
  Zap,
} from 'lucide-react'
import { useHashRoute } from './hooks/useHashRoute'
import { useSimulation } from './hooks/useSimulation'
import { useNow } from './hooks'
import { useTheme } from './hooks/useTheme'
import { useSim, type ModuleId } from './sim/store'
import { MODULE_META, NAV, NAV_GROUPS, RailStatus } from './components/nav'
import { OperatorPanel } from './components/OperatorPanel'
import { TvaMark } from './components/logo'
import { Button } from './components/ui'
import { downloadCsv, historyToCsv, stamp } from './lib/csv'
import { fClock, fDuration, fnum } from './lib/format'
import { getScenario } from './lib/scenarios'

/* Pages are code-split: the initial view only pays for the shell. */
const Overview = lazy(() => import('./modules/Overview'))
const Twin = lazy(() => import('./modules/Twin'))
const Atmosphere = lazy(() => import('./modules/Atmosphere'))
const Architecture = lazy(() => import('./modules/Architecture'))
const Cycle = lazy(() => import('./modules/Cycle'))
const Ladders = lazy(() => import('./modules/Ladders'))
const LifeGuard = lazy(() => import('./modules/LifeGuard'))
const SparkGuard = lazy(() => import('./modules/SparkGuard'))
const Endurance = lazy(() => import('./modules/Endurance'))
const Energy = lazy(() => import('./modules/Energy'))
const Stress = lazy(() => import('./modules/Stress'))
const Scenarios = lazy(() => import('./modules/Scenarios'))
const Validation = lazy(() => import('./modules/Validation'))
const Ledger = lazy(() => import('./modules/Ledger'))
const Deck = lazy(() => import('./modules/Deck'))

const PAGES: Record<ModuleId, React.ComponentType> = {
  overview: Overview,
  twin: Twin,
  atmosphere: Atmosphere,
  architecture: Architecture,
  cycle: Cycle,
  ladder: Ladders,
  lifeguard: LifeGuard,
  sparkguard: SparkGuard,
  endurance: Endurance,
  energy: Energy,
  stress: Stress,
  scenarios: Scenarios,
  validation: Validation,
  ledger: Ledger,
  deck: Deck,
}

const MODULE_IDS = Object.keys(PAGES) as ModuleId[]

export default function App() {
  useSimulation()
  const { theme, toggle } = useTheme()
  const now = useNow(1000)

  const [rawRoute, navigate] = useHashRoute('overview')
  const route = (MODULE_IDS.includes(rawRoute as ModuleId) ? rawRoute : 'overview') as ModuleId

  const state = useSim((s) => s.state)
  const config = useSim((s) => s.config)
  const scenarioId = useSim((s) => s.scenarioId)
  const elapsed = useSim((s) => s.elapsed)
  const samples = useSim((s) => s.history.samples.length)
  const running = config.running
  const toggleRunning = useSim((s) => s.toggleRunning)
  const reset = useSim((s) => s.reset)
  const clearHistory = useSim((s) => s.clearHistory)
  const applyScenario = useSim((s) => s.applyScenario)

  const [navCollapsed, setNavCollapsed] = useState(false)
  const [operatorOpen, setOperatorOpen] = useState(false)

  // A narrow viewport always shows the full navigation when it is opened.
  const narrow = useViewportNarrow()

  useEffect(() => {
    if (narrow) setNavCollapsed(true)
  }, [narrow])

  // Keyboard shortcuts for the two actions a presenter reaches for mid-talk.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      if (e.key === ' ') {
        e.preventDefault()
        toggleRunning()
      } else if (e.key.toLowerCase() === 'o') {
        setOperatorOpen((v) => !v)
      } else if (e.key.toLowerCase() === 'b') {
        setNavCollapsed((v) => !v)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [toggleRunning])

  const meta = MODULE_META[route]
  const Page = PAGES[route]
  const scenario = scenarioId ? getScenario(scenarioId) : undefined

  return (
    <div className="shell" data-nav={navCollapsed ? 'collapsed' : 'open'}>
      {/* ================================================== TOP BAR ====== */}
      <header className="topbar">
        <div className="topbar__brand">
          <button
            className="topbar__nav-toggle"
            onClick={() => setNavCollapsed((v) => !v)}
            title="Toggle navigation (B)"
            aria-label="Toggle navigation"
          >
            <Menu size={14} strokeWidth={2.2} />
          </button>
          <TvaMark />
          <div className="brand__text">
            <span className="brand__name">
              <em>TVA</em> · LOKI
            </span>
            <span className="brand__sub">Thermal Vriksh Architecture</span>
          </div>
        </div>

        <div className="topbar__crumb">
          <b>{meta.title}</b>
          <span>SIH26049 · Chang La · 5 364 m</span>
        </div>

        <div className="topbar__spacer" />

        <div className="readout readout--live" title="Simulated clock of day">
          <span className="readout__k">T</span>
          <span className="readout__v">{fClock(config.clockHours)}</span>
          <span className="readout__k">×{fnum(config.timeScale, 0)}</span>
        </div>
        <div className="readout" title="Mission elapsed, simulated time">
          <span className="readout__k">MET</span>
          <span className="readout__v">{fDuration(elapsed)}</span>
        </div>
        <div className="readout" title="Retained telemetry samples">
          <span className="readout__k">BUF</span>
          <span className="readout__v">{fnum(samples, 0)}</span>
        </div>
        <div className="readout" title="Site clock">
          <span className="readout__v">
            {now.toLocaleTimeString('en-GB', { hour12: false })}
          </span>
        </div>

        <Button
          icon={running ? Pause : Play}
          variant={running ? 'primary' : 'ghost'}
          onClick={toggleRunning}
          title="Run / pause the solver (Space)"
        >
          {running ? 'Running' : 'Paused'}
        </Button>
        <Button
          icon={Download}
          variant="ghost"
          onClick={() =>
            downloadCsv(`tva-telemetry-${stamp()}.csv`, historyToCsv(useSim.getState().history))
          }
          title="Export retained telemetry as CSV"
        />
        <Button
          icon={Trash2}
          variant="ghost"
          onClick={clearHistory}
          title="Clear the telemetry buffer"
        />
        <Button icon={RotateCcw} variant="ghost" onClick={reset} title="Reset to the reference case" />
        <Button
          icon={theme === 'dark' ? Sun : Moon}
          variant="ghost"
          onClick={toggle}
          title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
        />
        <Button
          icon={Settings2}
          variant={operatorOpen ? 'primary' : 'ghost'}
          onClick={() => setOperatorOpen((v) => !v)}
          title="Operator console (O)"
        />
      </header>

      {/* ==================================================== BODY ======= */}
      <div className="shell__body">
        <nav className="nav" aria-label="Modules">
          <div className="nav__scroll">
            {NAV_GROUPS.map((group) => (
              <div className="nav__group" key={group}>
                <div className="nav__group-label mlabel mlabel--accent">{group}</div>
                {NAV.filter((n) => n.group === group).map((n) => {
                  const Icon = n.icon
                  const chip = n.badge?.(state)
                  return (
                    <button
                      key={n.id}
                      className="nav__item"
                      aria-current={route === n.id ? 'page' : undefined}
                      onClick={() => navigate(n.id)}
                      title={n.label}
                    >
                      <Icon size={14} strokeWidth={2} />
                      <span className="nav__item-label">{n.label}</span>
                      {chip && (
                        <span className="nav__badge" data-tone={chip.tone}>
                          {chip.text}
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            ))}
          </div>
          <div className="nav__footer">
            <div className="nav__link">
              <Gauge size={11} />
              {scenario ? scenario.name : 'Custom configuration'}
            </div>
            <button
              className="nav__link"
              onClick={() => applyScenario('changla-night')}
              title="Reload the reference case"
            >
              <Zap size={11} /> Reload reference case
            </button>
          </div>
        </nav>

        <main className="page">
          <div className="page__inner">
            <div className="page__head">
              <div>
                <h1 className="page__title">{meta.title}</h1>
                <p className="page__sub">{meta.subtitle}</p>
              </div>
              <div className="page__actions">
                {scenario && (
                  <span className="badge badge--accent badge--mono">{scenario.id}</span>
                )}
                <span className="badge badge--mono" title="Simulation is model-derived, not measured">
                  MODEL · NOT MEASURED
                </span>
              </div>
            </div>

            <Suspense fallback={<div className="empty">Loading module…</div>}>
              <Page />
            </Suspense>
          </div>
        </main>
      </div>

      {/* ================================================ STATUS BAR ===== */}
      <footer className="statusbar">
        <RailStatus state={state} />
      </footer>

      {/* ============================================ OPERATOR DRAWER ===== */}
      {operatorOpen && <OperatorPanel onClose={() => setOperatorOpen(false)} />}
    </div>
  )
}

/* ---------------------------------------------------------------- HELPERS */

function useViewportNarrow(): boolean {
  const [narrow, setNarrow] = useState(
    () => typeof window !== 'undefined' && window.innerWidth < 1180,
  )
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 1180px)')
    const on = () => setNarrow(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return narrow
}
