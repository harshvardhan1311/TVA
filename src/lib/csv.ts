/* ============================================================================
   TVA — CSV EXPORT
   ----------------------------------------------------------------------------
   The dashboard's only export path. The schema is documented in the panel that
   offers the button, because an exported telemetry file that nobody can
   interpret three months later is not a deliverable.
   ========================================================================== */

import type { History } from '../sim/types'

const COLUMNS = [
  'elapsed_s',
  'ambient_c',
  'die_c',
  'pcm_c',
  'battery_c',
  'radiator_c',
  'pcm_liquid_fraction',
  'state_of_charge',
  'solar_w',
  'load_w',
  'density_ratio',
  'hv_margin',
  'reject_w',
] as const

/**
 * Serialise the retained telemetry window.
 *
 * One row per retained sample. `elapsed_s` is simulated mission time, not
 * wall-clock, so a run at 60× and a run at 1× produce comparable files.
 */
export function historyToCsv(history: History, includeHeader = true): string {
  const rows: string[] = []
  if (includeHeader) rows.push(`# TVA telemetry — ${COLUMNS.join(', ')}`)
  rows.push(`# samples=${history.samples.length} capacity=${history.capacity}`)
  if (includeHeader) rows.push(COLUMNS.join(','))

  for (const s of history.samples) {
    rows.push(
      [
        s.t.toFixed(0),
        s.ambientC.toFixed(3),
        s.dieC.toFixed(3),
        s.pcmC.toFixed(3),
        s.batteryC.toFixed(3),
        s.radiatorC.toFixed(3),
        s.bankFraction.toFixed(4),
        s.soc.toFixed(4),
        s.solarW.toFixed(3),
        s.loadW.toFixed(2),
        s.densityRatio.toFixed(5),
        s.hvMargin.toFixed(3),
        s.rejectW.toFixed(3),
      ].join(','),
    )
  }
  return rows.join('\n')
}

/** Trigger a browser download. No-ops silently where the API is unavailable. */
export function downloadCsv(filename: string, text: string): boolean {
  try {
    const blob = new Blob([text], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    // Revoke on the next macrotask so Safari has time to start the transfer.
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    return true
  } catch {
    return false
  }
}

/** Timestamp that is safe in a filename on every platform. */
export function stamp(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
}
