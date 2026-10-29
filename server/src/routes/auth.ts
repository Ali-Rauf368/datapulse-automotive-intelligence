import { Router } from 'express'
import { pool } from '../db.ts'
import { authenticate, login, register, requireHuman } from '../auth/auth.ts'
import { isUniqueViolation, logError } from '../lib/http.ts'
import { clientIp, rateLimit } from '../lib/rate-limit.ts'

export const authRouter = Router()

const FIFTEEN_MINUTES = 15 * 60 * 1000

// Ten failed sign-ins per address and account in 15 minutes; successful
// sign-ins do not count.
const loginLimiter = rateLimit({
  windowMs: FIFTEEN_MINUTES,
  max: 10,
  countStatuses: [401],
  message: 'Too many failed sign-in attempts. Please try again in 15 minutes.',
  key: (req) =>
    `${clientIp(req)}|${String(req.body?.email ?? '').trim().toLowerCase()}`,
})

const signupLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  message: 'Too many accounts created from this address. Please try again later.',
  key: clientIp,
})

authRouter.post('/login', loginLimiter, async (req, res) => {
  const { email, password } = req.body ?? {}

  if (
    typeof email !== 'string' ||
    typeof password !== 'string' ||
    !email.trim() ||
    !password ||
    password.length > 200
  ) {
    res.status(400).json({ error: 'Email and password are required' })
    return
  }

  try {
    const result = await login(email, password)

    if (!result) {
      res.status(401).json({ error: 'Invalid email or password' })
      return
    }

    res.json(result)
  } catch (error) {
    logError('Login failed:', error)
    res.status(500).json({ error: 'Unable to log in' })
  }
})

// New accounts always receive viewer permissions.
authRouter.post('/register', signupLimiter, async (req, res) => {
  const { name, email, password } = req.body ?? {}

  if (
    typeof name !== 'string' ||
    typeof email !== 'string' ||
    typeof password !== 'string'
  ) {
    res.status(400).json({ error: 'Name, email, and password are required' })
    return
  }

  try {
    const result = await register(name, email, password)
    res.status(201).json(result)
  } catch (error) {
    if (isUniqueViolation(error)) {
      res.status(409).json({ error: 'An account with this email already exists' })
      return
    }
    if (error instanceof Error && (
      error.message.startsWith('Enter a name') ||
      error.message.startsWith('Enter a valid email') ||
      error.message.startsWith('Password must')
    )) {
      res.status(400).json({ error: error.message })
      return
    }
    logError('Signup failed:', error)
    res.status(500).json({ error: 'Unable to create account' })
  }
})

// Current user's profile. Lets the dashboard confirm a stored session and
// pick up name or role changes made since sign-in.
authRouter.get('/me', authenticate, requireHuman, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, email, name, role
       FROM app_users
       WHERE id = $1 AND active = TRUE`,
      [req.auth?.id],
    )

    if (result.rows.length === 0) {
      res.status(401).json({ error: 'Account is inactive or unavailable' })
      return
    }

    const user = result.rows[0]
    res.json({
      id: String(user.id),
      email: String(user.email),
      name: String(user.name),
      role: user.role,
    })
  } catch (error) {
    logError('Failed to load current user:', error)
    res.status(500).json({ error: 'Unable to load your account' })
  }
})
