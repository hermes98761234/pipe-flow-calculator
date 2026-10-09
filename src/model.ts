import { DIAMETER_UNITS, FITTINGS, FLOW_UNITS, LENGTH_UNITS, MATERIALS, PRESSURE_UNITS, totalK, type FluidKind, type Method, type SegmentSI } from './lib/pipe'

export interface Fitting {
  id: number
  kind: string
  count: number
  k?: number
}
export interface Segment {
  id: number
  name: string
  length: number
  diameter: number
  material: string
  roughness: number
  dz: number
  fittings: Fitting[]
}
export interface Inputs {
  fluid: FluidKind
  temp: number
  rho: number
  mu: number
  flow: number
  flowUnit: string
  method: Method
  lengthUnit: string
  diaUnit: string
  pressureUnit: string
  inlet: number
  segments: Segment[]
  nextId: number
}

export const DEFAULTS: Inputs = {
  fluid: 'water',
  temp: 20,
  rho: 1000,
  mu: 0.001,
  flow: 5,
  flowUnit: 'L/s',
  method: 'colebrook',
  lengthUnit: 'm',
  diaUnit: 'mm',
  pressureUnit: 'kPa',
  inlet: 600,
  nextId: 10,
  segments: [
    {
      id: 1, name: 'Main', length: 120, diameter: 80, material: 'steel', roughness: 0.05, dz: 0,
      fittings: [{ id: 2, kind: 'entranceSharp', count: 1 }, { id: 3, kind: 'elbow90', count: 3 }, { id: 4, kind: 'gate', count: 1 }],
    },
    {
      id: 5, name: 'Riser', length: 30, diameter: 50, material: 'steel', roughness: 0.05, dz: 15,
      fittings: [{ id: 6, kind: 'elbow90', count: 2 }, { id: 7, kind: 'check', count: 1 }, { id: 8, kind: 'globe', count: 1 }],
    },
  ],
}

export const flowSI = (i: Inputs) => i.flow * (FLOW_UNITS[i.flowUnit] ?? 1)

export function toSI(i: Inputs): SegmentSI[] {
  const lu = LENGTH_UNITS[i.lengthUnit] ?? 1
  const du = DIAMETER_UNITS[i.diaUnit] ?? 1e-3
  return i.segments.map((s) => ({
    name: s.name,
    L: s.length * lu,
    D: s.diameter * du,
    eps: s.material === 'custom' ? s.roughness * du : (MATERIALS[s.material] ?? 0.045) * 1e-3,
    dz: s.dz * lu,
    K: totalK(s.fittings),
  }))
}

export const pressureFactor = (i: Inputs) => PRESSURE_UNITS[i.pressureUnit] ?? 1e3

export function convertLengthUnit(i: Inputs, unit: string): Inputs {
  const r = (LENGTH_UNITS[i.lengthUnit] ?? 1) / (LENGTH_UNITS[unit] ?? 1)
  const rd = (x: number) => Number((x * r).toPrecision(5))
  return { ...i, lengthUnit: unit, segments: i.segments.map((s) => ({ ...s, length: rd(s.length), dz: rd(s.dz) })) }
}
export function convertDiaUnit(i: Inputs, unit: string): Inputs {
  const r = (DIAMETER_UNITS[i.diaUnit] ?? 1e-3) / (DIAMETER_UNITS[unit] ?? 1e-3)
  const rd = (x: number) => Number((x * r).toPrecision(5))
  return { ...i, diaUnit: unit, segments: i.segments.map((s) => ({ ...s, diameter: rd(s.diameter), roughness: rd(s.roughness) })) }
}
export function convertPressureUnit(i: Inputs, unit: string): Inputs {
  const r = (PRESSURE_UNITS[i.pressureUnit] ?? 1) / (PRESSURE_UNITS[unit] ?? 1)
  return { ...i, pressureUnit: unit, inlet: Number((i.inlet * r).toPrecision(5)) }
}

export const FITTING_KINDS = [...Object.keys(FITTINGS), 'custom']
