import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios'
import type { ApiResponse } from '@/shared/types/api'

const ACCESS_KEY = 'clinic_access_token'
const REFRESH_KEY = 'clinic_refresh_token'

export function getAccessToken() {
  return localStorage.getItem(ACCESS_KEY)
}

export function getRefreshToken() {
  return localStorage.getItem(REFRESH_KEY)
}

export function setTokens(access: string, refresh: string) {
  localStorage.setItem(ACCESS_KEY, access)
  localStorage.setItem(REFRESH_KEY, refresh)
}

export function clearTokens() {
  localStorage.removeItem(ACCESS_KEY)
  localStorage.removeItem(REFRESH_KEY)
}

export const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
})

api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = getAccessToken()
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

function friendlyMessage(error: AxiosError) {
  const serverMessage = (error.response?.data as { message?: string } | undefined)?.message
  if (serverMessage) return serverMessage
  const status = error.response?.status
  if (!error.response || status === 502 || status === 503 || status === 504) {
    return 'Server tidak dapat dihubungi. Periksa koneksi lalu coba lagi.'
  }
  if (status === 401) return 'Sesi Anda berakhir. Silakan masuk kembali.'
  if (status === 403) return 'Anda tidak memiliki akses untuk tindakan ini.'
  if (status === 404) return 'Data tidak ditemukan.'
  if (status && status >= 500) return 'Terjadi kesalahan pada server. Coba lagi beberapa saat.'
  return 'Permintaan gagal diproses. Periksa kembali data yang diisi.'
}

let refreshPromise:Promise<string | null> | null = null

async function refreshAccessToken() {
  const refresh = getRefreshToken()
  if (!refresh) return null
  try {
    const { data } = await axios.post<ApiResponse<{ access_token: string; refresh_token: string }>>(
      '/api/auth/refresh',
      { refresh_token: refresh },
    )
    if (data.success && data.data) {
      setTokens(data.data.access_token, data.data.refresh_token)
      return data.data.access_token
    }
  } catch {
    clearTokens()
  }
  return null
}

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    // Many screens show `err.message` directly; replace axios' technical text
    // ("Request failed with status code 502") with something staff can act on.
    error.message = friendlyMessage(error)
    const original = error.config as (InternalAxiosRequestConfig & { _retry?: boolean }) | undefined
    if (!original || error.response?.status !== 401 || original._retry) {
      return Promise.reject(error)
    }
    if (original.url?.includes('/auth/login') || original.url?.includes('/auth/refresh')) {
      return Promise.reject(error)
    }
    original._retry = true
    refreshPromise ??= refreshAccessToken().finally(() => {
      refreshPromise = null
    })
    const token = await refreshPromise
    if (!token) {
      clearTokens()
      if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
        window.location.href = '/login'
      }
      return Promise.reject(error)
    }
    original.headers.Authorization = `Bearer ${token}`
    return api(original)
  },
)

export async function apiGet<T>(url: string, params?: Record<string, unknown>) {
  const { data } = await api.get<ApiResponse<T>>(url, { params })
  return data
}

export async function apiPost<T>(url: string, body?: unknown) {
  const { data } = await api.post<ApiResponse<T>>(url, body)
  return data
}

export async function apiPut<T>(url: string, body?: unknown) {
  const { data } = await api.put<ApiResponse<T>>(url, body)
  return data
}

export async function apiPatch<T>(url: string, body?: unknown) {
  const { data } = await api.patch<ApiResponse<T>>(url, body)
  return data
}

export async function apiDelete<T>(url: string) {
  const { data } = await api.delete<ApiResponse<T>>(url)
  return data
}
