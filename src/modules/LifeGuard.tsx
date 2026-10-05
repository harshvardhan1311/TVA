/* ============================================================================
   TVA — LIFE GUARD
   ----------------------------------------------------------------------------
   Life Guard draws no power because it is not really a device. It is the
   rainflow counting of the assembly's own temperature history, scored against a
   Norris–Landzberg strain-life law for SAC305 solder.

   The interesting part of this module is not the health score. It is the
   sensitivity: solder life goes as ΔT^-2.65, which means a single kelvin is
   worth more than any software feature in the trunk layer.
   ========================================================================== */

import { Activity, BarChart3, Binary, Waves } from 'lucide-react'
import {
  rainflow,
  compareFatigue,
  healthFromHistogram,
  cyclesToFailure,
  DESIGN_CYCLES,
  SAC305,
} from '../lib/fatigue'
import { CONSTANTS as K } from '../lib/constants'
import {
  Alert,
  Badge,
  Card,
  ClaimChip,
  Formula,
  Grid,
  Stat,
} from '../components/ui'
import { BarSeries } from '../components/charts'
import { usePalette } from '../components/palette'
import { useCfg, useLive, useSeries, HistoryNotice, Grid2, KVList, statusTone } from './common'
import { fnum, fx, fxMult, pct } from '../lib/format'

/** Diurnal forcing: one thermal cycle per solar day. */
const DAILY_HZ = 1 / 86400

export default function LifeGuard() {
  const state = useLive()
  const config = useCfg()
  const history = useSeries(4000)
  const p = usePalette()

  const series = history.map((h) => h.dieC)
  const rf = rainflow(series)
  const has = rf.histogram.length > 0 && rf.histogram.some((h) => h.count > 0)

  const swing = state.measuredSwingK
  const life = state.life

  /* The published comparison, run on the present numbers. */
  const cmp = compareFatigue(
    config.unprotectedSwingK,
    Math.max(swing, 0.5),
    Math.max(state.thermal.die, 20),
    Math.max(state.thermal.die, 20),
    DAILY_HZ,
    DAILY_HZ,
  )

  const hist = healthFromHistogram(
    rf.histogram,
    DAILY_HZ,
    Math.max(...series, 20),
  )

  /* What one kelvin of swing reduction is worth, right now. */
  const perKelvin = Math.pow(config.unprotectedSwingK / Math.max(swing, 1), SAC305.n)

  return (
    <div className="stack">
      {/* ======================================================== HEADLINE === */}
      <Grid cols={5}>
        <Stat
          label="Life score"
          value={fnum(life.score, 1)}
          unit="/ 100"
          tone={statusTone(life.status) === 'ok' ? 'ok' : statusTone(life.status) === 'info' ? 'info' : 'warn'}
          size="lg"
          sub={life.status}
          icon={Activity}
        />
        <Stat
          label="Achieved swing"
          value={fnum(swing, 2)}
          unit="K"
          tone="ok"
          size="lg"
          sub={`${pct(life.swingReductionPct, 0)} below the unprotected case`}
          icon={Waves}
        />
        <Stat
          label="Dominant range"
          value={fnum(life.criticalRangeK, 2)}
          unit="K"
          size="lg"
          sub="bin carrying the most damage"
          icon={BarChart3}
        />
        <Stat
          label="Lifetime multiplier"
          value={fxMult(cmp.publishedMultiplier, 1)}
          tone="ok"
          size="lg"
          sub="conservative published claim"
          icon={Binary}
        />
        <Stat
          label="Damage used"
          value={fnum(Math.max(...series, 20) > 0 ? hist.lifeUsedPct : 0, 2)}
          unit="%"
          tone="info"
          size="lg"
          sub={`${fnum(hist.damage, 6)} Miner sum`}
        />
      </Grid>

      {!has && (
        <HistoryNotice>
          Rainflow counting needs turning points. Run the clock until the retained history contains
          at least one full rise-and-fall and the histogram below will populate — until then Life
          Guard reports the projected figure from the diurnal law instead of a measured one.
        </HistoryNotice>
      )}

      {/* ======================================================== RAINFLOW === */}
      <Grid2 ratio="k2-1">
        <Card
          title="Rainflow histogram — die temperature"
          tools={
            <>
              {rf.residual && (
                <Badge tone="info" mono>
                  1 RESIDUAL HALF CYCLE
                </Badge>
              )}
              <ClaimChip provenance="LITERATURE" />
            </>
          }
        >
          {has ? (
            <>
              <BarSeries
                data={rf.histogram.map((h) => ({
                  label: h.rangeK.toFixed(1),
                  count: h.count,
                }))}
                height={210}
                bars={[{ key: 'count', label: 'Full cycles', color: p.ok }]}
                unit="cycles"
              />
              <div className="row-gap-3" />
              <Formula>
                mean range = {fnum(rf.meanK, 2)} K &nbsp;·&nbsp; min {fnum(rf.minK, 2)} K &nbsp;·&nbsp;
                max {fnum(rf.maxK, 2)} K
                <br />
                total counted = {fnum(rf.histogram.reduce((s, h) => s + h.count, 0), 0)} full cycles
                <br />
                critical range = {fnum(hist.criticalRangeK, 2)} K → life remaining{' '}
                {fnum(hist.lifeRemainingPct, 1)} %
              </Formula>
            </>
          ) : (
            <Alert tone="info" icon={BarChart3}>
              No complete cycles in the retained window yet. The rainflow algorithm will not guess at
              a partial cycle — it reports the residual instead.
            </Alert>
          )}
        </Card>

        <Card title="Miner line" tone={hist.lifeRemainingPct > 50 ? 'ok' : 'warn'}>
          <Stat
            label="Life consumed"
            value={has ? fnum(hist.lifeUsedPct, 3) : '0.000'}
            unit="%"
            tone={has && hist.lifeUsedPct > 20 ? 'warn' : 'ok'}
            size="lg"
            sub={`design allowance ${fnum(DESIGN_CYCLES, 0)} diurnal cycles`}
          />
          <div className="row-gap-3" />
          <KVList
            items={[
              { k: 'Equivalent cycles', v: fnum(life.equivalentCycles, 1) },
              { k: 'Miner sum', v: has ? hist.damage.toExponential(3) : '0.000e+0' },
              { k: 'Dominant range', v: `${fnum(hist.criticalRangeK, 2)} K` },
              { k: 'T_max in window', v: `${fnum(Math.max(...series, 0), 2)} °C` },
              { k: 'Design cycles', v: `${fnum(DESIGN_CYCLES, 0)}` },
              { k: 'Cycle frequency', v: `${DAILY_HZ.toExponential(3)} Hz (1 per day)` },
            ]}
          />
        </Card>
      </Grid2>

      {/* =============================================== THE ACCELERATION ==== */}
      <Card
        title="The Norris–Landzberg acceleration factor"
        accent
        tools={<ClaimChip provenance="LITERATURE" />}
      >
        <Grid cols={4}>
          <Stat
            label="ΔT term only"
            value={fxMult(cmp.afDeltaOnly)}
            tone="warn"
            size="lg"
            sub={`(${fnum(config.unprotectedSwingK, 0)} / ${fnum(swing, 2)})^${SAC305.n}`}
          />
          <Stat
            label="Arrhenius T_max term"
            value={fxMult(cmp.afArrhenius)}
            tone="info"
            size="lg"
            sub={`Ea = ${fnum(K.nl_Ea / 1000, 2)} kJ/mol`}
          />
          <Stat
            label="Frequency term"
            value={fxMult(cmp.afFrequency)}
            tone="neutral"
            size="lg"
            sub="identical diurnal period, so this is unity"
          />
          <Stat
            label="Full form"
            value={fxMult(cmp.afFull)}
            tone="crit"
            size="lg"
            sub="ΔT × Arrhenius × frequency"
          />
        </Grid>

        <div className="row-gap-4" />
        <Formula>
          N = N₀ · ΔT^−{SAC305.n} · f^{SAC305.m} · exp(Ea / (k_B·(T_max+273.15)))
          <br />
          ΔT term = ({fnum(config.unprotectedSwingK, 1)} / {fnum(swing, 2)})^−{SAC305.n} ={' '}
          {fxMult(cmp.afDeltaOnly)}
          <br />
          Arrhenius term = exp( {fnum(K.nl_Ea, 0)} / (k_B·{fnum(Math.max(state.thermal.die, 20) + 273.15, 1)}) ) ={' '}
          {fx(cmp.afArrhenius, 4)}
          <br />
          → N_unprotected = {fnum(cmp.nUnprotected, 0)} cycles &nbsp;|&nbsp; N_LOKI ={' '}
          {fnum(cmp.nLoki, 0)} cycles
        </Formula>

        <div className="row-gap-3" />
        <Alert tone="info">
          <b>Sign correction worth stating.</b> The Arrhenius factor as published for this law is
          exp(Ea/(k_B·T)) — it <em>decreases</em> as T rises, because the effective activation
          barrier for solder fatigue falls with temperature. The preliminary CFD workbench carried this
          term with the opposite sign, which inverted the hot-case conclusion. TVA uses the
          physically correct form, and the claims ledger records both.
        </Alert>
      </Card>

      {/* ================================================== KELVIN ECONOMICS = */}
      <Grid cols={3}>
        <Card title="What one kelvin is worth" tone="ok" accent>
          <Stat
            label="Lifetime multiplier at present"
            value={fxMult(perKelvin)}
            tone="ok"
            size="lg"
          />
          <div className="row-gap-2" />
          <p className="prose muted">
            The exponent is {SAC305.n}. Losing two kelvin of swing multiplies solder life by{' '}
            {fx(Math.pow(config.unprotectedSwingK / Math.max(swing - 2, 0.5), SAC305.n), 2)}; gaining
            the same two kelvin back costs the same factor in the other direction. This is why the
            roots layer — aerogel, wax mass, radiator area — buys more life than any amount of
            firmware.
          </p>
          <div className="row-gap-3" />
          <Formula>
            N(ΔT) ∝ ΔT^−{SAC305.n}
            <br />
            N(ΔT−1)/N(ΔT) = (ΔT/(ΔT−1))^{SAC305.n} ={' '}
            {fx(Math.pow(swing / Math.max(swing - 1, 0.1), SAC305.n), 3)}×
          </Formula>
        </Card>

        <Card title="Swing sensitivity" accent>
          {Array.from({ length: 6 }, (_, i) => Math.max(1, Math.round(swing + (i - 2) * 2))).map(
            (dT) => (
              <div className="sens" key={dT}>
                <span className="mlabel">{dT} K swing</span>
                <div className="sens__bar">
                  <div
                    className="sens__fill"
                    style={{
                      width: `${Math.min(100, (cyclesToFailure(dT, DAILY_HZ, state.thermal.die) / cyclesToFailure(1, DAILY_HZ, state.thermal.die)) * 100)}%`,
                    }}
                  />
                </div>
                <span className="mono tnum">
                  {fxMult(cyclesToFailure(dT, DAILY_HZ, state.thermal.die) / cyclesToFailure(config.unprotectedSwingK, DAILY_HZ, state.thermal.die), 2)}
                </span>
              </div>
            ),
          )}
          <div className="row-gap-2" />
          <p className="prose muted">
            Bars are relative to the {fnum(config.unprotectedSwingK, 0)} K unprotected reference. The
            curve is steep enough that a 5 K improvement is worth more than the whole fan system.
          </p>
        </Card>

        <Card title="Model parameters" accent>
          <KVList
            items={[
              { k: 'Alloy', v: 'SAC305 (Sn3Ag0.5Cu0.5)' },
              { k: 'Strain-life exponent n', v: fx(SAC305.n, 3) },
              { k: 'Frequency exponent m', v: fx(SAC305.m, 4) },
              { k: 'Activation energy', v: `${fnum(SAC305.Ea / 1000, 2)} kJ/mol` },
              { k: 'Reference temperature', v: `${fnum(SAC305.Tref, 2)} K` },
              { k: 'Reference cycles', v: fnum(SAC305.cyclesAtReference, 0) },
              { k: 'Counting standard', v: 'ASTM E1049 (simplified)' },
            ]}
          />
          <div className="row-gap-3" />
          <Alert tone="warn">
            The counting method is a simplified ASTM E1049: turning points, then successive
            four-point pairing. It will not resolve sub-cycle reversals inside the retained window,
            so the health score is a lower bound on counted damage rather than a complete census.
          </Alert>
        </Card>
      </Grid>

      {/* ================================================== UNPROTECTED ====== */}
      <Card title="Same day, roots layer removed" tone="crit">
        <Grid cols={2}>
          <div className="side-by-side">
            <div className="sbs__col sbs__col--bad">
              <div className="mlabel">UNPROTECTED</div>
              <div className="sbs__v">{fnum(config.unprotectedSwingK, 1)} K</div>
              <div className="sbs__n">
                N = {fnum(cyclesToFailure(config.unprotectedSwingK, DAILY_HZ, state.thermal.die), 0)} cycles
              </div>
            </div>
            <div className="sbs__col sbs__col--good">
              <div className="mlabel">WITH LOKI ROOTS</div>
              <div className="sbs__v">{fnum(swing, 2)} K</div>
              <div className="sbs__n">
                N = {fnum(cyclesToFailure(Math.max(swing, 0.5), DAILY_HZ, state.thermal.die), 0)} cycles
              </div>
            </div>
          </div>
          <div>
            <Formula>
              ratio = ({fnum(config.unprotectedSwingK, 1)} / {fnum(Math.max(swing, 0.5), 2)})^{SAC305.n}{' '}
              = {fxMult(cmp.afDeltaOnly)}
              <br />
              published conservative claim = {fxMult(cmp.publishedMultiplier, 1)}
            </Formula>
            <div className="row-gap-2" />
            <p className="prose muted">
              The published multiplier is deliberately more conservative than the raw ΔT ratio because
              it also discounts the Arrhenius contribution, which favours the cooler LOKI case only
              weakly. TVA reports both so a reader can choose which claim they are willing to defend.
            </p>
          </div>
        </Grid>
      </Card>
    </div>
  )
}
