import type { CSSProperties, ReactNode } from 'react'
import { useId } from 'react'
import clsx from 'clsx'
import type { LucideIcon } from 'lucide-react'
import { clamp, invLerp, type Tone } from '../lib/format'
import { PROVENANCE_META, type Provenance } from '../lib/constants'

/* ============================================================== CARD ===== */

export function Card({
  title,
  tools,
  children,
  footer,
  tone,
  accent,
  inset,
  className,
  bodyClass,
  headless,
}: {
  title?: ReactNode
  tools?: ReactNode
  children?: ReactNode
  footer?: ReactNode
  tone?: Tone
  accent?: boolean
  inset?: boolean
  className?: string
  bodyClass?: string
  headless?: boolean
}) {
  return (
    <section
      className={clsx(
        'card',
        tone && `card--${tone}`,
        accent && 'card--accent',
        inset && 'card--inset',
        className,
      )}
    >
      {(title || tools) && !headless && (
        <header className="card__head">
          <h3 className="card__title">{title}</h3>
          {tools && <div className="card__tools">{tools}</div>}
        </header>
      )}
      {children !== undefined && (
        <div className={clsx('card__body', bodyClass)}>{children}</div>
      )}
      {footer && <footer className="card__foot">{footer}</footer>}
    </section>
  )
}

/* ============================================================= STAT ===== */

export function Stat({
  label,
  value,
  unit,
  sub,
  tone,
  size,
  icon,
  provenance,
  plain,
}: {
  label: string
  value: ReactNode
  unit?: string
  sub?: ReactNode
  tone?: Tone
  size?: 'sm' | 'lg'
  icon?: LucideIcon
  provenance?: Provenance
  plain?: boolean
}) {
  const Icon = icon
  return (
    <div className={clsx('stat', plain && 'stat--plain')} data-tone={tone ?? 'neutral'}>
      <div className="stat__label">
        {Icon && <Icon size={11} strokeWidth={2.2} />}
        {label}
        {provenance && <ClaimChip provenance={provenance} />}
      </div>
      <div className={clsx('stat__value', size && `stat__value--${size}`)}>
        {value}
        {unit && <span className="stat__unit">{unit}</span>}
      </div>
      {sub && <div className="stat__sub">{sub}</div>}
    </div>
  )
}

/* ============================================================ BADGE ===== */

export function Badge({
  children,
  tone,
  mono,
  title,
}: {
  children: ReactNode
  tone?: Tone
  mono?: boolean
  title?: string
}) {
  return (
    <span
      className={clsx('badge', tone && tone !== 'neutral' && `badge--${tone}`, mono && 'badge--mono')}
      title={title}
    >
      {children}
    </span>
  )
}

/* ======================================================== CLAIM CHIP ==== */

/**
 * Provenance badge. Every derived figure in TVA carries one, so a reader can
 * always tell a published constant from a design target at a glance.
 */
export function ClaimChip({ provenance, compact }: { provenance: Provenance; compact?: boolean }) {
  const meta = PROVENANCE_META[provenance]
  return (
    <span
      className={clsx('claim', `claim--${provenance.toLowerCase()}`)}
      title={`${meta.label} — ${meta.blurb}`}
    >
      {compact ? meta.label.charAt(0) : meta.label}
    </span>
  )
}

/* ============================================================ ALERT ===== */

export function Alert({
  tone = 'info',
  icon: Icon,
  children,
}: {
  tone?: 'ok' | 'warn' | 'crit' | 'info'
  icon?: LucideIcon
  children: ReactNode
}) {
  return (
    <div className={clsx('alert', tone !== 'info' && `alert--${tone}`)}>
      {Icon && <Icon size={13} strokeWidth={2.2} />}
      <div>{children}</div>
    </div>
  )
}

/* =========================================================== CONTROLS === */

export function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
  display,
  hint,
  disabled,
}: {
  label: string
  value: number
  min: number
  max: number
  step?: number
  onChange: (v: number) => void
  display: string
  hint?: string
  disabled?: boolean
}) {
  const fill = clamp(invLerp(min, max, value) * 100, 0, 100)
  return (
    <div className="field">
      <div className="field__head">
        <label className="field__label" title={hint}>
          {label}
        </label>
        <span className="field__value">{display}</span>
      </div>
      <input
        className="slider"
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        aria-label={label}
        style={{ '--fill': `${fill}%` } as CSSProperties}
        onChange={(e) => onChange(parseFloat(e.target.value))}
      />
    </div>
  )
}

export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label?: string
  value: T
  options: { value: T; label: string; icon?: LucideIcon }[]
  onChange: (v: T) => void
}) {
  return (
    <div className="field">
      {label && (
        <div className="field__head">
          <span className="field__label">{label}</span>
        </div>
      )}
      <div className="seg" role="group" aria-label={label}>
        {options.map((o) => {
          const Icon = o.icon
          return (
            <button
              key={o.value}
              className="seg__opt"
              aria-pressed={value === o.value}
              onClick={() => onChange(o.value)}
            >
              {Icon && <Icon size={11} strokeWidth={2.4} />}
              {o.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export function Switch({
  label,
  checked,
  onChange,
  hint,
  disabled,
}: {
  label: string
  checked: boolean
  onChange: (v: boolean) => void
  hint?: string
  disabled?: boolean
}) {
  const id = useId()
  return (
    <label className="switch" title={hint} style={disabled ? { opacity: 0.5 } : undefined}>
      <input
        id={id}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="switch__track" />
      <span className="switch__label">{label}</span>
    </label>
  )
}

export function NumberField({
  label,
  value,
  onChange,
  unit,
  min,
  max,
  step = 1,
}: {
  label: string
  value: number
  onChange: (v: number) => void
  unit?: string
  min?: number
  max?: number
  step?: number
}) {
  return (
    <div className="field">
      <div className="field__head">
        <label className="field__label">{label}</label>
      </div>
      <div className="num-input">
        <input
          type="number"
          value={Number.isFinite(value) ? value : ''}
          min={min}
          max={max}
          step={step}
          onChange={(e) => {
            const v = parseFloat(e.target.value)
            if (Number.isFinite(v)) onChange(clamp(v, min ?? -1e12, max ?? 1e12))
          }}
        />
        {unit && <span>{unit}</span>}
      </div>
    </div>
  )
}

/* ============================================================== METER === */

export function Meter({
  value,
  max = 100,
  tone = 'accent',
  marks = [],
}: {
  value: number
  max?: number
  tone?: Tone
  marks?: number[]
}) {
  const pct = clamp((value / max) * 100, 0, 100)
  const color =
    tone === 'ok'
      ? 'var(--ok)'
      : tone === 'warn'
        ? 'var(--warn)'
        : tone === 'crit'
          ? 'var(--crit)'
          : tone === 'info'
            ? 'var(--info)'
            : tone === 'violet'
              ? 'var(--violet)'
              : 'var(--accent)'
  return (
    <div className="meter">
      <div className="meter__fill" style={{ width: `${pct}%`, background: color }} />
      {marks.map((m, i) => (
        <div
          key={i}
          className="meter__mark"
          style={{ left: `${clamp((m / max) * 100, 0, 100)}%` }}
        />
      ))}
    </div>
  )
}

/* =============================================================== RING === */

export function Ring({
  value,
  max = 100,
  size = 64,
  thickness = 6,
  caption,
  tone = 'accent',
  digits = 0,
}: {
  value: number
  max?: number
  size?: number
  thickness?: number
  caption?: string
  tone?: Tone
  digits?: number
}) {
  const r = (size - thickness) / 2
  const c = 2 * Math.PI * r
  const frac = clamp(value / max, 0, 1)
  const color =
    tone === 'ok'
      ? 'var(--ok)'
      : tone === 'warn'
        ? 'var(--warn)'
        : tone === 'crit'
          ? 'var(--crit)'
          : tone === 'info'
            ? 'var(--info)'
            : tone === 'violet'
              ? 'var(--violet)'
              : 'var(--accent)'
  return (
    <div className="ring" style={{ width: size, height: size }}>
      <svg width={size} height={size} role="img" aria-label={`${value.toFixed(digits)} ${caption ?? ''}`}>
        <circle
          className="ring__track"
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={thickness}
        />
        <circle
          className="ring__val"
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={thickness}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - frac)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <div className="ring__center">
        <span className="ring__num" style={{ fontSize: size * 0.28, color }}>
          {value.toFixed(digits)}
        </span>
        {caption && <span className="ring__cap">{caption}</span>}
      </div>
    </div>
  )
}

/* ================================================================ KV ==== */

export function KV({ k, v, tone }: { k: ReactNode; v: ReactNode; tone?: Tone }) {
  return (
    <div className="kv">
      <span className="kv__k">{k}</span>
      <span className={clsx('kv__v', tone && tone !== 'neutral' && `text-${tone}`)}>{v}</span>
    </div>
  )
}

/* ============================================================ LEGEND === */

export function Legend({ items }: { items: { color: string; label: string; dashed?: boolean }[] }) {
  return (
    <div className="legend">
      {items.map((i) => (
        <span className="legend__item" key={i.label}>
          <span
            className={clsx('legend__swatch', i.dashed && 'legend__swatch--dashed')}
            style={i.dashed ? { color: i.color } : { background: i.color }}
          />
          {i.label}
        </span>
      ))}
    </div>
  )
}

export function Colorbar({
  min,
  mid,
  max,
  title,
}: {
  min: string
  mid: string
  max: string
  title?: string
}) {
  return (
    <div className="colorbar">
      {title && <span className="mlabel">{title}</span>}
      <div className="colorbar__ramp" />
      <div className="colorbar__scale">
        <span>{min}</span>
        <span>{mid}</span>
        <span>{max}</span>
      </div>
    </div>
  )
}

/* =========================================================== FORMULA ==== */

export function Formula({ children }: { children: ReactNode }) {
  return <div className="formula">{children}</div>
}

/* =============================================================== BTN ==== */

export function Button({
  children,
  onClick,
  variant,
  icon: Icon,
  title,
  disabled,
  size,
}: {
  children?: ReactNode
  onClick?: () => void
  variant?: 'primary' | 'ghost' | 'danger'
  icon?: LucideIcon
  title?: string
  disabled?: boolean
  size?: 'icon'
}) {
  return (
    <button
      className={clsx('btn', variant && `btn--${variant}`, size === 'icon' && 'btn--icon')}
      onClick={onClick}
      title={title}
      aria-label={title}
      disabled={disabled}
      type="button"
    >
      {Icon && <Icon size={13} strokeWidth={2.2} />}
      {children}
    </button>
  )
}

/* ============================================================== GRID ==== */

export function Row({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={clsx('row', className)}>{children}</div>
}

export function Stack({
  children,
  tight,
  className,
}: {
  children: ReactNode
  tight?: boolean
  className?: string
}) {
  return <div className={clsx('stack', tight && 'stack--tight', className)}>{children}</div>
}

export function Grid({
  children,
  cols = 2,
  className,
}: {
  children: ReactNode
  cols?: 2 | 3 | 4 | 5 | 6 | 'k2-1' | 'k1-2' | 'k3-2'
  className?: string
}) {
  return <div className={clsx('grid', `grid--${cols}`, className)}>{children}</div>
}

/* ============================================================== PROSE === */

export function Prose({ children }: { children: ReactNode }) {
  return <div className="prose">{children}</div>
}
