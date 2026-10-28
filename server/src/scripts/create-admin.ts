import 'dotenv/config'
import bcrypt from 'bcryptjs'
import { createInterface, emitKeypressEvents } from 'node:readline'
import { stdin, stdout } from 'node:process'
import { pool } from '../db.ts'

function ask(question: string): Promise<string> {
  const rl = createInterface({ input: stdin, output: stdout })

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close()
      resolve(answer.trim())
    })
  })
}

function askSecret(question: string): Promise<string> {
  if (!stdin.isTTY || typeof stdin.setRawMode !== 'function') {
    return Promise.reject(
      new Error('Run this command directly in an interactive terminal.'),
    )
  }

  return new Promise((resolve, reject) => {
    stdout.write(question)
    emitKeypressEvents(stdin)

    const wasRaw = stdin.isRaw
    let password = ''
    let settled = false

    const cleanup = () => {
      stdin.removeListener('keypress', onKeypress)
      stdin.setRawMode(wasRaw ?? false)
      stdin.pause()
      stdout.write('\n')
    }

    const onKeypress = (
      character: string,
      key?: { name?: string; ctrl?: boolean; meta?: boolean },
    ) => {
      if (settled) return

      if (key?.ctrl && key.name === 'c') {
        settled = true
        cleanup()
        reject(new Error('Admin setup cancelled.'))
        return
      }

      if (key?.name === 'return' || key?.name === 'enter') {
        settled = true
        cleanup()
        resolve(password)
        return
      }

      if (key?.name === 'backspace') {
        password = password.slice(0, -1)
        return
      }

      if (
        character &&
        !key?.ctrl &&
        !key?.meta &&
        character.length === 1
      ) {
        password += character
      }
    }

    stdin.setRawMode(true)
    stdin.resume()
    stdin.on('keypress', onKeypress)
  })
}

async function main() {
  if (!stdin.isTTY || !stdout.isTTY) {
    throw new Error(
      'Admin setup requires an interactive terminal so the password can be entered securely.',
    )
  }

  const email = (await ask('Admin email: ')).trim().toLowerCase()

  if (
    email.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  ) {
    throw new Error('Enter a valid email address.')
  }

  const password = await askSecret(
    'Admin password (minimum 12 characters; input hidden): ',
  )

  const passwordBytes = Buffer.byteLength(password, 'utf8')

  if (passwordBytes < 12 || passwordBytes > 72) {
    throw new Error(
      'Password must be between 12 and 72 UTF-8 bytes.',
    )
  }

  const confirmation = await askSecret('Confirm admin password: ')

  if (password !== confirmation) {
    throw new Error('Passwords do not match.')
  }

  // Serialize initial-admin creation so two setup processes cannot both
  // pass the "no admin exists" check at the same time.
  const client = await pool.connect()

  try {
    await client.query('BEGIN')
    await client.query(
      'LOCK TABLE app_users IN SHARE ROW EXCLUSIVE MODE',
    )

    const existing = await client.query(
      "SELECT 1 FROM app_users WHERE role = 'admin' LIMIT 1",
    )

    if (existing.rowCount) {
      throw new Error('An admin already exists; no account was changed.')
    }

    const passwordHash = await bcrypt.hash(password, 12)

    await client.query(
      `INSERT INTO app_users (email, password_hash, role)
       VALUES ($1, $2, 'admin')`,
      [email, passwordHash],
    )

    await client.query('COMMIT')
    console.log('Initial admin account created successfully.')
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

main()
  .catch((error: unknown) => {
    console.error(
      error instanceof Error ? error.message : 'Admin setup failed',
    )
    process.exitCode = 1
  })
  .finally(async () => {
    await pool.end()
  })
