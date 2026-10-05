/* ============================================================================
   TVA — VALIDATION PROTOCOLS
   ----------------------------------------------------------------------------
   Four written protocols, none executed. This module exists so that the gap
   between "modelled" and "measured" is visible in the product rather than
   buried in a report. Nothing here may be read as a result.
   ========================================================================== */

import { ClipboardList, FlaskConical, Microscope, Thermometer, Zap } from 'lucide-react'
import { PROTOCOLS, COMPLIANCE_MATRIX, DESIGN_TARGETS } from '../lib/validation'
import type { TestProtocol } from '../lib/validation'
import {
  Alert,
  Badge,
  Card,
  ClaimChip,
  Formula,
  Grid,
  Stat,
} from '../components/ui'
import { useCfg, useLive, Grid2, KVList } from './common'
import { fnum, fx, fxMult } from '../lib/format'
import { CONSTANTS as K } from '../lib/constants'

export default function Validation() {
  const state = useLive()
  const config = useCfg()

  const planned = PROTOCOLS.filter((p) => p.status === 'PLANNED').length
  const notAddressed = COMPLIANCE_MATRIX.filter((r) => r.status === 'NOT ADDRESSED').length

  return (
    <div className="stack">
      {/* ======================================================== HEADLINE === */}
      <Grid cols={4}>
        <Stat
          label="Protocols written"
          value={PROTOCOLS.length}
          tone="accent"
          size="lg"
          icon={ClipboardList}
          sub={`${planned} of ${PROTOCOLS.length} executed`}
        />
        <Stat
          label="Executed"
          value={0}
          tone="warn"
          size="lg"
          sub="no laboratory result exists for any protocol"
          icon={FlaskConical}
        />
        <Stat
          label="Compliance rows open"
          value={COMPLIANCE_MATRIX.length}
          tone="info"
          size="lg"
          sub={`${notAddressed} not addressed by any protocol`}
        />
        <Stat
          label="Design targets open"
          value={DESIGN_TARGETS.length}
          tone="warn"
          size="lg"
          sub="modelled, not bench-verified"
          icon={Microscope}
        />
      </Grid>

      <Alert tone="warn" icon={FlaskConical}>
        Every figure in TVA is produced by a model. The four protocols below are written against
        published standards with quantified acceptance criteria, and <b>none of them has been
        run</b>. Where the model disagrees with the preliminary CFD workbench, both numbers are
        carried in the claims ledger rather than one being quietly dropped.
      </Alert>

      {/* ====================================================== PROTOCOLS ==== */}
      {PROTOCOLS.map((p) => (
        <ProtocolCard key={p.id} p={p} />
      ))}

      {/* ================================================ COMPLIANCE MATRIX == */}
      <Card
        title="Compliance matrix"
        accent
        tools={<ClaimChip provenance="PLANNED" />}
      >
        <div className="cx">
          <div className="cx__hdr">
            <span>Requirement</span>
            <span>Source</span>
            <span>Protocols</span>
            <span>Status</span>
          </div>
          {COMPLIANCE_MATRIX.map((r) => (
            <div className="cx__row" key={r.requirement}>
              <span className="cx__req">{r.requirement}</span>
              <span className="cx__src">{r.source}</span>
              <span className="cx__p mono">
                {r.protocols.length ? r.protocols.join(', ') : '—'}
              </span>
              <span>
                <Badge tone={r.status === 'PLANNED' ? 'warn' : 'crit'} mono>
                  {r.status}
                </Badge>
              </span>
            </div>
          ))}
        </div>
        <div className="row-gap-3" />
        <Formula>
          {COMPLIANCE_MATRIX.filter((r) => r.protocols.length > 0).length} of{' '}
          {COMPLIANCE_MATRIX.length} requirements have a written protocol &nbsp;|&nbsp;{' '}
          {COMPLIANCE_MATRIX.filter((r) => r.protocols.length === 0).length} have no protocol at all
        </Formula>
      </Card>

      {/* ==================================================== DESIGN TARGETS = */}
      <Card
        title="Design targets — modelled, not measured"
        tone="warn"
        tools={<ClaimChip provenance="DESIGN" />}
      >
        <div className="dt">
          {DESIGN_TARGETS.map((t) => (
            <div className="dt__row" key={t.id}>
              <div className="dt__l">{t.label}</div>
              <div className="dt__t mono">{t.target}</div>
              <div className="dt__b">{t.basis}</div>
              <Badge tone="warn" mono>
                {t.status}
              </Badge>
            </div>
          ))}
        </div>
      </Card>

      {/* ============================================== MODEL VS PRELIMINARY = */}
      <Grid2 ratio="k1-1">
        <Card title="Where the model stands against the brief" accent>
          <Grid cols={3}>
            <Stat
              label="Cold survival modelled"
              value={fnum(state.pcm.hoursRemaining, 1)}
              unit="h"
              tone="ok"
              sub="bank hold at present draw"
              icon={Thermometer}
            />
            <Stat
              label="Battery capacity factor"
              value={fxMult(state.battery.capacityFactor, 3)}
              tone={state.battery.capacityFactor < 0.8 ? 'warn' : 'ok'}
              size="lg"
              sub="present, cold-side model"
            />
            <Stat
              label="Dielectric margin"
              value={fx(state.hv.margin, 2)}
              unit="×"
              tone={state.hv.margin >= 1.5 ? 'ok' : 'warn'}
              size="lg"
              sub={`at ${fnum(config.railVoltageV, 0)} V rail`}
              icon={Zap}
            />
          </Grid>
          <div className="row-gap-3" />
          <KVList
            items={[
              { k: 'Operating envelope target', v: '−40 °C to 5,000 m' },
              { k: 'Present ambient', v: `${fnum(config.ambientC, 0)} °C` },
              { k: 'Present altitude', v: `${fnum(config.altitudeM, 0)} m` },
              { k: 'Bank latent capacity', v: `${fnum((config.pcm.massKg * K.pcm_latent) / 3600, 0)} Wh` },
              { k: 'Solder life multiplier', v: `${fxMult(2.1, 1)} (conservative claim)` },
              { k: 'Protocol status', v: 'ALL PLANNED', tone: 'warn' },
            ]}
          />
        </Card>

        <Card title="What each protocol would actually prove" accent>
          <div className="stack--tight">
            <Row
              t="E1 — cold soak and stabilisation"
              b="Would replace the modelled low-temperature capacity curve and the thermal-stabilisation estimate with measured ones. Until then, capacity factor below 0 °C is a literature curve, not data."
            />
            <Row
              t="E2 — low-pressure derating"
              b="Would verify the density, viscosity and Reynolds treatment against a real reduced-pressure run, and confirm the cubic fan law rather than assuming it."
            />
            <Row
              t="E3 — thermal cycling and solder fatigue"
              b="Would replace the projected Miner score with a counted one from real solder thermocouples, and settle the 6.27× versus 8.9× acceleration question."
            />
            <Row
              t="E4 — charge lock and battery warmer"
              b="Would validate the hardware charge lock and the 20 W film warmer, which currently rest on a single published threshold and a design estimate."
            />
          </div>
          <div className="row-gap-3" />
          <Alert tone="info">
            Total planned laboratory time: {fnum(PROTOCOLS.reduce((s, p) => s + p.durationDays, 0), 0)}{' '}
            days. That is the real schedule risk in this programme, and it is not a software problem.
          </Alert>
        </Card>
      </Grid2>
    </div>
  )
}

/* ------------------------------------------------------------- HELPERS ---- */

function ProtocolCard({ p }: { p: TestProtocol }) {
  return (
    <Card
      title={`${p.code} — ${p.title}`}
      tools={
        <>
          <Badge tone="warn" mono>
            {p.status}
          </Badge>
          <Badge tone="neutral" mono>
            {p.durationDays} DAYS
          </Badge>
        </>
      }
    >
      <p className="prose">{p.objective}</p>
      <div className="row-gap-3" />

      <div className="grid grid--2">
        <div>
          <div className="mlabel">STANDARDS</div>
          <div className="row-gap-2" />
          <div className="stack--tight">
            {p.standards.map((s) => (
              <div className="std" key={s.code}>
                <span className="std__c mono">{s.code}</span>
                <span className="std__t">
                  {s.title} <em>— {s.method}</em>
                </span>
              </div>
            ))}
          </div>

          <div className="row-gap-4" />
          <div className="mlabel">APPARATUS</div>
          <div className="row-gap-2" />
          <div className="stack--tight">
            {p.apparatus.map((a) => (
              <div className="app" key={a}>
                {a}
              </div>
            ))}
          </div>

          <div className="row-gap-4" />
          <div className="mlabel">SAMPLING</div>
          <div className="row-gap-2" />
          <p className="prose muted">{p.samples}</p>
        </div>

        <div>
          <div className="mlabel">PROCEDURE</div>
          <div className="row-gap-2" />
          <div className="steps">
            {p.procedure.map((s, i) => (
              <div className="steps__row" key={s.step}>
                <span className="steps__n mono">{i + 1}</span>
                <div className="steps__b">
                  <div className="steps__h">
                    {s.step} <b className="mono">{s.duration}</b>
                  </div>
                  <div className="steps__d">{s.detail}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="row-gap-4" />
      <div className="acc">
        <div className="mlabel">ACCEPTANCE CRITERIA</div>
        <div className="row-gap-2" />
        {p.acceptance.map((a) => (
          <div className="acc__row" key={a.metric}>
            <span className="acc__m">{a.metric}</span>
            <span className="acc__c mono">{a.criterion}</span>
            <span className="acc__r">{a.rationale}</span>
          </div>
        ))}
      </div>

      <div className="row-gap-4" />
      <Grid cols={2}>
        <div className="claimbox claimbox--ok">
          <div className="mlabel">ON PASS, THE TEAM COULD CLAIM</div>
          <div className="row-gap-2" />
          <p className="prose">{p.claims.onPass}</p>
        </div>
        <div className="claimbox claimbox--no">
          <div className="mlabel">EVEN ON PASS, STILL NOT CLAIMED</div>
          <div className="row-gap-2" />
          <p className="prose">{p.claims.stillNotClaimed}</p>
        </div>
      </Grid>
    </Card>
  )
}

function Row({ t, b }: { t: string; b: string }) {
  return (
    <div className="read" data-tone="info">
      <Badge tone="info" mono>
        {t.split(' ')[0]}
      </Badge>
      <span>
        <b style={{ color: 'var(--text)' }}>{t.split('—')[1]?.trim() ?? t}</b> — {b}
      </span>
    </div>
  )
}
