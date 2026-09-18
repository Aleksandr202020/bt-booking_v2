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

// A successful HTTP response is not enough to treat the page as a valid
// snapshot. If SS.COM returns an unexpected/challenge page, an empty parsed
// catalog must never deactivate the entire existing catalog.
if (makeLinks.length === 0) {
  throw new Error('SS.COM catalog snapshot is empty or could not be parsed')
}

let modelCount = 0
const seenMakeNames = new Set()
const seenModelKeys = new Set()
await sql.begin(async (tx) => {
  // Serialize catalog writers and make the whole snapshot atomic: a failed sync
  // must not leave a partially updated make/model catalog behind.
  await tx`SELECT pg_advisory_xact_lock(hashtext('bt-booking:ss-catalog-sync'))`

  for (const { href: makeHref, text } of makeLinks) {
    const make = text.trim()
    if (!make) continue
    seenMakeNames.add(make)

    const makeRows = await tx`
      INSERT INTO vehicle_makes (name, source)
      VALUES (${make}, ${SOURCE})
      ON CONFLICT (name) DO UPDATE SET source = EXCLUDED.source, active = TRUE
      RETURNING id
    `
    const makeId = makeRows[0]?.id
    if (!makeId) continue

    const html = await fetchText(new URL(makeHref, BASE).href)
    const modelLinks = extractLinks(html)
      .filter(({ href }) => href.startsWith(makeHref))

    const uniqueModels = new Set()
    for (const { text } of modelLinks) {
      const prefix = `${make} `
      const model = text.startsWith(prefix) ? text.slice(prefix.length).trim() : text.trim()
      if (!model || model.length > 80 || uniqueModels.has(model)) continue
      uniqueModels.add(model)

      const category = inferCategory(make, model)
      seenModelKeys.add(`${makeId}|${model}`)
      await tx`
        INSERT INTO vehicle_models (make_id, name, category, source)
        VALUES (${makeId}, ${model}, ${category}, ${SOURCE})
        ON CONFLICT (make_id, name)
        DO UPDATE SET category = EXCLUDED.category, source = EXCLUDED.source, active = TRUE
      `
      modelCount += 1
    }
  }

  // SS.COM is the authoritative source for rows marked source=ss.com.
  // Deactivate source rows that disappeared from the latest complete snapshot;
  // never delete them because existing customer cars/bookings may reference the catalog.
  const staleMakes = await tx`SELECT id, name FROM vehicle_makes WHERE source = ${SOURCE} AND active = TRUE`
  for (const row of staleMakes) {
    if (!seenMakeNames.has(row.name)) {
      await tx`UPDATE vehicle_makes SET active = FALSE WHERE id = ${row.id}`
    }
  }

  const staleModels = await tx`
    SELECT v.id, v.make_id, v.name
    FROM vehicle_models v
    JOIN vehicle_makes m ON m.id = v.make_id
    WHERE v.source = ${SOURCE} AND v.active = TRUE
  `
  for (const row of staleModels) {
    if (!seenModelKeys.has(`${row.make_id}|${row.name}`)) {
      await tx`UPDATE vehicle_models SET active = FALSE WHERE id = ${row.id}`
    }
  }
})

console.log(`SS.COM catalog sync complete: ${makeLinks.length} makes, ${modelCount} models.`)
await sql.end()
