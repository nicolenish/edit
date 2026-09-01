// Static demo adapter — serves ÉDIT from frozen API responses.
//
// Used only by vite.config.demo.ts, which builds the embeddable copy for the
// portfolio. The normal dev server and production build never import this.
//
// The app cannot reach Django from a static host, so the responses for the
// seeded library are captured once and replayed. The UI is the real UI: same
// components, same TanStack Query cache, same GraphDesk. Only the transport is
// frozen.
//
// Keys are "GET <config.url>" — axios baseURL is '/api', so the url the
// adapter sees is '/graph/', which is exactly what capture-edit.py recorded.

import type { AxiosAdapter, AxiosRequestConfig, AxiosResponse } from 'axios'

type Entry = { file: string; status: number }
type Manifest = Record<string, Entry>

let manifestPromise: Promise<Manifest> | null = null
const cache = new Map<string, unknown>()
const misses = new Set<string>()

const demoRoot = () => `${import.meta.env.BASE_URL || '/'}__demo__/`

function loadManifest(): Promise<Manifest> {
  if (!manifestPromise) {
    manifestPromise = fetch(`${demoRoot()}manifest.json`).then((r) => r.json()).catch(() => ({}))
  }
  return manifestPromise
}

/** Percent-escapes are decoded on both sides of the lookup: node ids contain
 *  colons, and axios sends "house:khaite" in a path but "house%3Akhaite" in a
 *  query. Decoding normalises the two spellings to one key. */
const decode = (s: string) => { try { return decodeURIComponent(s) } catch { return s } }

function keyFor(method: string, url: string, params?: Record<string, unknown>): string {
  const [rawPath, inline] = url.split('?')
  const path = decode(rawPath)
  const qs = new URLSearchParams(inline || '')
  for (const [k, v] of Object.entries(params || {})) {
    if (v !== undefined && v !== null && v !== '') qs.set(k, String(v))
  }
  const sorted = [...qs.entries()].sort(([a], [b]) => a.localeCompare(b))
  const tail = sorted.length ? '?' + sorted.map(([k, v]) => `${k}=${decode(v)}`).join('&') : ''
  return `${method.toUpperCase()} ${path}${tail}`
}

export const staticAdapter: AxiosAdapter = async (config: AxiosRequestConfig) => {
  const method = (config.method ?? 'get').toUpperCase()
  const url = config.url ?? ''
  const manifest = await loadManifest()

  const exact = keyFor(method, url, config.params as Record<string, unknown>)
  const path = decode(url.split('?')[0])
  const bare = `${method} ${path}`
  // A focus/lens combination we never captured degrades to the whole desk
  // rather than to somebody else's neighbourhood, which would just be wrong.
  //
  // ONLY for the desk composition itself. The earlier version tested
  // `url.startsWith('/graph/')`, which also swallowed /graph/node/<id>/,
  // /graph/house/<key>/study/ and /graph/board/<slug>/ — so an uncaptured
  // house handed the *desk* payload to a detail panel, which then read
  // .map() off a field that response has never had and took the whole app
  // down with it. A miss on a detail endpoint must stay a miss.
  const isDeskQuery = path === '/graph/' || path === '/graph'
  const entry = manifest[exact] ?? manifest[bare] ?? (isDeskQuery ? manifest['GET /graph/'] : undefined)

  if (!entry) {
    if (!misses.has(exact)) {
      misses.add(exact)
      console.warn('[static-demo] no fixture for', exact)
    }
    // A missed GET must REJECT, not resolve with null: React Query would treat
    // null as success and hand it to a component that immediately .map()s it.
    if (method === 'GET') {
      const response = { data: null, status: 404, statusText: 'Not Found (demo)', headers: {}, config } as AxiosResponse
      return Promise.reject(Object.assign(new Error('no fixture'), { response, config }))
    }
    // Mutations have nothing to write to, so they succeed quietly — with an
    // object rather than null, for the same reason.
    return { data: {}, status: 200, statusText: 'OK (demo no-op)', headers: {}, config } as AxiosResponse
  }

  if (!cache.has(entry.file)) {
    cache.set(entry.file, await fetch(demoRoot() + entry.file).then((r) => r.json()))
  }
  return { data: cache.get(entry.file), status: entry.status, statusText: 'OK', headers: {}, config } as AxiosResponse
}
