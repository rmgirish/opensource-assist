import { create } from 'zustand'
import { clearToken, fetchProfile, getStoredToken, storeToken, type UserProfile } from '@/lib/auth-api'

export interface User {
  /** Server-side UUID. */
  id: string
  email: string
  /** Derived from the email local-part; used as the display name. */
  username: string
}

interface AuthState {
  /** null = logged out. */
  user: User | null
  /** True while a stored token is being validated against /auth/me. */
  status: 'idle' | 'loading'
  setSession: (token: string, profile: UserProfile) => void
  /** Validate a persisted token after refresh; safe to call on every mount. */
  hydrate: () => Promise<void>
  logout: () => void
}

function toUser(profile: UserProfile): User {
  return {
    id: profile.id,
    email: profile.email,
    username: profile.email.split('@')[0] || 'contributor',
  }
}

function loadPersistedUser(): User | null {
  try {
    const raw = localStorage.getItem('osa-user')
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<User>
    if (typeof parsed.id === 'string' && typeof parsed.email === 'string') {
      return { id: parsed.id, email: parsed.email, username: parsed.email.split('@')[0] || 'contributor' }
    }
  } catch {
    // localStorage unavailable or corrupt: treat as logged out
  }
  return null
}

function persistUser(user: User | null) {
  try {
    if (user) localStorage.setItem('osa-user', JSON.stringify(user))
    else localStorage.removeItem('osa-user')
  } catch {
    // localStorage unavailable: session stays in memory only
  }
}

/**
 * Session store backed by the real auth API.
 * The JWT lives in localStorage ('osa-token' via auth-api); the user profile
 * is persisted only as a cache and re-validated against /auth/me on refresh.
 */
export const useAuthStore = create<AuthState>((set, get) => ({
  user: loadPersistedUser(),
  status: getStoredToken() ? 'loading' : 'idle',

  setSession: (token, profile) => {
    storeToken(token)
    const user = toUser(profile)
    persistUser(user)
    set({ user, status: 'idle' })
  },

  hydrate: async () => {
    if (!getStoredToken() || get().status === 'loading') {
      if (!getStoredToken()) set({ status: 'idle' })
      return
    }
    set({ status: 'loading' })
    try {
      const profile = await fetchProfile()
      const user = toUser(profile)
      persistUser(user)
      set({ user, status: 'idle' })
    } catch {
      clearToken()
      persistUser(null)
      set({ user: null, status: 'idle' })
    }
  },

  logout: () => {
    clearToken()
    persistUser(null)
    set({ user: null, status: 'idle' })
  },
}))
