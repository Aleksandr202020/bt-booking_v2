import postgres from 'postgres'
import { hash } from '@node-rs/argon2'

const sql = postgres(process.env.DATABASE_URL, { prepare: false })
const email = process.env.DEV_ADMIN_EMAIL
const password = process.env.DEV_ADMIN_PASSWORD
if (!email || !password) throw new Error('DEV_ADMIN_EMAIL and DEV_ADMIN_PASSWORD are required for seed')

const passwordHash = await hash(password, { memoryCost: 19456, timeCost: 2, parallelism: 1, outputLen: 32 })

const admin = await sql`
  INSERT INTO users (name, email, phone, password_hash, role)
  VALUES ('Development Admin', ${email}, '+37100000000', ${passwordHash}, 'admin')
  ON CONFLICT (email) DO UPDATE SET role = 'admin'
  RETURNING id
`

const customer = await sql`
  INSERT INTO users (name, email, phone, password_hash, role)
  VALUES ('Test Customer', 'customer@example.test', '+37100000001', ${passwordHash}, 'customer')
  ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name
  RETURNING id
`

const customerId = customer[0].id
await sql`
  INSERT INTO cars (user_id, make, model, registration_number, category)
  VALUES (${customerId}, 'BMW', '3 Series', 'TEST-001', 'passenger')
  ON CONFLICT DO NOTHING
`

console.log(`Development seed complete for ${email}`)
console.log(`Development admin id: ${admin[0].id}`)
await sql.end()
