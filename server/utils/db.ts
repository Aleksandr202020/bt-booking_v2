import postgres from 'postgres'

let sql: ReturnType<typeof postgres> | undefined

export function getDb() {
  if (!sql) {
    const connectionString = process.env.DATABASE_URL
    if (!connectionString) {
      throw new Error('DATABASE_URL is not configured')
    }
    sql = postgres(connectionString, {
      max: 5,
      prepare: false,
      timezone: 'Europe/Riga',
    })
  }
  return sql
}
