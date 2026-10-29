import { useState } from 'react'
import type { FormEvent } from 'react'
import { Activity, Eye, EyeOff, RefreshCw } from 'lucide-react'
import { API_URL, errorMessage, readJson, sendRequest } from '../lib/api.ts'
import { inputClass, labelClass } from '../constants.ts'
import type { LoginResponse, User } from '../types.ts'

type Props = {
  notice: string | null
  onAuthenticated: (token: string, user: User) => void
}

export function LoginScreen({ notice, onAuthenticated }: Props) {
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [noticeVisible, setNoticeVisible] = useState(true)
  const signup = mode === 'signup'

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setNoticeVisible(false)
    setSubmitting(true)

    try {
      const response = await sendRequest(`${API_URL}/auth/${signup ? 'register' : 'login'}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(signup ? { name: name.trim() } : {}),
          email: email.trim(),
          password,
        }),
      })

      const result = await readJson<LoginResponse>(response)

      if (
        !result.token ||
        !result.user ||
        typeof result.user.id !== 'string' ||
        typeof result.user.email !== 'string' ||
        !['admin', 'operator', 'viewer'].includes(result.user.role)
      ) {
        throw new Error('The login API returned an invalid response.')
      }

      onAuthenticated(result.token, result.user)
    } catch (caught) {
      setError(errorMessage(caught, 'Could not sign in.'))
      setSubmitting(false)
    }
  }

  function switchMode() {
    setMode(signup ? 'login' : 'signup')
    setError(null)
    setNoticeVisible(false)
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4 py-10">
      <section className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-7 shadow-2xl">
        <div className="mb-7 flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-cyan-400 text-slate-950">
            <Activity size={26} />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">DataPulse</h1>
            <p className="text-sm text-slate-500">Automotive Intelligence Platform</p>
          </div>
        </div>

        <h2 className="text-xl font-semibold">{signup ? 'Create your account' : 'Sign in'}</h2>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          {signup
            ? 'Create a DataPulse account to view inventory, sales and service analytics.'
            : 'Sign in with your DataPulse account to access inventory and analytics.'}
        </p>

        {notice && noticeVisible && (
          <p
            role="status"
            className="mt-5 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800"
          >
            {notice}
          </p>
        )}

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          {signup && (
            <div>
              <label htmlFor="signup-name" className={labelClass}>Name</label>
              <input
                id="signup-name"
                type="text"
                autoComplete="name"
                required
                maxLength={100}
                value={name}
                onChange={(event) => setName(event.target.value)}
                className={inputClass}
              />
            </div>
          )}

          <div>
            <label htmlFor="login-email" className={labelClass}>Email</label>
            <input
              id="login-email"
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className={inputClass}
            />
          </div>

          <div>
            <label htmlFor="login-password" className={labelClass}>Password</label>
            <div className="relative">
              <input
                id="login-password"
                type={showPassword ? 'text' : 'password'}
                autoComplete={signup ? 'new-password' : 'current-password'}
                required
                minLength={signup ? 6 : undefined}
                maxLength={72}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className={`${inputClass} pr-11`}
              />
              <button
                type="button"
                onClick={() => setShowPassword((visible) => !visible)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                className="absolute inset-y-0 right-0 flex items-center px-3 text-slate-400 hover:text-slate-600"
              >
                {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            </div>
            {signup && <p className="mt-1.5 text-xs text-slate-500">At least 6 characters.</p>}
          </div>

          {error && (
            <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting && <RefreshCw size={16} className="animate-spin" />}
            {submitting
              ? signup ? 'Creating account...' : 'Signing in...'
              : signup ? 'Create account' : 'Sign in'}
          </button>
        </form>

        <p className="mt-5 text-center text-sm text-slate-600">
          {signup ? 'Already have an account?' : 'New to DataPulse?'}{' '}
          <button
            type="button"
            onClick={switchMode}
            className="font-semibold text-cyan-700 hover:text-cyan-900"
          >
            {signup ? 'Sign in' : 'Create an account'}
          </button>
        </p>
        <p className="mt-3 text-center text-xs leading-5 text-slate-400">
          New accounts have standard viewer access.
        </p>
      </section>
    </main>
  )
}
