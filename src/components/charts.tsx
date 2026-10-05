import { useMemo } from 'react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { usePalette } from './palette'
import { fClock, fx } from '../lib/format'

/* ------------------------------------------------------------- TOOLTIP -- */

interface TipRow {
  name: string
  value: number
  color: string
  unit?: string
}

function ChartTooltip({
  active,
  payload,
  label,
  unit,
  digits,
}: {
  active?: boolean
  payload?: { name?: string; value?: number; color?: string; dataKey?: string; payload?: Record<string, unknown> }[]
  label?: string | number
  unit?: string
  digits?: number
}) {
  const p = usePalette()
  if (!active || !payload?.length) return null
  const rows: TipRow[] = payload
    .filter((e) => typeof e.value === 'number')
    .map((e) => ({
      name: String(e.name ?? e.dataKey ?? ''),
      value: e.value as number,
      color: e.color ?? p.accent,
      unit,
    }))
  return (
    <div
      style={{
        background: 'var(--bg-deep)',
        border: '1px solid var(--hairline-strong)',
        borderRadius: 'var(--r-sm)',
        padding: '6px 9px',
        fontSize: 11,
        boxShadow: 'var(--shadow-md)',
        minWidth: 150,
      }}
    >
      <div
        style={{
          fontSize: 9.5,
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          color: p.text3,
          fontWeight: 700,
          marginBottom: 4,
        }}
      >
        {label}
      </div>
      {rows.map((r, i) => (
        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
          <span style={{ color: p.text2, display: 'flex', alignItems: 'center', gap: 5 }}>
            <span
              style={{ width: 8, height: 2, background: r.color, borderRadius: 1, flex: '0 0 auto' }}
            />
            {r.name}
          </span>
          <span
            className="mono"
            style={{ color: p.text, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}
          >
            {fx(r.value, digits ?? 1)}
            {r.unit ? ` ${r.unit}` : ''}
          </span>
        </div>
      ))}
    </div>
  )
}

/* ------------------------------------------------------------ CHART SHELL */

function Shell({ children, height = 200 }: { children: React.ReactNode; height?: number }) {
  return (
    <div style={{ width: '100%', height }}>
      <ResponsiveContainer width="100%" height="100%">
        {children as never}
      </ResponsiveContainer>
    </div>
  )
}

function axisProps(p: ReturnType<typeof usePalette>) {
  return {
    stroke: p.text3,
    tick: { fill: p.text3, fontSize: 9.5, fontFamily: 'var(--font-mono)' },
    tickLine: false,
    axisLine: { stroke: p.hairline },
  } as const
}

/* ============================================================ TIME SERIES = */

export interface SeriesDef {
  key: string
  label: string
  color: string
  dashed?: boolean
  /** Format for the tooltip and the y-axis tick. */
  unit?: string
  digits?: number
}

export function TimeSeries({
  data,
  series,
  xKey = 't',
  height = 200,
  xFormat = (v: number) => fx(v, 0),
  yDomain,
  referenceLines = [],
  unit,
}: {
  data: Record<string, unknown>[]
  series: SeriesDef[]
  xKey?: string
  height?: number
  xFormat?: (v: number) => string
  yDomain?: [number | 'auto', number | 'auto']
  referenceLines?: { y?: number; x?: number; label: string; color?: string }[]
  unit?: string
}) {
  const p = usePalette()
  const dom = useMemo(() => yDomain ?? ['auto', 'auto'], [yDomain])

  return (
    <Shell height={height}>
      <LineChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: -14 }}>
        <CartesianGrid stroke={p.grid} vertical={false} />
        <XAxis
          dataKey={xKey}
          {...axisProps(p)}
          tickFormatter={xFormat}
          minTickGap={36}
        />
        <YAxis {...axisProps(p)} domain={dom} width={46} tickFormatter={(v: number) => fx(v, 0)} />
        <Tooltip
          content={<ChartTooltip unit={unit} />}
          cursor={{ stroke: p.accent, strokeWidth: 1, strokeDasharray: '3 3' }}
        />
        {referenceLines.map((r, i) => (
          <ReferenceLine
            key={i}
            y={r.y}
            x={r.x}
            stroke={r.color ?? p.text3}
            strokeDasharray="4 3"
            strokeWidth={1}
            label={{
              value: r.label,
              position: 'insideTopRight',
              fill: r.color ?? p.text3,
              fontSize: 9,
            }}
          />
        ))}
        {series.map((s) => (
          <Line
            key={s.key}
            type="monotone"
            dataKey={s.key}
            name={s.label}
            stroke={s.color}
            strokeWidth={1.6}
            strokeDasharray={s.dashed ? '4 3' : undefined}
            dot={false}
            isAnimationActive={false}
            activeDot={{ r: 2.5, strokeWidth: 0 }}
          />
        ))}
      </LineChart>
    </Shell>
  )
}

/* ============================================================ AREA STACK = */

export function StackedArea({
  data,
  series,
  xKey = 't',
  height = 200,
  xFormat = (v: number) => fx(v, 0),
  unit,
}: {
  data: Record<string, unknown>[]
  series: SeriesDef[]
  xKey?: string
  height?: number
  xFormat?: (v: number) => string
  unit?: string
}) {
  const p = usePalette()
  return (
    <Shell height={height}>
      <AreaChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: -14 }}>
        <CartesianGrid stroke={p.grid} vertical={false} />
        <XAxis dataKey={xKey} {...axisProps(p)} tickFormatter={xFormat} minTickGap={36} />
        <YAxis {...axisProps(p)} width={46} tickFormatter={(v: number) => fx(v, 0)} />
        <Tooltip content={<ChartTooltip unit={unit} />} />
        {series.map((s, i) => (
          <Area
            key={s.key}
            type="monotone"
            dataKey={s.key}
            name={s.label}
            stroke={s.color}
            strokeWidth={1.4}
            fill={s.color}
            fillOpacity={i === 0 ? 0.34 : 0.2}
            isAnimationActive={false}
            stackId="tva"
          />
        ))}
      </AreaChart>
    </Shell>
  )
}

/* ================================================================ BARS == */

export function BarSeries({
  data,
  bars,
  xKey = 'label',
  height = 160,
  unit,
  yDomain,
}: {
  data: Record<string, unknown>[]
  bars: { key: string; label: string; color: string }[]
  xKey?: string
  height?: number
  unit?: string
  yDomain?: [number | 'auto', number | 'auto']
}) {
  const p = usePalette()
  return (
    <Shell height={height}>
      <BarChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: -14 }}>
        <CartesianGrid stroke={p.grid} vertical={false} />
        <XAxis dataKey={xKey} {...axisProps(p)} interval={0} />
        <YAxis
          {...axisProps(p)}
          width={46}
          domain={yDomain ?? ['auto', 'auto']}
          tickFormatter={(v: number) => fx(v, 0)}
        />
        <Tooltip content={<ChartTooltip unit={unit} />} cursor={{ fill: p.grid }} />
        {bars.map((b) => (
          <Bar
            key={b.key}
            dataKey={b.key}
            name={b.label}
            fill={b.color}
            radius={[1, 1, 0, 0]}
            isAnimationActive={false}
          />
        ))}
      </BarChart>
    </Shell>
  )
}

/* ============================================================ SPARKLINE == */

/**
 * Compact trend line. Pure SVG, no axis furniture — for embedding inside a stat
 * tile or table cell.
 */
export function Sparkline({
  values,
  color,
  height = 22,
  fill = true,
  band,
  markers = [],
}: {
  values: number[]
  color: string
  height?: number
  fill?: boolean
  /** Optional [lo, hi] y-window, so series are visually comparable. */
  band?: [number, number]
  markers?: { at: number; color: string }[]
}) {
  if (values.length < 2) {
    return <div style={{ height }} className="muted" />
  }
  const w = 100
  let lo = Math.min(...values)
  let hi = Math.max(...values)
  if (band) {
    lo = band[0]
    hi = band[1]
  }
  if (hi - lo < 1e-9) {
    hi = lo + 1
    lo -= 1
  }
  const pad = 2
  const sx = (i: number) => (i / (values.length - 1)) * w
  const sy = (v: number) => pad + (1 - (v - lo) / (hi - lo)) * (height - 2 * pad)

  const d = values.map((v, i) => `${i === 0 ? 'M' : 'L'}${sx(i).toFixed(2)},${sy(v).toFixed(2)}`).join(' ')
  const area = `${d} L${w},${height} L0,${height} Z`
  const gid = `sg-${color.replace(/[^a-z0-9]/gi, '')}`

  return (
    <svg
      viewBox={`0 0 ${w} ${height}`}
      preserveAspectRatio="none"
      style={{ width: '100%', height, display: 'block' }}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.28} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      {fill && <path d={area} fill={`url(#${gid})`} />}
      <path d={d} fill="none" stroke={color} strokeWidth={1.4} vectorEffect="non-scaling-stroke" />
      {markers.map((m, i) => (
        <line
          key={i}
          x1={sx(m.at)}
          x2={sx(m.at)}
          y1={0}
          y2={height}
          stroke={m.color}
          strokeWidth={1}
          strokeDasharray="2 2"
          vectorEffect="non-scaling-stroke"
        />
      ))}
      <circle cx={sx(values.length - 1)} cy={sy(values[values.length - 1])} r={1.8} fill={color} />
    </svg>
  )
}

/* --------------------------------------------------------- CLOCK FORMAT - */

export const clockFormat = (v: number): string => fClock(v)
