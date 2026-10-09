import { describe, expect, it } from 'vitest'
import { colebrook, fluidProps, frictionFactor, haaland, solvePipeline, solveSegment, swameeJain, totalK, FLOW_UNITS, PRESSURE_UNITS } from './pipe'

describe('fluid properties', () => {
  it('water at 20 °C', () => {
    const w = fluidProps('water', 20)
    expect(w.rho).toBeCloseTo(998.2, 0)
    expect(w.mu).toBeCloseTo(1.002e-3, 4)
  })
  it('water at 80 °C is thinner', () => {
    const w = fluidProps('water', 80)
    expect(w.rho).toBeCloseTo(971.8, 0)
    expect(w.mu).toBeCloseTo(3.55e-4, 5)
  })
  it('air at 20 °C', () => {
    const a = fluidProps('air', 20)
    expect(a.rho).toBeCloseTo(1.204, 2)
    expect(a.mu).toBeCloseTo(1.81e-5, 7)
  })
})

describe('friction factor', () => {
  it('laminar is 64/Re', () => {
    expect(frictionFactor(1000, 0.001, 'colebrook')).toEqual({ f: 0.064, regime: 'laminar' })
  })
  it('Colebrook matches the Moody chart', () => {
    expect(colebrook(1e5, 0.001)).toBeCloseTo(0.0222, 3)
    expect(colebrook(1e5, 0)).toBeGreaterThan(0)
    expect(colebrook(1e7, 0.01)).toBeCloseTo(0.0380, 3)
  })
  it('satisfies the Colebrook equation', () => {
    const Re = 3e5
    const rel = 2e-4
    const f = colebrook(Re, rel)
    const lhs = 1 / Math.sqrt(f)
    const rhs = -2 * Math.log10(rel / 3.7 + 2.51 / (Re * Math.sqrt(f)))
    expect(lhs).toBeCloseTo(rhs, 8)
  })
  it('explicit approximations stay within 3% of Colebrook', () => {
    for (const Re of [1e4, 1e5, 1e6, 1e7]) {
      for (const rel of [1e-5, 1e-3, 1e-2]) {
        const c = colebrook(Re, rel)
        expect(Math.abs(swameeJain(Re, rel) / c - 1)).toBeLessThan(0.03)
        expect(Math.abs(haaland(Re, rel) / c - 1)).toBeLessThan(0.03)
      }
    }
  })
  it('blends through the transitional range', () => {
    const r = frictionFactor(3000, 0.001, 'colebrook')
    expect(r.regime).toBe('transitional')
    expect(r.f).toBeGreaterThan(64 / 2300 - 0.001)
  })
})

describe('segment and pipeline', () => {
  const water = fluidProps('water', 20)
  const seg = { name: 'a', L: 100, D: 0.05, eps: 0.045e-3, dz: 0, K: 0 }
  it('Darcy-Weisbach for 2 L/s through 100 m of 50 mm steel pipe', () => {
    const r = solveSegment(seg, 2 * FLOW_UNITS['L/s'], water, 'colebrook')
    expect(r.v).toBeCloseTo(1.0186, 3)
    expect(r.Re).toBeCloseTo(50750, -2)
    expect(r.f).toBeGreaterThan(0.023)
    expect(r.f).toBeLessThan(0.025)
    expect(r.dpFriction).toBeCloseTo(r.f * (100 / 0.05) * 0.5 * water.rho * r.v * r.v, 6)
    expect(r.dpFriction / 1000).toBeGreaterThan(23)
    expect(r.dpFriction / 1000).toBeLessThan(26)
  })
  it('minor losses use K·ρv²/2 and elevation uses ρgΔz', () => {
    const r = solveSegment({ ...seg, L: 0.001, K: 2, dz: 10 }, 0.002, water, 'colebrook')
    expect(r.dpMinor).toBeCloseTo(2 * 0.5 * water.rho * r.v ** 2, 6)
    expect(r.dpElevation).toBeCloseTo(water.rho * 9.80665 * 10, 6)
  })
  it('adds segments in series and tracks the pressure profile', () => {
    const p = solvePipeline([seg, { ...seg, name: 'b', dz: -5 }], 0.002, water, 'colebrook', 300e3)
    expect(p.length).toBe(200)
    expect(p.profile).toHaveLength(3)
    expect(p.profile[2].p).toBeCloseTo(300e3 - p.dpTotal, 6)
    expect(p.dpTotal).toBeCloseTo(p.segments[0].dpTotal + p.segments[1].dpTotal, 9)
    expect(p.headLoss).toBeCloseTo((p.dpFriction + p.dpMinor) / (water.rho * 9.80665), 9)
  })
  it('sums fitting K values', () => {
    expect(totalK([{ kind: 'elbow90', count: 2 }, { kind: 'custom', count: 1, k: 3 }])).toBeCloseTo(4.8, 9)
  })
  it('unit tables are consistent', () => {
    expect(1 * FLOW_UNITS.gpm).toBeCloseTo(6.309e-5, 8)
    expect(PRESSURE_UNITS.psi).toBeCloseTo(6894.76, 1)
  })
})
