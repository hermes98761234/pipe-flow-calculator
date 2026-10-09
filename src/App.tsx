import { useMemo } from 'react'
import { NumField, Section, SelectField, Shell, Stats, Verdict, type Tone } from './kit'
import { download, fmt, toCsv, usePersisted, usePrefs } from './kitlib'
import { fluidProps, solvePipeline, LENGTH_UNITS, PRESSURE_UNITS, FLOW_UNITS, DIAMETER_UNITS, ATM, MATERIALS, type FluidKind, type Method } from './lib/pipe'
import { FITTING_LABEL, MATERIAL_LABEL, tr } from './i18n'
import { convertDiaUnit, convertLengthUnit, convertPressureUnit, DEFAULTS, FITTING_KINDS, flowSI, pressureFactor, toSI, type Inputs, type Segment } from './model'
import PressureChart from './PressureChart'

const KEY = 'pipe-flow-calculator:v1'

export default function App() {
  const { prefs, setPrefs, t } = usePrefs(KEY, tr)
  const [inp, update, reset] = usePersisted<Inputs>(KEY, DEFAULTS)
  const setSeg = (id: number, patch: Partial<Segment>) => update((s) => ({ ...s, segments: s.segments.map((x) => (x.id === id ? { ...x, ...patch } : x)) }))

  const fluid = useMemo(() => fluidProps(inp.fluid, inp.temp, { rho: inp.rho, mu: inp.mu }), [inp.fluid, inp.temp, inp.rho, inp.mu])
  const PF = pressureFactor(inp)
  const LU = LENGTH_UNITS[inp.lengthUnit] ?? 1
  const res = useMemo(() => solvePipeline(toSI(inp), flowSI(inp), fluid, inp.method, inp.inlet * PF), [inp, fluid, PF])
  const valid = inp.flow > 0 && inp.segments.length > 0 && inp.segments.every((s) => s.length > 0 && s.diameter > 0)
  const outlet = res.profile[res.profile.length - 1].p
  const maxV = Math.max(0, ...res.segments.map((s) => s.v))
  const fmtP = (pa: number) => fmt(pa / PF, 4)

  const warnings: { tone: Tone; text: string }[] = []
  for (const s of res.segments) {
    if (s.regime === 'transitional') {
      warnings.push({ tone: 'warn', text: t('Flow is in the transitional range (Re 2300 to 4000): the friction factor is uncertain.') })
      break
    }
  }
  const vLimit = inp.fluid === 'air' ? 25 : inp.fluid === 'oil' ? 2 : 3
  for (const s of res.segments) if (s.v > vLimit) warnings.push({ tone: 'warn', text: t('Velocity above {0} m/s in {1}: expect noise and erosion.', vLimit, s.name) })
  if (inp.fluid !== 'air' && res.profile.some((p) => p.p < -ATM)) warnings.push({ tone: 'err', text: t('The pressure falls below absolute vacuum: the liquid would cavitate. Raise the inlet pressure or enlarge the pipe.') })
  if (inp.fluid === 'air' && res.dpTotal > 0.1 * (ATM + inp.inlet * PF)) warnings.push({ tone: 'warn', text: t('The pressure drop is more than 10 % of the absolute pressure: for air, treat the result as a rough estimate (compressibility is ignored).') })

  const exportCsv = () =>
    download(
      'pipe-flow.csv',
      toCsv([
        [t('Segment'), t('Velocity') + ' m/s', 'Re', 'f', t('Regime'), 'K', t('Friction') + ' Pa', t('Fittings loss') + ' Pa', t('Elevation') + ' Pa', t('Pressure drop') + ' Pa'],
        ...res.segments.map((s) => [s.name, s.v, s.Re, s.f, s.regime, s.K, s.dpFriction, s.dpMinor, s.dpElevation, s.dpTotal]),
      ]),
      'text/csv',
    )

  const side = (
    <>
      <Section title={t('Fluid')}>
        <SelectField<FluidKind> label={t('Fluid')} value={inp.fluid} onChange={(v) => update({ fluid: v })} options={[['water', t('Water')], ['air', t('Air')], ['oil', t('Oil (ISO VG 32)')], ['custom', t('Custom')]]} />
        {inp.fluid === 'custom' ? (
          <div className="grid2">
            <NumField t={t} label={t('Density')} unit="kg/m³" value={inp.rho} min={0.01} onChange={(v) => update({ rho: v })} />
            <NumField t={t} label={t('Dynamic viscosity')} unit="Pa·s" value={inp.mu} min={1e-7} onChange={(v) => update({ mu: v })} />
          </div>
        ) : (
          <NumField t={t} label={t('Temperature')} unit="°C" value={inp.temp} min={inp.fluid === 'water' ? 0 : -40} max={inp.fluid === 'water' ? 100 : 150} onChange={(v) => update({ temp: v })} />
        )}
        <p className="hint">
          ρ = {fmt(fluid.rho, 5)} kg/m³ · μ = {fmt(fluid.mu, 4)} Pa·s
        </p>
      </Section>
      <Section title={t('Flow rate')}>
        <div className="grid2">
          <NumField t={t} label={t('Flow rate')} value={inp.flow} min={1e-9} onChange={(v) => update({ flow: v })} />
          <SelectField label={t('Flow unit')} value={inp.flowUnit} onChange={(v) => update({ flowUnit: v })} options={Object.keys(FLOW_UNITS).map((u) => [u, u])} />
        </div>
        <div className="grid2">
          <NumField t={t} label={t('Inlet gauge pressure')} unit={inp.pressureUnit} value={inp.inlet} onChange={(v) => update({ inlet: v })} />
          <SelectField label={t('Pressure unit')} value={inp.pressureUnit} onChange={(v) => update((s) => convertPressureUnit(s, v))} options={Object.keys(PRESSURE_UNITS).map((u) => [u, u])} />
        </div>
        <SelectField<Method> label={t('Friction factor method')} value={inp.method} onChange={(v) => update({ method: v })} options={[['colebrook', t('Colebrook-White (iterative)')], ['swamee', t('Swamee-Jain (explicit)')], ['haaland', t('Haaland (explicit)')]]} />
        <div className="grid2">
          <SelectField label={t('Length unit')} value={inp.lengthUnit} onChange={(v) => update((s) => convertLengthUnit(s, v))} options={Object.keys(LENGTH_UNITS).map((u) => [u, u])} />
          <SelectField label={t('Diameter unit')} value={inp.diaUnit} onChange={(v) => update((s) => convertDiaUnit(s, v))} options={Object.keys(DIAMETER_UNITS).map((u) => [u, u])} />
        </div>
      </Section>
      <Section
        title={t('Segments')}
        actions={
          <button
            className="small"
            onClick={() =>
              update((s) => {
                const last = s.segments[s.segments.length - 1]
                const seg: Segment = { id: s.nextId, name: `${t('Segment')} ${s.segments.length + 1}`, length: last?.length ?? 50, diameter: last?.diameter ?? 50, material: last?.material ?? 'steel', roughness: last?.roughness ?? 0.05, dz: 0, fittings: [] }
                return { ...s, nextId: s.nextId + 1, segments: [...s.segments, seg] }
              })
            }
          >
            {t('Add segment')}
          </button>
        }
      >
        {inp.segments.map((s, idx) => (
          <div className="card" key={s.id}>
            <div className="row">
              <input aria-label={t('Name')} value={s.name} onChange={(e) => setSeg(s.id, { name: e.target.value })} style={{ flex: 1, minWidth: 0 }} />
              <button className="small danger" disabled={inp.segments.length < 2} onClick={() => update((x) => ({ ...x, segments: x.segments.filter((y) => y.id !== s.id) }))}>
                {t('Remove')}
              </button>
              <span className="hint">#{idx + 1}</span>
            </div>
            <div className="grid2">
              <NumField t={t} label={t('Length')} unit={inp.lengthUnit} value={s.length} min={0.001} onChange={(v) => setSeg(s.id, { length: v })} />
              <NumField t={t} label={t('Inside diameter')} unit={inp.diaUnit} value={s.diameter} min={0.001} onChange={(v) => setSeg(s.id, { diameter: v })} />
              <SelectField label={t('Material')} value={s.material} onChange={(v) => setSeg(s.id, { material: v })} options={[...Object.keys(MATERIALS).map((m): [string, string] => [m, t(MATERIAL_LABEL[m])]), ['custom', t(MATERIAL_LABEL.custom)]]} />
              {s.material === 'custom' ? (
                <NumField t={t} label={t('Roughness')} unit={inp.diaUnit} value={s.roughness} min={0} onChange={(v) => setSeg(s.id, { roughness: v })} />
              ) : (
                <div className="field">
                  <label>{t('Roughness')}</label>
                  <span className="hint">{fmt((MATERIALS[s.material] ?? 0) * 1e-3 / (DIAMETER_UNITS[inp.diaUnit] ?? 1e-3), 3)} {inp.diaUnit}</span>
                </div>
              )}
            </div>
            <NumField t={t} label={t('Elevation change (outlet minus inlet)')} unit={inp.lengthUnit} value={s.dz} onChange={(v) => setSeg(s.id, { dz: v })} />
            <div className="row">
              <strong>{t('Fittings')}</strong>
              <span className="hint">{t('Total K')} = {fmt(res.segments[idx]?.K ?? 0, 4)}</span>
              <span className="spacer" />
              <button
                className="small"
                onClick={() => update((x) => ({ ...x, nextId: x.nextId + 1, segments: x.segments.map((y) => (y.id === s.id ? { ...y, fittings: [...y.fittings, { id: x.nextId, kind: 'elbow90', count: 1 }] } : y)) }))}
              >
                {t('Add fitting')}
              </button>
            </div>
            {s.fittings.map((f) => {
              const setF = (p: Partial<typeof f>) => setSeg(s.id, { fittings: s.fittings.map((y) => (y.id === f.id ? { ...y, ...p } : y)) })
              return (
                <div className="row" key={f.id}>
                  <select aria-label={t('Fittings')} value={f.kind} onChange={(e) => setF({ kind: e.target.value, k: f.k ?? 1 })} style={{ flex: 1, minWidth: 0 }}>
                    {FITTING_KINDS.map((k) => (
                      <option key={k} value={k}>
                        {t(FITTING_LABEL[k])}
                      </option>
                    ))}
                  </select>
                  {f.kind === 'custom' ? <input type="number" aria-label={t('K value')} title={t('K value')} step="any" min={0} value={f.k ?? 1} onChange={(e) => setF({ k: Math.max(0, Number(e.target.value) || 0) })} style={{ width: 64 }} /> : null}
                  <input type="number" aria-label={t('Count')} title={t('Count')} min={0} step={1} value={f.count} onChange={(e) => setF({ count: Math.max(0, Math.round(Number(e.target.value) || 0)) })} style={{ width: 56 }} />
                  <button className="small danger" aria-label={t('Remove')} onClick={() => setSeg(s.id, { fittings: s.fittings.filter((y) => y.id !== f.id) })}>
                    ×
                  </button>
                </div>
              )
            })}
          </div>
        ))}
      </Section>
    </>
  )

  return (
    <Shell
      title={t('Pipe Flow Calculator')}
      tagline={t('Pressure drop, head loss and velocity for pipes in series.')}
      repo="pipe-flow-calculator"
      prefs={prefs}
      setPrefs={setPrefs}
      t={t}
      state={inp}
      onReset={reset}
      side={side}
      footer={t('Darcy-Weisbach: dp = f (L/D) ρv²/2 + K ρv²/2 + ρgΔz. Fluid treated as incompressible.')}
    >
      {!valid ? (
        <Verdict tone="err">{t('Fix the highlighted fields.')}</Verdict>
      ) : (
        <>
          <Stats
            items={[
              { label: t('Total pressure drop'), value: fmtP(res.dpTotal), unit: inp.pressureUnit },
              { label: t('Head loss (friction + fittings)'), value: fmt(res.headLoss / LU, 4), unit: inp.lengthUnit },
              { label: t('Outlet gauge pressure'), value: fmtP(outlet), unit: inp.pressureUnit, tone: outlet < -ATM ? 'err' : outlet < 0 ? 'warn' : 'ok' },
              { label: t('Max velocity'), value: fmt(maxV / LU, 3), unit: inp.lengthUnit + '/s' },
            ]}
          />
          <div className="box">
            {warnings.length === 0 ? <Verdict tone="ok">{t('No warnings.')}</Verdict> : warnings.map((w, i) => <Verdict key={i} tone={w.tone}>{w.text}</Verdict>)}
            <p className="hint">{t('Pressure drop is {0} over {1}.', `${fmtP(res.dpTotal)} ${inp.pressureUnit}`, `${fmt(res.length / LU, 4)} ${inp.lengthUnit}`)}</p>
          </div>
          <div className="box table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>{t('Segment')}</th>
                  <th className="num">{t('Velocity')} ({inp.lengthUnit}/s)</th>
                  <th className="num">Re</th>
                  <th className="num">f</th>
                  <th>{t('Regime')}</th>
                  <th className="num">K</th>
                  <th className="num">{t('Friction')}</th>
                  <th className="num">{t('Fittings loss')}</th>
                  <th className="num">{t('Elevation')}</th>
                  <th className="num">{t('Pressure drop')} ({inp.pressureUnit})</th>
                </tr>
              </thead>
              <tbody>
                {res.segments.map((s, i) => (
                  <tr key={i}>
                    <td>{s.name}</td>
                    <td className="num">{fmt(s.v / LU, 3)}</td>
                    <td className="num">{fmt(s.Re, 4)}</td>
                    <td className="num">{fmt(s.f, 4)}</td>
                    <td>{t(s.regime)}</td>
                    <td className="num">{fmt(s.K, 3)}</td>
                    <td className="num">{fmtP(s.dpFriction)}</td>
                    <td className="num">{fmtP(s.dpMinor)}</td>
                    <td className="num">{fmtP(s.dpElevation)}</td>
                    <td className="num">
                      <strong>{fmtP(s.dpTotal)}</strong>
                    </td>
                  </tr>
                ))}
                <tr>
                  <td>
                    <strong>{t('Total')}</strong>
                  </td>
                  <td colSpan={5} />
                  <td className="num">{fmtP(res.dpFriction)}</td>
                  <td className="num">{fmtP(res.dpMinor)}</td>
                  <td className="num">{fmtP(res.dpElevation)}</td>
                  <td className="num">
                    <strong>{fmtP(res.dpTotal)}</strong>
                  </td>
                </tr>
              </tbody>
            </table>
            <div className="row" style={{ marginTop: 8 }}>
              <button className="small" onClick={exportCsv}>{t('Export CSV')}</button>
              <button className="small" onClick={() => download('pipe-flow.json', JSON.stringify({ inputs: inp, result: res }, null, 2), 'application/json')}>{t('Export JSON')}</button>
              <button className="small" onClick={() => window.print()}>{t('Print')}</button>
            </div>
          </div>
          <div className="box">
            <h3>{t('Pressure profile along the line')}</h3>
            <PressureChart profile={res.profile} lengthUnit={inp.lengthUnit} LU={LU} PF={PF} pressureUnit={inp.pressureUnit} t={t} />
          </div>
        </>
      )}
    </Shell>
  )
}
