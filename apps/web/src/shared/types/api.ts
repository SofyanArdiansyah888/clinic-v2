export type PaginationMeta = {
  page: number
  per_page: number
  total: number
  total_pages: number
}

export type ApiResponse<T> = {
  success: boolean
  message?: string
  data: T
  meta?: PaginationMeta
  errors?: unknown
}

export type ListParams = {
  page?: number
  per_page?: number
  search?: string
}

export type AuthUser = {
  id: number
  name: string
  email: string
  username: string
  role: string
  is_active: boolean
}

export type LoginResult = {
  access_token: string
  refresh_token: string
  user: AuthUser
}

export type DashboardKpi = {
  revenue_today: number
  visits_today: number
  new_patients_today: number
  pending_queue: number
}
