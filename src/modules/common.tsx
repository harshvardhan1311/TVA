/* ============================================================================
   TVA — SHARED MODULE FURNITURE
   ----------------------------------------------------------------------------
   Small pieces every page needs: store access, the retained-history hook, the
   empty state, and a couple of composites that would otherwise be copy-pasted
   fifteen times.
   ========================================================================== */

import { useMemo } from 'react'
import type { ReactNode } from 'react'
import { Activity } from 'lucide-react'
import { useSim } from '../sim/store'
import type { HistorySample, SimConfig, SimState } from '../sim/types'
import { Alert, Badge, ClaimChip, Card, KV, Meter, Stat } from '../components/ui'
import type { Tone } from '../lib/format'
import { clamp } from '../lib/format'
import type { Provenance } from '../lib/constants'

/* ------------------------------------------------------------- STORE ----- */

export function useLive(): SimState {
  return useSim((s) => s.state)
}

export function useCfg(): SimConfig {
  return useSim((s) => s.config)
}

export function useElapsed(): number {
  return useSim((s) => s.elapsed)
}

export const useSetConfig = () => useSim((s) => s.setConfig)

/* ----------------------------------------------------------- HISTORY ----- */

/** The retained telemetry window as a plain array, oldest first. */
export function useSeries(n?: number): HistorySample[] {
  const samples = useSim((s) => s.history.samples)
  const tick = useSim((s) => s.tick)
  return useMemo(() => {
    void tick // re-derive whenever the buffer has advanced
    return n ? samples.slice(Math.max(0, samples.length - n)) : samples
  }, [samples, n, tick])
}

/** Elapsed seconds as a chart x-axis key, in hours for readability. */
export function toHours(t: number): number {
  return t / 3600
}

export function fromHours(h: number): number {
  return h * 3600
}

export const EMPTY =
  'No telemetry retained yet. Run the solver — the buffer fills every 30 simulated seconds.'

export function useHasHistory(): boolean {
  return useSim((s) => s.history.samples.length) > 2
}

/* ------------------------------------------------------------- TONES ----- */

export function statusTone(status: string): Tone {
  switch (status) {
    case 'MITIGATED':
    case 'SAFE':
    case 'NOMINAL':
    case 'OK':
      return 'ok'
    case 'CONTROLLED':
    case 'MARGINAL':
    case 'DEGRADED':
      return 'info'
    case 'ELEVATED':
    case 'AT_RISK':
    case 'CORONA':
    case 'MARGINAL_LIFE':
      return 'warn'
    case 'SEVERE':
    case 'ARCING':
    case 'CRITICAL':
      return 'crit'
    default:
      return 'neutral'
  }
}

/* -------------------------------------------------------- COMPOSITES ----- */

/**
 * A scalar with its governing threshold made explicit. Used wherever a bare
 * number would be meaningless on its own — which is most of the panels.
 */
export function ThresholdStat({
  label,
  value,
  unit,
  digits = 1,
  low,
  high,
  lowTone = 'ok',
  highTone = 'crit',
  lowLabel,
  highLabel,
  sub,
  provenance,
}: {
  label: string
  value: number
  unit?: string
  digits?: number
  low?: number
  high?: number
  lowTone?: Tone
  highTone?: Tone
  lowLabel?: string
  highLabel?: string
  sub?: ReactNode
  provenance?: Provenance
}) {
  const tone: Tone =
    high !== undefined && value >= high
      ? highTone
      : low !== undefined && value <= low
        ? lowTone
        : 'accent'
  return (
    <Stat
      label={label}
      value={value.toFixed(digits)}
      unit={unit}
      tone={tone}
      sub={
        sub ?? (
          <>
            {low !== undefined && (
              <span title={lowLabel}>
                ◄ {lowLabel ?? `below ${low}`} {low}
              </span>
            )}
            {low !== undefined && high !== undefined && <span className="muted"> · </span>}
            {high !== undefined && (
              <span title={highLabel}>
                {highLabel ?? `above ${high}`} {high} ►
              </span>
            )}
          </>
        )
      }
      provenance={provenance}
    />
  )
}

/** Labelled bar against a stated maximum. */
export function BarStat({
  label,
  value,
  max,
  unit,
  digits = 1,
  tone,
  provenance,
  marks,
}: {
  label: string
  value: number
  max: number
  unit?: string
  digits?: number
  tone?: Tone
  provenance?: Provenance
  marks?: number[]
}) {
  return (
    <div className="stat" data-tone={tone ?? 'neutral'}>
      <div className="stat__label">
        {label}
        {provenance && <ClaimChip provenance={provenance} />}
      </div>
      <div className="stat__value">
        {value.toFixed(digits)}
        {unit && <span className="stat__unit">{unit}</span>}
      </div>
      <Meter value={value} max={max} tone={tone ?? 'accent'} marks={marks} />
    </div>
  )
}

/** The empty-telemetry notice, used by every chart-bearing panel. */
export function HistoryNotice({ children }: { children?: ReactNode }) {
  return (
    <Alert tone="info" icon={Activity}>
      {children ?? EMPTY}
    </Alert>
  )
}

/** Pair of panels: the claim on the left, the arithmetic on the right. */
export function ClaimAndArithmetic({
  claim,
  claimProvenance = 'DERIVED',
  arithmetic,
  note,
}: {
  claim: ReactNode
  claimProvenance?: Provenance
  arithmetic: ReactNode
  note?: ReactNode
}) {
  return (
    <Grid2>
      <Card title="The claim" tone="info">
        <div className="prose">{claim}</div>
        <div className="row-gap-2" />
        <ClaimChip provenance={claimProvenance} />
      </Card>
      <Card title="How TVA gets there">
        <div className="formula">{arithmetic}</div>
        {note && (
          <>
            <div className="row-gap-2" />
            <div className="prose muted">{note}</div>
          </>
        )}
      </Card>
    </Grid2>
  )
}

/** Two-column layout without importing the whole Grid primitive. */
export function Grid2({
  children,
  ratio,
}: {
  children: ReactNode
  ratio?: 'k1-2' | 'k2-1' | 'k1-1'
}) {
  return <div className={`grid ${ratio ? `grid--${ratio}` : 'grid--2'}`}>{children}</div>
}

/** Definition-list block inside a card body. */
export function KVList({ items }: { items: { k: ReactNode; v: ReactNode; tone?: Tone }[] }) {
  return (
    <div className="stack--tight">
      {items.map((it, i) => (
        <KV key={i} k={it.k} v={it.v} tone={it.tone} />
      ))}
    </div>
  )
}

/** Provenance legend, repeated in the footer of anything with numbers in it. */
export function ProvenanceLegend() {
  return (
    <div className="legend">
      <Badge tone="info" mono>
        LITERATURE
      </Badge>
      <Badge tone="accent" mono>
        DERIVED
      </Badge>
      <Badge tone="warn" mono>
        DESIGN
      </Badge>
      <Badge tone="violet" mono>
        PLANNED
      </Badge>
    </div>
  )
}

/* ------------------------------------------------------------ MATH ------- */

/* `pct` lives in lib/format so panels and libraries format identically. */

/** Map a value onto 0–1 for a meter. */
export function norm(v: number, lo: number, hi: number): number {
  return clamp((v - lo) / (hi - lo), 0, 1)
}
