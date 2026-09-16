import postgres from 'postgres'
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'

const sql = postgres(process.env.DATABASE_URL, { prepare: false })
await sql`CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())`

const dir = new URL('../db/migrations/', import.meta.url)
const files = (await readdir(dir)).filter((name) => name.endsWith('.sql')).sort()

for (const file of files) {
  const version = file.replace(/\.sql$/, '')
  const exists = await sql`SELECT 1 FROM schema_migrations WHERE version = ${version} LIMIT 1`
  if (exists.length) continue

  const migration = await readFile(join(dir.pathname, file), 'utf8')
  await sql.begin(async (tx) => {
    await tx.unsafe(migration)
    await tx`INSERT INTO schema_migrations(version) VALUES (${version})`
  })
  console.log(`Applied ${version}`)
}

await sql.end()
