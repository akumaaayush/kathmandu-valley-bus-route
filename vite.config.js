import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { createHash } from 'node:crypto'
import path from 'node:path'
import { BUS_SERVICES } from './src/data/legendData.js'
import { LINES, STATIONS } from './src/data/tripNetwork.js'

const PUBLIC_DIR = path.resolve('public')
const TILES_DIR = path.join(PUBLIC_DIR, 'tiles')

// Tile zoom levels small enough (~1.5 MB total) to precache when the service worker installs
const PRECACHE_TILE_MAX_ZOOM = 3

// Public files (besides tiles) the app needs to boot offline
const PUBLIC_SHELL_FILES = [
  'Kathmandu_Bus_Route_Map.svg',
  'manifest.webmanifest',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon.png',
]

// Emitted by seoPlugin for search engines only
const CRAWLER_FILES = ['robots.txt', 'sitemap.xml']

const shortHash = (input) => createHash('sha256').update(input).digest('hex').slice(0, 12)

// Map canvas at the native zoom (keep in sync with MapViewer.jsx)
const MAP_WIDTH = 11667
const MAP_HEIGHT = 8750
const NATIVE_MAX_ZOOM = 6

// public/tiles also holds tiles from an older, larger raster outside the map; the map never requests them
const isTileOnMap = (z, x, y) => {
  const scale = 2 ** (NATIVE_MAX_ZOOM - z)
  return x < Math.ceil(MAP_WIDTH / scale / 256) && y < Math.ceil(MAP_HEIGHT / scale / 256)
}

// Lists every tile PNG on the map under public/tiles as { path: 'tiles/z/x/y.png', size }
function listTiles() {
  const tiles = []
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const full = path.join(dir, name)
      const stat = statSync(full)
      if (stat.isDirectory()) walk(full)
      else if (name.endsWith('.png')) {
        tiles.push({ path: path.relative(PUBLIC_DIR, full).split(path.sep).join('/'), size: stat.size })
      }
    }
  }
  walk(TILES_DIR)
  return tiles.filter((t) => isTileOnMap(...t.path.match(/(\d+)\/(\d+)\/(\d+)\.png$/).slice(1).map(Number))).sort((a, b) => a.path.localeCompare(b.path, 'en', { numeric: true }))
}

// Manifest of all tiles, read by the "Save map offline" downloader. Cache name changes when tiles change.
function buildTilesManifest() {
  const tiles = listTiles()
  const version = shortHash(tiles.map((t) => `${t.path}:${t.size}`).join('|'))
  return {
    cacheName: `ktm-tiles-${version}`,
    totalBytes: tiles.reduce((sum, t) => sum + t.size, 0),
    tiles: tiles.map((t) => t.path),
  }
}

// Emits tiles-manifest.json and a service worker (sw.js) whose precache list includes the hashed build output
function offlinePlugin() {
  return {
    name: 'ktm-offline',
    enforce: 'post',
    configureServer(server) {
      server.middlewares.use('/tiles-manifest.json', (_req, res) => {
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify(buildTilesManifest()))
      })
    },
    generateBundle(_options, bundle) {
      const tilesManifest = buildTilesManifest()
      const tilesManifestJson = JSON.stringify(tilesManifest)
      this.emitFile({ type: 'asset', fileName: 'tiles-manifest.json', source: tilesManifestJson })

      // Crawler files are not needed offline (and sitemap.xml's date would make every build a new app version)
      const bundleFiles = Object.keys(bundle).filter((f) => !f.endsWith('.map') && !CRAWLER_FILES.includes(f))
      // Deduped: cache.addAll() rejects duplicate requests (bundleFiles already includes tiles-manifest.json)
      const shellFiles = [...new Set(['./', ...bundleFiles, ...PUBLIC_SHELL_FILES])]
      const shellVersion = shortHash(
        [
          ...bundleFiles.map((f) => {
            const item = bundle[f]
            return item.type === 'chunk' ? item.code : item.source
          }),
          ...PUBLIC_SHELL_FILES.map((f) => readFileSync(path.join(PUBLIC_DIR, f))),
          tilesManifestJson,
        ]
          .map((content) => shortHash(content))
          .join('|')
      )
      const precacheTiles = tilesManifest.tiles.filter((t) => Number(t.split('/')[1]) <= PRECACHE_TILE_MAX_ZOOM)

      const swSource = readFileSync(path.resolve('src/service-worker.js'), 'utf8')
        .replace('__SHELL_CACHE__', JSON.stringify(`ktm-shell-${shellVersion}`))
        .replace('__TILES_CACHE__', JSON.stringify(tilesManifest.cacheName))
        .replace('__SHELL_FILES__', JSON.stringify(shellFiles))
        .replace('__PRECACHE_TILES__', JSON.stringify(precacheTiles))
      this.emitFile({ type: 'asset', fileName: 'sw.js', source: swSource })
    },
  }
}

const escapeHtml = (text) => String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

// Plain HTML about the network, in a <noscript> block. Crawlers that don't run JavaScript (most AI search bots)
// otherwise see only the title. Built from the same data as the app, so the numbers stay current.
function crawlableSummary() {
  const operators = BUS_SERVICES.map((s) => `<li><b>${escapeHtml(s.name)}</b>: ${escapeHtml(s.corridor)}</li>`).join('\n          ')
  return `<noscript>
      <main class="seo-summary">
        <h1>Kathmandu Valley Bus Route Map</h1>
        <p>An interactive map of bus routes in Kathmandu Valley, Nepal: ${LINES.length} routes run by ${BUS_SERVICES.length} operators,
          ${STATIONS.length} stops, and a trip planner that tells you which bus to take and where to change.
          काठमाडौं उपत्यकाको बस रुट नक्सा र यात्रा योजनाकार।</p>
        <p>The map needs JavaScript. Operators on the map:</p>
        <ul>
          ${operators}
        </ul>
        <p>Map artwork by Subham Subedi. Stop locations © OpenStreetMap contributors.</p>
      </main>
    </noscript>`
}

// robots.txt, sitemap.xml and the crawlable summary. siteUrl: public origin, no trailing slash (VITE_SITE_URL).
function seoPlugin(siteUrl) {
  return {
    name: 'ktm-seo',
    transformIndexHtml(html) {
      return html.replace('<!-- seo:summary -->', crawlableSummary())
    },
    generateBundle() {
      if (!siteUrl) this.error('VITE_SITE_URL is not set (see .env)')
      this.emitFile({
        type: 'asset',
        fileName: 'robots.txt',
        source: `User-agent: *\nAllow: /\n\nSitemap: ${siteUrl}/sitemap.xml\n`,
      })
      // Shared links (?op=…, ?from=…) are views of the home page, which is canonical for them
      const lastmod = new Date().toISOString().slice(0, 10)
      this.emitFile({
        type: 'asset',
        fileName: 'sitemap.xml',
        source: `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${siteUrl}/</loc><lastmod>${lastmod}</lastmod></url>
</urlset>
`,
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    tailwindcss(),
    offlinePlugin(),
    seoPlugin(loadEnv(mode, process.cwd()).VITE_SITE_URL),
  ],
  base: './', // Ensures relative assets for GitHub Pages and Cloudflare Pages
  build: {
    copyPublicDir: true, // Copy public/tiles/ into dist/ during build (required for Cloudflare deployment)
  },
}))
