import { useCallback, useState } from 'react'
import { LoginScreen } from './components/LoginScreen.tsx'
import { Dashboard } from './components/Dashboard.tsx'
import { TOKEN_KEY, USER_KEY } from './constants.ts'
import type { User } from './types.ts'

function getStoredUser(): User | null {
  try {
    const raw = localStorage.getItem(USER_KEY)
    if (!raw) return null

    const user = JSON.parse(raw) as User

    if (
      typeof user.id !== 'string' ||
      typeof user.email !== 'string' ||
      !['admin', 'operator', 'viewer'].includes(user.role)
    ) {
      return null
    }

    return user
  } catch {
    return null
  }
}

// Owns the session; everything else lives in Dashboard, which is remounted
// for each session so no data outlives a sign-out.
function App() {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY))
  const [user, setUser] = useState<User | null>(getStoredUser)
  const [authNotice, setAuthNotice] = useState<string | null>(null)

  const signOut = useCallback((notice: string | null = null) => {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(USER_KEY)
    setToken(null)
    setUser(null)
    setAuthNotice(notice)
  }, [])

  const updateUser = useCallback((profile: User) => {
    setUser(profile)
    localStorage.setItem(USER_KEY, JSON.stringify(profile))
  }, [])

  function handleAuthenticated(newToken: string, profile: User) {
    localStorage.setItem(TOKEN_KEY, newToken)
    localStorage.setItem(USER_KEY, JSON.stringify(profile))
    setToken(newToken)
    setUser(profile)
    setAuthNotice(null)
  }

  if (!token || !user) {
    return <LoginScreen notice={authNotice} onAuthenticated={handleAuthenticated} />
  }

  return <Dashboard key={token} token={token} user={user} onUserChange={updateUser} onSignOut={signOut} />
}

export default App
