import { useQuery } from '@tanstack/react-query'
import { apiGet } from '@/shared/api/client'

/** Clinic identity printed on letterheads, receipts and consents (Pengaturan Umum). */
export type Klinik = {
  nama?: string
  alamat?: string
  telepon?: string
  email?: string
  garansi?: string
  catatan_invoice?: string
}

export function useKlinik() {
  return useQuery({
    queryKey: ['pengaturan', 'klinik'],
    queryFn: () => apiGet<Klinik>('/pengaturan/klinik'),
    staleTime: 10 * 60_000,
  })
}
