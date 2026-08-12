import { create } from 'zustand'
import { apiPost, clearTokens, setTokens } from '@/shared/api/client'
import type { AuthUser, LoginResult } from '@/shared/types/api'

const USER_KEY = 'clinic_user'

function loadUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem(USER_KEY)
    return raw ? (JSON.parse(raw) as AuthUser) : null
  } catch {
    return null
  }
}

type AuthState = {
  user: AuthUser | null
  accessToken: string | null
  isAuthenticated: boolean
  login: (username: string, password: string) => Promise<void>
  logout: () => void
  hydrate: () => void
}

export const useAuthStore = create<AuthState>((set) => ({
  user: loadUser(),
  accessToken: localStorage.getItem('clinic_access_token'),
  isAuthenticated: Boolean(localStorage.getItem('clinic_access_token')),

  hydrate: () => {
    set({
      user: loadUser(),
      accessToken: localStorage.getItem('clinic_access_token'),
      isAuthenticated: Boolean(localStorage.getItem('clinic_access_token')),
    })
  },

  login: async (username, password) => {
    const res = await apiPost<LoginResult>('/auth/login', { username, password })
    if (!res.success || !res.data) {
      throw new Error(res.message || 'Login gagal')
    }
    setTokens(res.data.access_token, res.data.refresh_token)
    localStorage.setItem(USER_KEY, JSON.stringify(res.data.user))
    set({
      user: res.data.user,
      accessToken: res.data.access_token,
      isAuthenticated: true,
    })
  },

  logout: () => {
    clearTokens()
    localStorage.removeItem(USER_KEY)
    set({ user: null, accessToken: null, isAuthenticated: false })
  },
}))
