import type { T } from './kitlib'
import { fmt } from './kitlib'

function niceTicks(lo: number, hi: number, n = 5): number[] {
  const span = hi - lo || 1
  const raw = span / n
  const mag = 10 ** Math.floor(Math.log10(raw))
  const step = ([1, 2, 5, 10].find((m) => m * mag >= raw) ?? 10) * mag
  const out: number[] = []
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(Math.abs(v) < step * 1e-9 ? 0 : v)
  return out
}

export default function PressureChart(p: { profile: { x: number; p: number }[]; LU: number; PF: number; lengthUnit: string; pressureUnit: string; t: T }) {
  const W = 720
  const H = 280
  const m = { l: 56, r: 16, t: 14, b: 38 }
  const xs = p.profile.map((q) => q.x / p.LU)
  const ys = p.profile.map((q) => q.p / p.PF)
  const xmax = Math.max(...xs, 1e-9)
  let lo = Math.min(...ys, 0)
  let hi = Math.max(...ys, 0)
  if (hi - lo < 1e-9) hi = lo + 1
  const pad = (hi - lo) * 0.08
  lo -= pad
  hi += pad
  const X = (x: number) => m.l + (x / xmax) * (W - m.l - m.r)
  const Y = (y: number) => H - m.b - ((y - lo) / (hi - lo)) * (H - m.t - m.b)
  const pts = xs.map((x, i) => `${X(x).toFixed(1)},${Y(ys[i]).toFixed(1)}`).join(' ')
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={p.t('Pressure profile along the line')}>
      {niceTicks(lo, hi).map((v) => (
        <g key={v}>
          <line className={v === 0 ? 'axis' : 'grid'} x1={m.l} x2={W - m.r} y1={Y(v)} y2={Y(v)} />
          <text x={m.l - 6} y={Y(v) + 4} textAnchor="end">{fmt(v, 3)}</text>
        </g>
      ))}
      {niceTicks(0, xmax).map((v) => (
        <g key={'x' + v}>
          <line className="grid" x1={X(v)} x2={X(v)} y1={m.t} y2={H - m.b} />
          <text x={X(v)} y={H - m.b + 14} textAnchor="middle">{fmt(v, 3)}</text>
        </g>
      ))}
      <polyline points={pts} fill="none" stroke="var(--accent)" strokeWidth={2.5} strokeLinejoin="round" />
      {xs.map((x, i) => (
        <circle key={i} cx={X(x)} cy={Y(ys[i])} r={3.5} fill="var(--accent)" />
      ))}
      <text x={(m.l + W - m.r) / 2} y={H - 6} textAnchor="middle">{p.t('Distance')} ({p.lengthUnit})</text>
      <text x={12} y={(m.t + H - m.b) / 2} textAnchor="middle" transform={`rotate(-90 12 ${(m.t + H - m.b) / 2})`}>{p.t('Gauge pressure')} ({p.pressureUnit})</text>
    </svg>
  )
}
