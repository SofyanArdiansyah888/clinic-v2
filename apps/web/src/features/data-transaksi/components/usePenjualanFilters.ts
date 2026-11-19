import { useState } from 'react'
import { EMPTY_PERIODE, type Periode } from '@/shared/lib/listFilters'

/** Filter state for Data Penjualan, shared by the list and its overview cards. */
export function usePenjualanFilters() {
  const [periode, setPeriode] = useState<Periode>(EMPTY_PERIODE)
  const [status, setStatus] = useState('')
  const [pasienId, setPasienId] = useState('')
  const [search, setSearch] = useState('')
  const params = {
    dari: periode.dari || undefined,
    sampai: periode.sampai || undefined,
    status: status || undefined,
    pasien_id: pasienId || undefined,
  }
  return { periode, setPeriode, status, setStatus, pasienId, setPasienId, search, setSearch, params }
}

export type PenjualanFilters = ReturnType<typeof usePenjualanFilters>
