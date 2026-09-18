import postgres from 'postgres'
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'

const sql = postgres(process.env.DATABASE_URL, { prepare: false })

await sql.begin(async (tx) => {
  // Serialize migration runners. Without this lock, two deploys starting at the
  // same time could both observe a missing migration and execute it concurrently.
  await tx`SELECT pg_advisory_xact_lock(hashtext('bt-booking:migrations'))`

  await tx`CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())`

  const dir = new URL('../db/migrations/', import.meta.url)
  const files = (await readdir(dir)).filter((name) => name.endsWith('.sql')).sort()

  for (const file of files) {
    const version = file.replace(/\.sql$/, '')
    const exists = await tx`SELECT 1 FROM schema_migrations WHERE version = ${version} LIMIT 1`
    if (exists.length) continue

    const migration = await readFile(join(dir.pathname, file), 'utf8')
    await tx.unsafe(migration)
    await tx`INSERT INTO schema_migrations(version) VALUES (${version})`
    console.log(`Applied ${version}`)
  }
})

await sql.end()
