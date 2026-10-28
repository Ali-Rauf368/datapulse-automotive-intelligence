// Applies every SQL file in server/src/migrations in numeric order, each in
// its own transaction. The migrations use IF NOT EXISTS, so running this on
// every deploy is safe: npm run db:migrate
import 'dotenv/config'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { pool } from '../db.ts'

const migrationsDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../migrations',
)

async function main() {
  const files = readdirSync(migrationsDir)
    .filter((file) => file.endsWith('.sql'))
    .sort()

  for (const file of files) {
    const client = await pool.connect()

    try {
      await client.query('BEGIN')
      await client.query(readFileSync(path.join(migrationsDir, file), 'utf8'))
      await client.query('COMMIT')
      console.log(`Migration applied: ${file}`)
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {})
      throw new Error(
        `Migration ${file} failed: ${error instanceof Error ? error.message : 'unknown error'}`,
        { cause: error },
      )
    } finally {
      client.release()
    }
  }
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : 'Migration failed')
    process.exitCode = 1
  })
  .finally(async () => {
    await pool.end()
  })
