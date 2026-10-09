import { describe, expect, it } from 'vitest'
import { convertDiaUnit, convertLengthUnit, convertPressureUnit, DEFAULTS, flowSI, toSI } from './model'

describe('model', () => {
  it('converts the default inputs to SI', () => {
    const s = toSI(DEFAULTS)
    expect(s[0].D).toBeCloseTo(0.08, 9)
    expect(s[0].eps).toBeCloseTo(0.045e-3, 9)
    expect(s[0].K).toBeCloseTo(0.5 + 3 * 0.9 + 0.2, 9)
    expect(flowSI(DEFAULTS)).toBeCloseTo(0.005, 9)
  })
  it('unit conversion keeps the physical size', () => {
    const ft = convertLengthUnit(DEFAULTS, 'ft')
    expect(toSI(ft)[0].L).toBeCloseTo(120, 2)
    const inch = convertDiaUnit(DEFAULTS, 'in')
    expect(toSI(inch)[1].D).toBeCloseTo(0.05, 4)
    expect(convertPressureUnit(DEFAULTS, 'bar').inlet).toBeCloseTo(6, 6)
  })
})
