import 'dotenv/config'
import { createMachineCredential } from '../auth/auth.ts'
import { pool } from '../db.ts'

async function main() {
  const name =
    process.env.NIFI_CREDENTIAL_NAME?.trim() ||
    'NiFi vehicle ingestion'

  if (!name || name.length > 100) {
    throw new Error(
      'Credential name must be between 1 and 100 characters.',
    )
  }

  const existing = await pool.query(
    `SELECT 1
     FROM api_credentials
     WHERE lower(name) = lower($1) AND active = TRUE
     LIMIT 1`,
    [name],
  )

  if (existing.rowCount) {
    throw new Error(
      `An active credential named "${name}" already exists. ` +
        'Choose a different NIFI_CREDENTIAL_NAME or deactivate the old credential first.',
    )
  }

  const token = await createMachineCredential(name, 'operator')

  console.log(
    'NiFi credential created. Copy this token now; it will not be shown again:',
  )
  console.log(token)
  console.log(
    'Store it securely and configure it as the Authorization: Bearer token in NiFi. ' +
      'Do not commit it or include it in logs.',
  )
}

main()
  .catch((error: unknown) => {
    console.error(
      error instanceof Error
        ? error.message
        : 'Credential creation failed',
    )
    process.exitCode = 1
  })
  .finally(async () => {
    await pool.end()
  })
