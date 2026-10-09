import { copyFileSync, mkdirSync, statSync } from 'node:fs'

const root = new URL('../', import.meta.url)
const source = new URL('outputs/chennai_susceptibility_v2.geojson', root)
const destination = new URL('frontend/dist/cells.geojson', root)

mkdirSync(new URL('frontend/dist', root), { recursive: true })
copyFileSync(source, destination)

if (statSync(source).size !== statSync(destination).size) {
  throw new Error('The deployed GeoJSON differs from the scored source layer')
}

console.log(`Staged ${statSync(destination).size} bytes of scored GeoJSON for the CDN`)
