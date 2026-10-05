/* ============================================================================
   TVA — CLAIMS LEDGER
   ----------------------------------------------------------------------------
   Every constant, every design target and every known discrepancy between the
   master report and the preliminary CFD workbench. If a number appears in this
   application, it appears here with its provenance, and if it is a DESIGN value
   it says so.
   ========================================================================== */

import { useState } from 'react'
import { BookOpen, GitCompare, Scale, Search } from 'lucide-react'
import {
  CONSTANT_REGISTRY,
  PROVENANCE_META,
  SCOPE_BOUNDARIES,
  DISCREPANCIES,
} from '../lib/constants'
import type { Provenance } from '../lib/constants'
import { Alert, Badge, Card, ClaimChip, Grid, Stat } from '../components/ui'
import { Grid2, KVList, ProvenanceLegend, statusTone } from './common'
import { fnum } from '../lib/format'
import type { Tone } from '../lib/format'

const PROVENANCE_ORDER: Provenance[] = ['LITERATURE', 'DERIVED', 'DESIGN', 'PLANNED', 'MEASURED']

export default function Ledger() {
  const [filter, setFilter] = useState<Provenance | 'ALL'>('ALL')
  const [query, setQuery] = useState('')

  const rows = CONSTANT_REGISTRY.filter((c) => {
    const byProv = filter === 'ALL' || c.provenance === filter
    const q = query.trim().toLowerCase()
    const byQuery =
      !q ||
      c.id.toLowerCase().includes(q) ||
      c.label.toLowerCase().includes(q) ||
      c.source.toLowerCase().includes(q)
    return byProv && byQuery
  })

  const counts = PROVENANCE_ORDER.map((p) => ({
    p,
    n: CONSTANT_REGISTRY.filter((c) => c.provenance === p).length,
  }))

  return (
    <div className="stack">
      {/* ======================================================== HEADLINE === */}
      <Grid cols={5}>
        <Stat
          label="Constants of record"
          value={CONSTANT_REGISTRY.length}
          tone="accent"
          size="lg"
          icon={BookOpen}
          sub="every one carries a provenance tag"
        />
        {counts.map(({ p, n }) => (
          <Stat
            key={p}
            label={PROVENANCE_META[p].label}
            value={n}
            tone={p === 'MEASURED' ? 'ok' : p === 'DESIGN' ? 'warn' : p === 'PLANNED' ? 'warn' : 'neutral'}
            size="lg"
            sub={PROVENANCE_META[p].blurb}
          />
        ))}
      </Grid>

      {/* =========================================================== FILTERS == */}
      <Card
        title="Constant registry"
        tools={<ClaimChip provenance="LITERATURE" />}
        bodyClass="card__body--tight"
      >
        <div className="lfilt">
          <div className="lfilt__chips">
            <button
              className={`chip ${filter === 'ALL' ? 'is-on' : ''}`}
              onClick={() => setFilter('ALL')}
            >
              ALL ({CONSTANT_REGISTRY.length})
            </button>
            {counts.map(({ p, n }) => (
              <button
                key={p}
                className={`chip ${filter === p ? 'is-on' : ''}`}
                onClick={() => setFilter(p)}
                data-prov={p}
              >
                {PROVENANCE_META[p].label} ({n})
              </button>
            ))}
          </div>
          <label className="lfilt__search">
            <Search size={12} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="search id, label or source"
              spellCheck={false}
            />
          </label>
        </div>

        <div className="ltab">
          <div className="ltab__hdr">
            <span>Id</span>
            <span>Label</span>
            <span>Value</span>
            <span>Provenance</span>
            <span>Source</span>
          </div>
          {rows.map((c) => (
            <div className="ltab__row" key={c.id}>
              <span className="ltab__id mono">{c.id}</span>
              <span className="ltab__l">
                {c.label}
                {c.note && <em>{c.note}</em>}
              </span>
              <span className="ltab__v mono tnum">
                {fnum(c.value, Math.abs(c.value) < 1 ? 4 : 0)} {c.unit}
              </span>
              <span>
                <Badge tone={PROVENANCE_META[c.provenance].tone as Tone} mono>
                  {PROVENANCE_META[c.provenance].label}
                </Badge>
              </span>
              <span className="ltab__s">{c.source}</span>
            </div>
          ))}
          {rows.length === 0 && (
            <div className="empty">
              No constant matches that filter. Clear the search or choose another provenance.
            </div>
          )}
        </div>
      </Card>

      {/* ================================================== DISCREPANCIES ===== */}
      <Card
        title="Discrepancies carried forward, not buried"
        tone="warn"
        tools={<GitCompare size={13} />}
      >
        <p className="prose">
          The preliminary CFD workbench disagrees with the master report on five parameters. TVA
          uses the corrected figures, prints the reasoning, and keeps both values visible so a
          reviewer can audit the choice rather than inherit it.
        </p>
        <div className="row-gap-4" />
        <div className="disc">
          {DISCREPANCIES.map((d) => (
            <div className="disc__row" key={d.id}>
              <div className="disc__param">{d.parameter}</div>
              <div className="disc__pair">
                <div className="disc__side disc__side--pre">
                  <div className="mlabel">PRELIMINARY CFD</div>
                  <div className="disc__v">{d.preliminary}</div>
                </div>
                <div className="disc__arrow">
                  <Scale size={12} />
                </div>
                <div className="disc__side disc__side--adopt">
                  <div className="mlabel">ADOPTED BY TVA</div>
                  <div className="disc__v">{d.adopted}</div>
                </div>
              </div>
              <div className="disc__basis">{d.basis}</div>
            </div>
          ))}
        </div>
      </Card>

      {/* ==================================================== SCOPE + LEGEND == */}
      <Grid2 ratio="k1-1">
        <Card title="Scope boundaries — the claims TVA refuses to make" tone="warn">
          <div className="stack--tight">
            {SCOPE_BOUNDARIES.map((b) => (
              <div className="guard" key={b.id}>
                <Scale size={11} />
                <span>{b.text}</span>
              </div>
            ))}
          </div>
        </Card>

        <div className="stack">
          <Card title="Provenance legend" accent>
            <ProvenanceLegend />
            <div className="row-gap-3" />
            <KVList
              items={PROVENANCE_ORDER.map((p) => ({
                k: PROVENANCE_META[p].label,
                v: PROVENANCE_META[p].blurb,
                tone: (statusTone(p) ?? 'neutral') as Tone,
              }))}
            />
          </Card>

          <Card title="Ledger integrity" tone={CONSTANT_REGISTRY.length > 0 ? 'ok' : 'warn'}>
            <KVList
              items={[
                { k: 'Total constants', v: String(CONSTANT_REGISTRY.length) },
                { k: 'Discrepancies recorded', v: String(DISCREPANCIES.length) },
                { k: 'Scope boundaries', v: String(SCOPE_BOUNDARIES.length) },
                {
                  k: 'Measured values',
                  v: String(CONSTANT_REGISTRY.filter((c) => c.provenance === 'MEASURED').length),
                  tone: 'warn',
                },
                {
                  k: 'Sources without a value',
                  v: String(PROVENANCE_ORDER.filter((p) => counts.find((x) => x.p === p)?.n === 0).length),
                  tone: 'warn',
                },
              ]}
            />
            <div className="row-gap-3" />
            <Alert tone="warn">
              Zero constants carry MEASURED provenance. That is not a bug in the ledger — it is the
              honest state of the programme, and it is why the validation module exists.
            </Alert>
          </Card>
        </div>
      </Grid2>
    </div>
  )
}
