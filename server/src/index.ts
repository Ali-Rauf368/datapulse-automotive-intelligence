import 'dotenv/config'
import { pathToFileURL } from 'node:url'
import { app } from './app.ts'
import { pool } from './db.ts'
import { assertJwtSecret } from './auth/auth.ts'
import { logError } from './lib/http.ts'

export { app }

const PORT = Number(process.env.PORT) || 3000

// Each entry is [table, column, migration that creates it].
const REQUIRED_SCHEMA: Array<[string, string, string]> = [
  ['vehicles', 'status', '000_base_schema.sql'],
  ['sales_events', 'amount', '001_analytics_auth.sql'],
  ['service_events', 'status', '001_analytics_auth.sql'],
  ['app_users', 'password_hash', '001_analytics_auth.sql'],
  ['api_credentials', 'token_hash', '001_analytics_auth.sql'],
  ['nifi_request_logs', 'outcome', '001_analytics_auth.sql'],
  ['app_users', 'name', '002_user_signup.sql'],
]

// Startup diagnostics: reports database reachability and missing migrations
// without exposing connection details.
async function checkDatabase(): Promise<void> {
  try {
    const result = await pool.query(
      `SELECT table_name, column_name
       FROM information_schema.columns
       WHERE table_schema = current_schema()`,
    )
    const present = new Set(
      result.rows.map((row) => `${row.table_name}.${row.column_name}`),
    )
    const missing = REQUIRED_SCHEMA.filter(
      ([table, column]) => !present.has(`${table}.${column}`),
    )

    if (missing.length === 0) {
      console.log('Database connected; schema is up to date')
      return
    }

    for (const [table, column, migration] of missing) {
      console.warn(
        `Database schema is missing ${table}.${column}: apply server/src/migrations/${migration}`,
      )
    }
  } catch (error) {
    logError(
      'Database unavailable at startup (GET /api/health/db reports its status):',
      error,
    )
  }
}

const isMainModule = process.argv[1]
  ? import.meta.url === pathToFileURL(process.argv[1]).href
  : false

if (isMainModule) {
  try {
    assertJwtSecret()
  } catch (error) {
    logError('DataPulse API cannot start:', error)
    process.exit(1)
  }

  app.listen(PORT, () => {
    console.log(`DataPulse API running at http://localhost:${PORT}`)
    void checkDatabase()
  })
}
