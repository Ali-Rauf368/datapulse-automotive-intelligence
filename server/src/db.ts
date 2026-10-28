import 'dotenv/config'
import { Pool } from 'pg'

// DATABASE_URL (e.g. Render's external database URL) takes precedence over
// the individual DB_* variables. It is parsed here rather than passed as a
// connection string so the SSL setting below always applies.
function connectionFromUrl(url: string) {
  const parsed = new URL(url)

  return {
    host: parsed.hostname,
    port: Number(parsed.port) || 5432,
    database: decodeURIComponent(parsed.pathname.slice(1)),
    user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
  }
}

const connection = process.env.DATABASE_URL
  ? connectionFromUrl(process.env.DATABASE_URL)
  : {
      host: process.env.DB_HOST || 'localhost',
      port: Number(process.env.DB_PORT) || 5432,
      database: process.env.DB_NAME || 'datapulse',
      user: process.env.DB_USER || 'datapulse_user',
      password: process.env.DB_PASSWORD,
    }

// Render's external hostnames require SSL; its internal ones do not.
const isRenderDatabase = connection.host.endsWith('.render.com')

export const pool = new Pool({
  ...connection,
  ...(isRenderDatabase ? { ssl: { rejectUnauthorized: false } } : {}),
})

pool.on('error', (error) => {
  console.error('Unexpected database connection error:', error.message)
})
