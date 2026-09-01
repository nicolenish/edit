// Static demo build — the taste graph as an embeddable prototype.
//
// A copy of the real frontend that runs with no Django behind it: same
// components, same styles, same TanStack Query cache, with the axios transport
// swapped for responses captured from the seeded library.
//
// Nothing in src/ changes except one added file (api/staticAdapter.ts). A
// plugin appends the adapter swap to the real client module at build time, so
// the dev server and production build are unaffected.
//
//     npx vite build --config vite.config.demo.ts
//
// Driven by the portfolio's scripts/build-edit-demo.py.

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import type { Plugin } from 'vite'

const BASE = '/proto/edit/'

function staticTransport(): Plugin {
  return {
    name: 'edit-static-transport',
    enforce: 'post',
    transform(code, id) {
      const path = id.replace(/\\/g, '/')
      if (path.endsWith('/src/api/client.ts')) {
        return {
          code:
            code +
            `\n// injected by vite.config.demo.ts\n` +
            `import { staticAdapter as __demoAdapter } from './staticAdapter';\n` +
            `api.defaults.adapter = __demoAdapter;\n`,
          map: null,
        }
      }
      // Mounted at the portfolio's base path rather than the site root.
      if (path.endsWith('/src/main.tsx')) {
        return {
          code: code
            .replace('<BrowserRouter>', `<BrowserRouter basename="${BASE}">`)
            .replace(/BrowserRouter,\s*\{\s*children/, `BrowserRouter, { basename: "${BASE}", children`)
            .replace(/\(BrowserRouter,\s*\{/, `(BrowserRouter, { basename: "${BASE}",`),
          map: null,
        }
      }
      return null
    },
  }
}

export default defineConfig({
  base: BASE,
  plugins: [react(), staticTransport()],
  build: { outDir: 'dist-demo', emptyOutDir: true },
})
