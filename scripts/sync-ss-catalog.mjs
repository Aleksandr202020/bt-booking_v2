import postgres from 'postgres'

const SOURCE = 'ss.com'
const BASE = 'https://www.ss.com/lv/transport/cars/'
const sql = postgres(process.env.DATABASE_URL, { prepare: false })

const explicitCategories = new Map([
  ['skoda|kamiq', 'crossover'],
  ['opel|zafira', 'crossover'],
  ['volkswagen|caddy', 'commercial'],
  ['citroen|berlingo', 'commercial'],
  ['mercedes|v-class', 'minivan'],
  ['mercedes|v class', 'minivan'],
])

function decodeHtml(value) {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/<[^>]+>/g, '')
    .trim()
}

function extractLinks(html) {
  const links = []
  const re = /<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi
  for (const match of html.matchAll(re)) {
    links.push({ href: match[1], text: decodeHtml(match[2]) })
  }
  return links
}

function inferCategory(make, model) {
  const key = `${make.toLowerCase()}|${model.toLowerCase()}`
  if (explicitCategories.has(key)) return explicitCategories.get(key)

  const m = model.toLowerCase()
  if (/\b(caddy|berlingo|partner|kangoo|master|trafic|vivaro|transit|sprinter|vito|crafter|ducato|boxer|jumper|proace|expert|jumpy|dokker|doblo)\b/.test(m)) return 'commercial'
  if (/\b(v[- ]class|vito|multivan|caravelle|sharan|alhambra|zafira|tourneo|galaxy|s-max|voyager|pacifica|proace verso)\b/.test(m)) return 'minivan'
  if (/^(q[0-9]|x[0-9]+|cx-[0-9]+|cx[0-9]+|evoque|discovery|defender|range rover|glc|gle|gls|gla|glb|tucson|kona|santa fe|sportage|sorento|niro|juke|qashqai|x-trail|rav4|highlander|chr|c-hr|tiguan|t-roc|t-cross|karoq|kodiaq|kamiq|ateca|formentor|cayenne|macan|levante|urus|stelvio|compass|renegade|cherokee|grand cherokee|wrangler|outlander|asx|forester|outback|solterra|xc40|xc60|xc90|ux|nx|rx|lx)\b/i.test(model)) return 'crossover'
  return 'passenger'
}

async function fetchText(url) {
  const response = await fetch(url, { headers: { 'user-agent': 'BT-Automazgatava-Catalog-Snapshot/1.0' } })
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${url}`)
  return response.text()
}

const mainHtml = await fetchText(BASE)
const makeLinks = extractLinks(mainHtml)
  .filter(({ href }) => /^\/lv\/transport\/cars\/[^/]+\/$/.test(href))
  .filter(({ href }) => !href.includes('/search'))

let modelCount = 0
await sql.begin(async (tx) => {
  // Serialize catalog writers and make the whole snapshot atomic: a failed sync
  // must not leave a partially updated make/model catalog behind.
  await tx`SELECT pg_advisory_xact_lock(hashtext('bt-booking:ss-catalog-sync'))`


  const make = text.trim()
  if (!make) continue

  const makeRows = await tx`
    INSERT INTO vehicle_makes (name, source)
    VALUES (${make}, ${SOURCE})
    ON CONFLICT (name) DO UPDATE SET source = EXCLUDED.source
    RETURNING id
  `
  const makeId = makeRows[0]?.id
  if (!makeId) continue

  const html = await fetchText(new URL(href, BASE).href)
  const modelLinks = extractLinks(html)
    .filter(({ href }) => href.startsWith(href))

  const uniqueModels = new Set()
  for (const { text } of modelLinks) {
    const prefix = `${make} `
    const model = text.startsWith(prefix) ? text.slice(prefix.length).trim() : text.trim()
    if (!model || model.length > 80 || uniqueModels.has(model)) continue
    uniqueModels.add(model)

    const category = inferCategory(make, model)
    await tx`
      INSERT INTO vehicle_models (make_id, name, category, source)
      VALUES (${makeId}, ${model}, ${category}, ${SOURCE})
      ON CONFLICT (make_id, name)
      DO UPDATE SET category = EXCLUDED.category, source = EXCLUDED.source, active = TRUE
    `
    modelCount += 1
  }
}

})

console.log(`SS.COM catalog sync complete: ${makeLinks.length} makes, ${modelCount} models.`)
await sql.end()
