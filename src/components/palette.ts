import { useEffect, useState } from 'react'
import { useTheme } from '../hooks/useTheme'
import { hexToRgb, mixHex } from '../lib/format'

export interface Palette {
  text: string
  text2: string
  text3: string
  grid: string
  surface: string
  hairline: string
  accent: string
  ok: string
  warn: string
  crit: string
  info: string
  violet: string
  field: [string, string, string, string, string]
}

const FALLBACK: Palette = {
  text: '#e8effa',
  text2: '#a9bad4',
  text3: '#6d7f9c',
  grid: 'rgba(53,214,238,0.10)',
  surface: '#0b1220',
  hairline: '#1b2942',
  accent: '#35d6ee',
  ok: '#3ddc97',
  warn: '#f7b733',
  crit: '#ff5f5f',
  info: '#6fa8ff',
  violet: '#a78bfa',
  field: ['#1e3a8a', '#0e7490', '#0d9488', '#ca8a04', '#dc2626'],
}

/** Resolve the live design tokens so canvas/SVG work is theme-aware. */
export function usePalette(): Palette {
  const { theme } = useTheme()
  const [palette, setPalette] = useState<Palette>(FALLBACK)

  useEffect(() => {
    const cs = getComputedStyle(document.documentElement)
    const v = (n: string, fb: string) => cs.getPropertyValue(n).trim() || fb
    setPalette({
      text: v('--text', FALLBACK.text),
      text2: v('--text-2', FALLBACK.text2),
      text3: v('--text-3', FALLBACK.text3),
      grid: v('--grid-line', FALLBACK.grid),
      surface: v('--surface-1', FALLBACK.surface),
      hairline: v('--hairline', FALLBACK.hairline),
      accent: v('--accent', FALLBACK.accent),
      ok: v('--ok', FALLBACK.ok),
      warn: v('--warn', FALLBACK.warn),
      crit: v('--crit', FALLBACK.crit),
      info: v('--info', FALLBACK.info),
      violet: v('--violet', FALLBACK.violet),
      field: [
        v('--field-cold', FALLBACK.field[0]),
        v('--field-cool', FALLBACK.field[1]),
        v('--field-mid', FALLBACK.field[2]),
        v('--field-warm', FALLBACK.field[3]),
        v('--field-hot', FALLBACK.field[4]),
      ],
    })
  }, [theme])

  return palette
}

/* --------------------------------------------------------- COLOUR RAMPS - */

/** Sample the 5-stop instrument ramp at t ∈ [0,1] → `rgb()`. */
export function rampAt(stops: [string, string, string, string, string], t: number): string {
  const x = Math.max(0, Math.min(1, t)) * 4
  const i = Math.min(3, Math.floor(x))
  return mixHex(stops[i], stops[i + 1], x - i)
}

/** Sample a list of hex stops. */
export function sampleStops(stops: string[], t: number): string {
  const x = Math.max(0, Math.min(1, t)) * (stops.length - 1)
  const i = Math.min(stops.length - 2, Math.floor(x))
  return mixHex(stops[i], stops[i + 1], x - i)
}

export function withAlpha(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgb(hex)
  return `rgba(${r},${g},${b},${alpha})`
}

/** Colour for a value within a band, as a semantic token. */
export function toneColor(tone: string, p: Palette): string {
  switch (tone) {
    case 'ok':
      return p.ok
    case 'warn':
      return p.warn
    case 'crit':
      return p.crit
    case 'info':
      return p.info
    case 'violet':
      return p.violet
    default:
      return p.accent
  }
}
