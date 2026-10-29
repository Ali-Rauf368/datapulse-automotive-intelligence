import { execSync } from 'node:child_process'
import bcrypt from 'bcryptjs'
import pg from 'pg'
import { ADMIN, OPERATOR, PASSWORD } from './fixtures.ts'

// Prepares the test database: schema, demo data and two known accounts.
export default async function globalSetup() {
  execSync('npm run -s db:migrate', { stdio: 'inherit' })
  execSync('npm run -s seed:demo', { stdio: 'inherit' })

  const client = new pg.Client(
    process.env.DATABASE_URL
      ? { connectionString: process.env.DATABASE_URL }
      : {
          host: process.env.DB_HOST,
          port: Number(process.env.DB_PORT) || 5432,
          database: process.env.DB_NAME,
          user: process.env.DB_USER,
          password: process.env.DB_PASSWORD,
        },
  )
  await client.connect()

  try {
    const hash = await bcrypt.hash(PASSWORD, 4)
    for (const [user, role] of [[ADMIN, 'admin'], [OPERATOR, 'operator']] as const) {
      await client.query(
        `INSERT INTO app_users (email, password_hash, role, name, active)
         VALUES ($1, $2, $3, $4, TRUE)
         ON CONFLICT (email) DO UPDATE
           SET password_hash = EXCLUDED.password_hash, role = EXCLUDED.role,
               name = EXCLUDED.name, active = TRUE`,
        [user.email, hash, role, user.name],
      )
    }
  } finally {
    await client.end()
  }
}
