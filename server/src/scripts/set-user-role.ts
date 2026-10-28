// Changes an existing account's role. Signup always creates viewers; this is
// how someone with database access grants more:
//   npm run setup:role -- <email> <admin|operator|viewer>
import 'dotenv/config'
import { pool } from '../db.ts'

const ROLES = ['admin', 'operator', 'viewer']

async function main() {
  const [emailArg, role] = process.argv.slice(2)
  const email = emailArg?.trim().toLowerCase()

  if (!email || !role || !ROLES.includes(role)) {
    throw new Error('Usage: npm run setup:role -- <email> <admin|operator|viewer>')
  }

  const client = await pool.connect()

  try {
    await client.query('BEGIN')
    // Serialise role changes so two runs cannot both remove the last admin.
    await client.query('LOCK TABLE app_users IN SHARE ROW EXCLUSIVE MODE')

    const found = await client.query(
      'SELECT id, role FROM app_users WHERE lower(email) = $1',
      [email],
    )

    if (!found.rowCount) {
      throw new Error(`No account found for ${email}.`)
    }

    const current = found.rows[0].role

    if (current === role) {
      await client.query('ROLLBACK')
      console.log(`${email} already has the ${role} role; nothing changed.`)
      return
    }

    if (current === 'admin') {
      const admins = await client.query(
        "SELECT count(*)::int AS count FROM app_users WHERE role = 'admin' AND active = TRUE",
      )

      if (admins.rows[0].count <= 1) {
        throw new Error('Refusing to remove the last active administrator.')
      }
    }

    await client.query('UPDATE app_users SET role = $1 WHERE id = $2', [
      role,
      found.rows[0].id,
    ])
    await client.query('COMMIT')
    console.log(`${email}: ${current} -> ${role}. The change applies on the next request.`)
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    throw error
  } finally {
    client.release()
  }
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : 'Role change failed')
    process.exitCode = 1
  })
  .finally(async () => {
    await pool.end()
  })
