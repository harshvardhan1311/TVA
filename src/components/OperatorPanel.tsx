/* ============================================================================
   TVA — OPERATOR PANEL
   ----------------------------------------------------------------------------
   The single place every input lives. It is mounted once in the shell and
   slides over the page canvas, so the operator can change the environment and
   watch any module respond without ever losing their place.
   ========================================================================== */

import {
  BatteryCharging,
  Fan,
  Gauge,
  GaugeCircle,
  Sun,
  SunMoon,
  Thermometer,
  Wind,
  X,
  Zap,
} from 'lucide-react'
import { useSim } from '../sim/store'
import { ASSET_PROFILES } from '../sim/types'
import { ARRAY_SUMMER, ARRAY_WINTER } from '../lib/solar'
import {
  Badge,
  Button,
  Card,
  ClaimChip,
  Segmented,
  Slider,
  Stack,
  Switch,
} from './ui'
import { fClock, fdegC, fnum, fWh, fx } from '../lib/format'
import { getScenario } from '../lib/scenarios'

export function OperatorPanel({ onClose }: { onClose: () => void }) {
  const config = useSim((s) => s.config)
  const state = useSim((s) => s.state)
  const scenarioId = useSim((s) => s.scenarioId)
  const set = useSim((s) => s.setConfig)
  const setHv = useSim((s) => s.setHv)
  const setEnclosure = useSim((s) => s.setEnclosure)
  const setPcm = useSim((s) => s.setPcm)
  const selectAsset = useSim((s) => s.selectAsset)
  const setBattery = useSim((s) => s.setBattery)
  const scenario = scenarioId ? getScenario(scenarioId) : undefined

  return (
    <aside className="operator" role="dialog" aria-label="Operator controls">
      <header className="operator__head">
        <div>
          <div className="operator__title">OPERATOR CONSOLE</div>
          <div className="operator__sub">
            {scenario ? (
              <>
                <Badge tone="accent" mono>
                  {scenario.id}
                </Badge>{' '}
                {scenario.name}
              </>
            ) : (
              <span className="muted">Custom configuration</span>
            )}
          </div>
        </div>
        <Button icon={X} variant="ghost" size="icon" onClick={onClose} title="Close console" />
      </header>

      <div className="operator__scroll">
        {/* ----------------------------------------------------- ASSET ----- */}
        <Card title="Protected asset" tone={config.lokiFitted ? undefined : 'warn'}>
          <Stack tight>
            <Segmented
              value={config.assetId}
              onChange={selectAsset}
              options={ASSET_PROFILES.slice(0, 3).map((a) => ({ value: a.id, label: a.id }))}
            />
            <Segmented
              value={config.assetId}
              onChange={selectAsset}
              options={ASSET_PROFILES.slice(3).map((a) => ({ value: a.id, label: a.id }))}
            />
            <div className="operator__note">
              {ASSET_PROFILES.find((a) => a.id === config.assetId)?.role}
            </div>
            <Slider
              label="Equipment dissipation"
              value={config.loadW}
              min={5}
              max={150}
              step={1}
              onChange={(v) => set({ loadW: v })}
              display={`${fnum(config.loadW, 0)} W`}
            />
          </Stack>
        </Card>

        {/* ------------------------------------------------- ENVIRONMENT ---- */}
        <Card title="Environment" accent>
          <Stack tight>
            <Slider
              label="Altitude"
              value={config.altitudeM}
              min={0}
              max={8000}
              step={10}
              onChange={(v) => set({ altitudeM: v })}
              display={`${fnum(config.altitudeM, 0)} m · ${fnum(state.atmosphere.pressure, 1)} kPa`}
              hint="ISO 2533 standard atmosphere"
            />
            <Slider
              label="Ambient temperature"
              value={config.ambientC}
              min={-50}
              max={20}
              step={0.5}
              onChange={(v) => set({ ambientC: v })}
              display={`${fdegC(config.ambientC)} °C`}
            />
            <Slider
              label="Relative humidity"
              value={config.humidity}
              min={0.02}
              max={1}
              step={0.01}
              onChange={(v) => set({ humidity: v })}
              display={`${fnum(config.humidity * 100, 0)} %`}
            />
            <Slider
              label="Wind speed"
              value={config.windMs}
              min={0}
              max={25}
              step={0.1}
              onChange={(v) => set({ windMs: v })}
              display={`${fnum(config.windMs, 1)} m/s`}
            />
            <Slider
              label="Precipitation"
              value={config.precipMmH}
              min={0}
              max={12}
              step={0.1}
              onChange={(v) => set({ precipMmH: v })}
              display={`${fnum(config.precipMmH, 1)} mm/h`}
              hint="Drives rime-ice accretion on antennas"
            />
            <Slider
              label="Dust loading"
              value={config.dustMgM3}
              min={0}
              max={60}
              step={1}
              onChange={(v) => set({ dustMgM3: v })}
              display={`${fnum(config.dustMgM3, 0)} mg/m³`}
            />
            <div className="hr hr--dash" />
            <Slider
              label="Clock of day"
              value={config.clockHours}
              min={0}
              max={23.99}
              step={0.01}
              onChange={(v) => set({ clockHours: v })}
              display={fClock(config.clockHours)}
            />
            <Segmented
              label="Day of year"
              value={config.dayOfYear > 180 ? 'summer' : 'winter'}
              onChange={(v) =>
                set({
                  dayOfYear: v === 'winter' ? 355 : 172,
                  solarTilt: v === 'winter' ? ARRAY_WINTER.tilt : ARRAY_SUMMER.tilt,
                  solarArrayAreaM2: v === 'winter' ? ARRAY_WINTER.area : ARRAY_SUMMER.area,
                  solarEfficiency: v === 'winter' ? ARRAY_WINTER.efficiency : ARRAY_SUMMER.efficiency,
                  solarDerate: v === 'winter' ? ARRAY_WINTER.derate : ARRAY_SUMMER.derate,
                })
              }
              options={[
                { value: 'winter', label: 'Winter', icon: SunMoon },
                { value: 'summer', label: 'Summer', icon: Sun },
              ]}
            />
            <div className="hr hr--dash" />
            <Segmented
              label="Time compression"
              value={String(config.timeScale)}
              onChange={(v) => set({ timeScale: Number(v) })}
              options={[
                { value: '1', label: '1×' },
                { value: '60', label: '60×' },
                { value: '600', label: '600×' },
                { value: '3600', label: '3600×' },
              ]}
            />
          </Stack>
        </Card>

        {/* ------------------------------------------------------ ROOTS ----- */}
        <Card title="Layer 1 · Roots" tone={config.lokiFitted ? 'ok' : 'warn'}>
          <Stack tight>
            <Switch
              label="LOKI retrofit fitted"
              checked={config.lokiFitted}
              onChange={(v) => set({ lokiFitted: v })}
              hint="Turn the whole retrofit off to see the unprotected baseline"
            />
            <Switch
              label="Spark Guard fitted"
              checked={config.sparkGuardFitted}
              onChange={(v) => set({ sparkGuardFitted: v })}
              disabled={config.railVoltageV < 300}
              hint={
                config.railVoltageV < 300
                  ? 'Rail is below the 300 V scope floor — module not applicable'
                  : 'Detects micro-discharge and reduces the rail'
              }
            />
            <div className="hr hr--dash" />
            <Slider
              label="Jacket thickness"
              value={config.enclosure.insulationT * 1000}
              min={8}
              max={50}
              step={1}
              onChange={(v) => setEnclosure({ insulationT: v / 1000 })}
              display={`${fnum(config.enclosure.insulationT * 1000, 0)} mm`}
            />
            <Slider
              label="Aerogel conductivity"
              value={config.enclosure.insulationK * 1000}
              min={15}
              max={25}
              step={0.5}
              onChange={(v) => setEnclosure({ insulationK: v / 1000 })}
              display={`${fnum(config.enclosure.insulationK * 1000, 1)} mW/m·K`}
            />
            <Slider
              label="Cavity volume"
              value={config.enclosure.volumeL}
              min={2}
              max={60}
              step={1}
              onChange={(v) => setEnclosure({ volumeL: v })}
              display={`${fnum(config.enclosure.volumeL, 0)} L`}
            />
            <Slider
              label="Radiator area"
              value={config.radiatorAreaM2}
              min={0.05}
              max={1.2}
              step={0.01}
              onChange={(v) => set({ radiatorAreaM2: v })}
              display={`${fx(config.radiatorAreaM2, 2)} m²`}
            />
            <Slider
              label="Port / leak area"
              value={config.portAreaM2 * 1e6}
              min={100}
              max={12000}
              step={50}
              onChange={(v) => set({ portAreaM2: v / 1e6 })}
              display={`${fnum(config.portAreaM2 * 1e6, 0)} mm²`}
              hint="Open area for natural convection out of the cavity"
            />
            <div className="hr hr--dash" />
            <Slider
              label="Heat bank mass"
              value={config.pcm.massKg * 1000}
              min={200}
              max={4000}
              step={50}
              onChange={(v) => setPcm({ massKg: v / 1000 })}
              display={`${fnum(config.pcm.massKg * 1000, 0)} g`}
            />
            <Slider
              label="Melting point"
              value={config.pcm.tmC}
              min={-5}
              max={45}
              step={0.5}
              onChange={(v) => setPcm({ tmC: v })}
              display={`${fdegC(config.pcm.tmC)} °C`}
            />
            <Slider
              label="Latent heat"
              value={config.pcm.latentJJkg / 1000}
              min={80}
              max={260}
              step={1}
              onChange={(v) => setPcm({ latentJJkg: v * 1000 })}
              display={`${fnum(config.pcm.latentJJkg / 1000, 0)} kJ/kg`}
            />
            <div className="operator__derived">
              <span>Bank capacity</span>
              <b className="mono">{fWh((config.pcm.massKg * config.pcm.latentJJkg) / 3600, 1)}</b>
              <span>Latent hold @ 5 W</span>
              <b className="mono">
                {fnum((config.pcm.massKg * config.pcm.latentJJkg) / 5 / 3600, 1)} h
              </b>
            </div>
          </Stack>
        </Card>

        {/* ------------------------------------------------------ TRUNK ----- */}
        <Card title="Layer 2 · Trunk">
          <Stack tight>
            <Switch
              label="Solar array"
              checked={config.solarEnabled}
              onChange={(v) => set({ solarEnabled: v })}
            />
            <Segmented
              label="Fan strategy"
              value={config.fanMode}
              onChange={(v) => set({ fanMode: v })}
              options={[
                { value: 'density-compensated', label: 'Compensated', icon: GaugeCircle },
                { value: 'fixed-sea-level', label: 'Fixed rpm', icon: Fan },
              ]}
            />
            <Slider
              label="Panel tilt"
              value={config.solarTilt}
              min={0}
              max={90}
              step={1}
              onChange={(v) => set({ solarTilt: v })}
              display={`${fnum(config.solarTilt, 0)}°`}
            />
            <Slider
              label="Array area"
              value={config.solarArrayAreaM2}
              min={0.05}
              max={1.5}
              step={0.01}
              onChange={(v) => set({ solarArrayAreaM2: v })}
              display={`${fx(config.solarArrayAreaM2, 2)} m²`}
            />
            <Slider
              label="System derate"
              value={config.solarDerate * 100}
              min={40}
              max={95}
              step={1}
              onChange={(v) => set({ solarDerate: v / 100 })}
              display={`${fnum(config.solarDerate * 100, 0)} %`}
              hint="Wiring, mismatch, soiling, low-light and temperature"
            />
            <Slider
              label="Fan design shaft power"
              value={config.fanDesignShaftW}
              min={1}
              max={40}
              step={0.5}
              onChange={(v) => set({ fanDesignShaftW: v })}
              display={`${fnum(config.fanDesignShaftW, 1)} W`}
            />
          </Stack>
        </Card>

        {/* ---------------------------------------------------- BRANCHES ---- */}
        <Card title="Layer 3 · Branches">
          <Stack tight>
            <Slider
              label="Film heater maximum"
              value={config.heaterMaxW}
              min={0}
              max={40}
              step={0.5}
              onChange={(v) => set({ heaterMaxW: v })}
              display={`${fnum(config.heaterMaxW, 1)} W`}
            />
            <Switch
              label="Processor throttling"
              checked={config.throttleEnabled}
              onChange={(v) => set({ throttleEnabled: v })}
              hint="Last rung of the hot ladder"
            />
            <Slider
              label="Throttle threshold"
              value={config.throttleThresholdC}
              min={55}
              max={95}
              step={1}
              onChange={(v) => set({ throttleThresholdC: v })}
              display={`${fnum(config.throttleThresholdC, 0)} °C`}
            />
            <div className="hr hr--dash" />
            <Slider
              label="Protected internal swing"
              value={config.protectedSwingK}
              min={2}
              max={60}
              step={1}
              onChange={(v) => set({ protectedSwingK: v })}
              display={`${fnum(config.protectedSwingK, 0)} K`}
            />
            <Slider
              label="Unprotected internal swing"
              value={config.unprotectedSwingK}
              min={10}
              max={110}
              step={1}
              onChange={(v) => set({ unprotectedSwingK: v })}
              display={`${fnum(config.unprotectedSwingK, 0)} K`}
            />
          </Stack>
        </Card>

        {/* ---------------------------------------------------- SPARK GUARD - */}
        <Card
          title="Spark Guard · clearance design"
          tone={state.hv.inScope ? undefined : 'warn'}
          footer={
            state.hv.inScope ? undefined : (
              <span className="muted">
                Rail is below the 300 V scope floor. Figures shown for reference only.
              </span>
            )
          }
        >
          <Stack tight>
            <Slider
              label="Rail voltage"
              value={config.hv.railVoltageV}
              min={0}
              max={5000}
              step={10}
              onChange={(v) => setHv({ railVoltageV: v })}
              display={`${fnum(config.hv.railVoltageV, 0)} V`}
            />
            <Switch
              label="IEC 60664-1 correction applied"
              checked={config.hv.clearanceCorrected}
              onChange={(v) => setHv({ clearanceCorrected: v })}
            />
            <Slider
              label="Installed clearance"
              value={config.hv.clearanceMm}
              min={0.5}
              max={60}
              step={0.5}
              onChange={(v) => setHv({ clearanceMm: v })}
              display={`${fx(config.hv.clearanceMm, 1)} mm`}
            />
            <Slider
              label="Conductor radius"
              value={config.hv.conductorRadiusMm}
              min={0.2}
              max={15}
              step={0.1}
              onChange={(v) => setHv({ conductorRadiusMm: v })}
              display={`${fx(config.hv.conductorRadiusMm, 1)} mm`}
            />
            <Slider
              label="Standoff to return"
              value={config.hv.standoffMm}
              min={2}
              max={80}
              step={1}
              onChange={(v) => setHv({ standoffMm: v })}
              display={`${fnum(config.hv.standoffMm, 0)} mm`}
            />
            <Slider
              label="Sealed compartment pressure"
              value={config.hv.sealedPressureKpa}
              min={0}
              max={120}
              step={1}
              onChange={(v) => setHv({ sealedPressureKpa: v })}
              display={config.hv.sealedPressureKpa > 0 ? `${fnum(config.hv.sealedPressureKpa, 0)} kPa` : 'unsealed'}
            />
          </Stack>
        </Card>

        {/* ------------------------------------------------------- BATTERY -- */}
        <Card title="Battery specification">
          <Stack tight>
            <Slider
              label="Nameplate capacity"
              value={config.battery.capacityAh}
              min={1}
              max={40}
              step={0.1}
              onChange={(v) => setBattery({ capacityAh: v })}
              display={`${fx(config.battery.capacityAh, 1)} Ah`}
            />
            <Slider
              label="Pack mass"
              value={config.battery.massKg * 1000}
              min={100}
              max={6000}
              step={50}
              onChange={(v) => setBattery({ massKg: v / 1000 })}
              display={`${fnum(config.battery.massKg * 1000, 0)} g`}
            />
            <Slider
              label="Cell count in series"
              value={config.battery.cells}
              min={1}
              max={12}
              step={1}
              onChange={(v) => setBattery({ cells: v })}
              display={`${fnum(config.battery.cells, 0)}S`}
            />
          </Stack>
        </Card>

        <div className="operator__foot">
          <div className="operator__note">
            <Thermometer size={11} /> Die {fdegC(state.thermal.die)} °C · Bank{' '}
            {fdegC(state.thermal.pcm)} °C · Pack {fdegC(state.battery.temperatureC)} °C
          </div>
          <div className="operator__note">
            <Zap size={11} /> {fx(state.allocation.supplyW)} W supply ·{' '}
            {fx(state.allocation.totalGrantedW)} W granted · {fx(config.loadW, 0)} W load
          </div>
          <div className="operator__note">
            <BatteryCharging size={11} /> SOC {fnum(state.battery.soc * 100, 1)} % ·{' '}
            {fWh(state.battery.energyWh, 1)} deliverable
          </div>
          <div className="operator__note">
            <Wind size={11} /> ρ/ρ₀ {fpctOf(state.atmosphere.densityRatio)} · Kn{' '}
            {fx(state.atmosphere.knudsen, 5)}
          </div>
          <div className="operator__provenance">
            <Gauge size={11} /> Engine is a published-model simulation{' '}
            <ClaimChip provenance="DERIVED" />
          </div>
        </div>
      </div>
    </aside>
  )
}

const fpctOf = (v: number) => `${(v * 100).toFixed(1)} %`
