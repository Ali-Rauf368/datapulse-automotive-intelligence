// Runs the test suite against a throwaway PostgreSQL cluster in a temporary
// directory, so tests never touch a real database and need no setup beyond
// the PostgreSQL server binaries (initdb and pg_ctl). Extra arguments are
// passed to vitest, e.g. `npm run test:isolated -- workflows`.
import { spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
const migrationsDir = path.join(root, 'server/src/migrations')
const user = 'datapulse_test'
const database = 'datapulse_test'

function findPgBinDir(): string {
  const candidates = [
    process.env.PG_BIN_DIR,
    ...(process.env.PATH ?? '').split(path.delimiter),
    // Debian/Ubuntu keep the server binaries in versioned directories.
    ...(existsSync('/usr/lib/postgresql')
      ? readdirSync('/usr/lib/postgresql')
          .sort((a, b) => Number(b) - Number(a))
          .map((version) => `/usr/lib/postgresql/${version}/bin`)
      : []),
  ].filter((dir): dir is string => Boolean(dir))

  const found = candidates.find(
    (dir) => existsSync(path.join(dir, 'initdb')) && existsSync(path.join(dir, 'pg_ctl')),
  )

  if (!found) {
    throw new Error(
      'Could not find initdb and pg_ctl. Install the PostgreSQL server package or set PG_BIN_DIR.',
    )
  }

  return found
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      const port = typeof address === 'object' && address ? address.port : 0
      server.close(() => resolve(port))
    })
  })
}

function run(command: string, args: string[]): void {
  const result = spawnSync(command, args, { encoding: 'utf8' })

  if (result.status !== 0) {
    throw new Error(
      `${path.basename(command)} failed:\n${result.stderr || result.stdout}`,
    )
  }
}

async function main(): Promise<number> {
  const binDir = findPgBinDir()
  const workDir = mkdtempSync(path.join(tmpdir(), 'datapulse-test-'))
  const dataDir = path.join(workDir, 'data')
  const password = randomBytes(24).toString('hex')
  const port = await freePort()
  let started = false

  try {
    const passwordFile = path.join(workDir, 'pw')
    writeFileSync(passwordFile, password, { mode: 0o600 })

    run(path.join(binDir, 'initdb'), [
      '-D', dataDir, '-U', user, '-E', 'UTF8',
      '--auth-host=scram-sha-256', '--auth-local=reject',
      `--pwfile=${passwordFile}`,
    ])
    // Loopback TCP only; no Unix socket.
    run(path.join(binDir, 'pg_ctl'), [
      '-D', dataDir, '-l', path.join(workDir, 'server.log'), '-w',
      '-o', `-c listen_addresses=127.0.0.1 -p ${port} -c unix_socket_directories=''`,
      'start',
    ])
    started = true

    const connection = { host: '127.0.0.1', port, user, password }
    const admin = new pg.Client({ ...connection, database: 'postgres' })
    await admin.connect()
    await admin.query(`CREATE DATABASE ${database}`)
    await admin.end()

    const client = new pg.Client({ ...connection, database })
    await client.connect()
    for (const file of readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort()) {
      await client.query(readFileSync(path.join(migrationsDir, file), 'utf8'))
    }
    await client.end()

    console.log(`Disposable PostgreSQL ready on 127.0.0.1:${port}; running tests…\n`)

    // --e2e runs the Playwright browser suite (which starts the API itself and
    // reads DB_*); otherwise the Vitest API suite (which reads TEST_DB_*).
    const [first, ...rest] = process.argv.slice(2)
    const e2e = first === '--e2e'
    const runner = spawnSync(
      path.join(root, 'node_modules/.bin', e2e ? 'playwright' : 'vitest'),
      e2e ? ['test', ...rest] : ['run', ...process.argv.slice(2)],
      {
        cwd: root,
        stdio: 'inherit',
        env: {
          ...process.env,
          ...(e2e
            ? { DB_HOST: '127.0.0.1', DB_PORT: String(port), DB_NAME: database, DB_USER: user, DB_PASSWORD: password }
            : {
                TEST_DB_HOST: '127.0.0.1',
                TEST_DB_PORT: String(port),
                TEST_DB_NAME: database,
                TEST_DB_USER: user,
                TEST_DB_PASSWORD: password,
              }),
        },
      },
    )

    return runner.status ?? 1
  } finally {
    if (started) {
      spawnSync(path.join(binDir, 'pg_ctl'), ['-D', dataDir, '-m', 'fast', 'stop'], {
        stdio: 'ignore',
      })
    }
    rmSync(workDir, { recursive: true, force: true })
  }
}

main()
  .then((code) => {
    process.exitCode = code
  })
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
