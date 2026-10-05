import type { LucideIcon } from 'lucide-react'
import {
  Activity,
  AlertTriangle,
  Archive,
  BatteryCharging,
  FlaskConical,
  Gauge,
  GitBranch,
  Layers,
  LayoutDashboard,
  Moon,
  Presentation,
  Radio,
  Scale,
  ScrollText,
  Boxes,
  Zap,
} from 'lucide-react'
import type { ModuleId } from '../sim/store'
import type { SimState } from '../sim/types'

export interface NavEntry {
  id: ModuleId
  label: string
  icon: LucideIcon
  group: string
  /** Live status chip shown in the nav. */
  badge?: (s: SimState) => { text: string; tone: 'ok' | 'warn' | 'crit' | 'neutral' } | null
}

const severeCount = (s: SimState) => {
  const n = s.failures.filter((f) => f.status === 'SEVERE').length
  return n ? { text: String(n), tone: 'crit' as const } : null
}

const lockState = (s: SimState) =>
  s.battery.chargeAllowed ? null : { text: 'LOCK', tone: 'warn' as const }

const riskState = (s: SimState) => {
  const worst = Math.max(...s.failures.map((f) => f.risk))
  if (worst < 45) return null
  return { text: worst > 72 ? 'HIGH' : 'MED', tone: worst > 72 ? ('crit' as const) : ('warn' as const) }
}

const cycleState = (s: SimState) =>
  s.thermal.gateOpen ? { text: 'GATE', tone: 'warn' as const } : null

export const NAV: ReadonlyArray<NavEntry> = [
  { group: 'Overview', id: 'overview', label: 'Mission Overview', icon: LayoutDashboard },
  { group: 'Overview', id: 'twin', label: 'Live Digital Twin', icon: Activity, badge: riskState },

  { group: 'Physics', id: 'atmosphere', label: 'Atmosphere & Derating', icon: Gauge },
  { group: 'Physics', id: 'architecture', label: 'Vriksh Architecture', icon: Boxes },
  { group: 'Physics', id: 'cycle', label: 'Diurnal Cycle', icon: Moon },

  { group: 'Response', id: 'ladder', label: 'Decision Ladders', icon: GitBranch, badge: cycleState },
  {
    group: 'Response',
    id: 'lifeguard',
    label: 'Life Guard · Fatigue',
    icon: Scale,
  },
  { group: 'Response', id: 'sparkguard', label: 'Spark Guard · Dielectric', icon: Zap },
  { group: 'Response', id: 'endurance', label: 'UAV Endurance', icon: Radio },
  { group: 'Response', id: 'energy', label: 'Trunk Energy Budget', icon: BatteryCharging, badge: lockState },

  { group: 'Assurance', id: 'stress', label: 'Failure Mode Lab', icon: AlertTriangle, badge: severeCount },
  { group: 'Assurance', id: 'scenarios', label: 'Scenario Library', icon: Archive },
  { group: 'Assurance', id: 'validation', label: 'Validation E1–E4', icon: FlaskConical },
  { group: 'Assurance', id: 'ledger', label: 'Claims & Provenance', icon: ScrollText },
  { group: 'Assurance', id: 'deck', label: 'SIH Deck & Script', icon: Presentation },
]

export const NAV_GROUPS = ['Overview', 'Physics', 'Response', 'Assurance']

export const MODULE_META: Record<ModuleId, { title: string; subtitle: string }> = {
  overview: {
    title: 'Mission Overview',
    subtitle:
      'Project LOKI in one screen. The problem, the architecture, the live state of the post, and the honest statement of what has and has not been demonstrated.',
  },
  twin: {
    title: 'Live Digital Twin',
    subtitle:
      'The four-node thermal network solved in real time against the operator environment. Every panel below the viewport is derived from the same state object — there is no separate display path.',
  },
  atmosphere: {
    title: 'Atmosphere & Derating',
    subtitle:
      'ISO 2533 standard atmosphere and the four thin-air laws the entire LOKI thesis rests on. The arithmetic is shown so the panel can check it.',
  },
  architecture: {
    title: 'Vriksh Architecture',
    subtitle:
      'Roots, Trunk and Branches. The Roots layer keeps the equipment safe even if every controller in the kit is destroyed, which is the whole point of the passive layer.',
  },
  cycle: {
    title: 'Diurnal Cycle',
    subtitle:
      'Store the day. Survive the night. A 24-hour sweep comparing the retrofit against the same asset without it, on the same solver.',
  },
  ladder: {
    title: 'Decision Ladders',
    subtitle:
      'The two response ladders from master report §3, evaluated against the live state. Each rung reports the inequality that selected it, not just a diagram.',
  },
  lifeguard: {
    title: 'Life Guard · Thermal Fatigue',
    subtitle:
      'Rainflow cycle counting over the live temperature history, scored with the Norris–Landzberg strain-life model for SAC305.',
  },
  sparkguard: {
    title: 'Spark Guard · Dielectric Safety',
    subtitle:
      'Paschen breakdown, Peek surface enhancement and the IEC 60664-1 altitude correction. Applies only above 300 V, and the module says so.',
  },
  endurance: {
    title: 'UAV Endurance',
    subtitle:
      'The endurance shortfall decomposed into its aerodynamic and electrochemical terms. LOKI is credited only with the second, and the module refuses to blur that line.',
  },
  energy: {
    title: 'Trunk Energy Budget',
    subtitle:
      'One shared power budget, allocated by priority, state of charge and array output. The film heater is funded last, always.',
  },
  stress: {
    title: 'Failure Mode Lab',
    subtitle:
      'The eight failure modes from the problem statement, scored live. Switch the retrofit off to watch the same physics produce a different verdict.',
  },
  scenarios: {
    title: 'Scenario Library',
    subtitle:
      'Fifteen named operating conditions, including the three the design is expected to fail. Those are the ones worth presenting.',
  },
  validation: {
    title: 'Validation Programme',
    subtitle:
      'Protocols E1 to E4 mapped to JSS 55555 and MIL-STD-810H. Every status reads PLANNED, because none of this work has been executed.',
  },
  ledger: {
    title: 'Claims & Provenance',
    subtitle:
      'Every constant in the engine, tagged by where it came from, plus the record of each place the preliminary work disagreed with the master report.',
  },
  deck: {
    title: 'SIH Deck & Script',
    subtitle:
      'Eleven slides with the delivery script attached to each one. Presenter mode hides the application chrome and gives you the keyboard.',
  },
}

/* ----------------------------------------------------------- STATUS RAIL - */

export function RailStatus({ state }: { state: SimState }) {
  const worst = state.failures.reduce((a, f) => (f.risk > a.risk ? f : a), state.failures[0])
  return (
    <>
      <span className="statusbar__seg">
        <span className="led led--accent" />
        TRUNK ONLINE
      </span>
      <span className="statusbar__seg">
        <span className={`led led--${state.battery.chargeAllowed ? 'ok' : 'warn'}`} />
        CHARGE LOCK <b>{state.battery.chargeAllowed ? 'ARMED' : 'ENGAGED'}</b>
      </span>
      <span className="statusbar__seg">
        <span className={`led led--${state.thermal.gateOpen ? 'warn' : 'ok'}`} />
        WAX GATE <b>{state.thermal.gateOpen ? 'OPEN' : 'SEALED'}</b>
      </span>
      <span className="statusbar__seg">
        <span className={`led led--${worst?.status === 'SEVERE' ? 'crit' : worst?.status === 'ELEVATED' ? 'warn' : 'ok'}`} />
        WORST MODE <b>{worst ? worst.id.toUpperCase() : '—'}</b>
      </span>
      <span className="statusbar__spacer" />
      <span className="statusbar__seg">
        <Layers size={10} /> <b>TVA</b> v1.0 · SIH26049
      </span>
    </>
  )
}
