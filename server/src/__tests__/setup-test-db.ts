import 'dotenv/config'
import { randomBytes } from 'node:crypto'

// The suites create and delete rows, so they must never run against the
// application database. TEST_DB_* variables override the matching DB_*
// values, and the database name has to end in "_test". With no override,
// "<DB_NAME>_test" on the configured server is used. DATABASE_URL would
// bypass these checks, so tests never use it.
delete process.env.DATABASE_URL

for (const key of ['HOST', 'PORT', 'USER', 'PASSWORD']) {
  const override = process.env[`TEST_DB_${key}`]

  if (override !== undefined) {
    process.env[`DB_${key}`] = override
  }
}

const configuredName = process.env.DB_NAME || 'datapulse'
const testDatabase =
  process.env.TEST_DB_NAME ??
  (configuredName.endsWith('_test') ? configuredName : `${configuredName}_test`)

if (!testDatabase.endsWith('_test')) {
  throw new Error(
    `Refusing to run tests against database "${testDatabase}": test database names must end in "_test".`,
  )
}

process.env.DB_NAME = testDatabase

// Tests sign their own tokens; the real signing secret is never used.
process.env.JWT_SECRET = randomBytes(32).toString('hex')
