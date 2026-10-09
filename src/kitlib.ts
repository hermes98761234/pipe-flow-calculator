import { useCallback, useEffect, useState } from 'react'

export type Lang = 'en' | 'uk'
export type Theme = 'auto' | 'light' | 'dark'
export type T = (s: string, ...args: (string | number)[]) => string

/** Strings shared by every tool. Each app spreads this into its own UK dictionary. */
export const COMMON_UK: Record<string, string> = {
  'Source on GitHub': 'Код на GitHub',
  Language: 'Мова',
  Theme: 'Тема',
  System: 'Системна',
  Light: 'Світла',
  Dark: 'Темна',
  'Copy link': 'Копіювати посилання',
  'Link copied': 'Посилання скопійовано',
  'Export CSV': 'Експорт CSV',
  'Export JSON': 'Експорт JSON',
  'Export SVG': 'Експорт SVG',
  'Export PNG': 'Експорт PNG',
  Print: 'Друк',
  Reset: 'Скинути',
  'Runs entirely in your browser. Nothing is uploaded.': 'Працює повністю у браузері. Нічого не завантажується.',
  'Check this value': 'Перевірте це значення',
  'Fix the highlighted fields.': 'Виправте виділені поля.',
  Add: 'Додати',
  Remove: 'Видалити',
  Result: 'Результат',
  Inputs: 'Вхідні дані',
  Settings: 'Налаштування',
  Metric: 'Метричні',
  Imperial: 'Імперські',
  Units: 'Одиниці',
}

export function makeTr(UK: Record<string, string>) {
  return function tr(lang: Lang, s: string, ...args: (string | number)[]): string {
    const src = lang === 'uk' ? (UK[s] ?? s) : s
    return src.replace(/\{(\d+)\}/g, (_, i: string) => String(args[+i]))
  }
}

export function encodeState(v: unknown): string {
  const bytes = new TextEncoder().encode(JSON.stringify(v))
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function decodeState(s: string): unknown {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/')
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4))
  return JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0))))
}

/** Shallow-merges a saved object over the defaults so older saves keep working. */
function merge<S>(def: S, saved: unknown): S {
  return saved && typeof saved === 'object' && !Array.isArray(saved) ? { ...def, ...(saved as object) } : def
}

/** State from the share link (#s=…) first, then localStorage, then the defaults. */
export function loadState<S>(key: string, def: S): S {
  try {
    const m = /[#&]s=([^&]+)/.exec(location.hash)
    if (m) return merge(def, decodeState(m[1]))
  } catch {
    /* fall through to local storage */
  }
  try {
    const raw = localStorage.getItem(key)
    if (raw) return merge(def, JSON.parse(raw))
  } catch {
    /* ignore */
  }
  return def
}

export function usePersisted<S>(key: string, def: S): [S, (patch: Partial<S> | ((s: S) => S)) => void, () => void] {
  const [state, setState] = useState<S>(() => loadState(key, def))
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(state))
    } catch {
      /* private mode */
    }
  }, [key, state])
  const update = useCallback((patch: Partial<S> | ((s: S) => S)) => setState((s) => (typeof patch === 'function' ? patch(s) : { ...s, ...patch })), [])
  const reset = useCallback(() => setState(def), [def])
  return [state, update, reset]
}

export interface Prefs {
  lang: Lang
  theme: Theme
}

export function usePrefs(key: string, tr: (lang: Lang, s: string, ...a: (string | number)[]) => string) {
  const [prefs, setPrefs] = useState<Prefs>(() => {
    const def: Prefs = { lang: typeof navigator !== 'undefined' && navigator.language.startsWith('uk') ? 'uk' : 'en', theme: 'auto' }
    try {
      return merge(def, JSON.parse(localStorage.getItem(key + ':prefs') ?? 'null'))
    } catch {
      return def
    }
  })
  useEffect(() => {
    try {
      localStorage.setItem(key + ':prefs', JSON.stringify(prefs))
    } catch {
      /* ignore */
    }
    const root = document.documentElement
    if (prefs.theme === 'auto') delete root.dataset.theme
    else root.dataset.theme = prefs.theme
    root.lang = prefs.lang
  }, [key, prefs])
  const t: T = useCallback((s, ...a) => tr(prefs.lang, s, ...a), [prefs.lang, tr])
  return { prefs, setPrefs, t }
}

export function shareUrl(v: unknown): string {
  return `${location.origin}${location.pathname}#s=${encodeState(v)}`
}

export function download(name: string, text: string | Blob, mime = 'text/plain') {
  const blob = text instanceof Blob ? text : new Blob([text], { type: mime })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}

export function toCsv(rows: (string | number)[][]): string {
  const q = (c: string | number) => {
    const s = String(c)
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return rows.map((r) => r.map(q).join(',')).join('\n') + '\n'
}

/** Formats with `digits` significant digits, trimming trailing zeros. */
export function fmt(x: number, digits = 4): string {
  if (!Number.isFinite(x)) return '—'
  if (x === 0) return '0'
  const a = Math.abs(x)
  if (a >= 1e6 || a < 1e-3) return x.toExponential(Math.max(0, digits - 1)).replace(/\.?0+e/, 'e')
  const dec = Math.max(0, digits - 1 - Math.floor(Math.log10(a)))
  return x.toFixed(Math.min(dec, 8)).replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '')
}

export function clamp(x: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, x))
}
