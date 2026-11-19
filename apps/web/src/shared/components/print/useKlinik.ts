import { useQuery } from '@tanstack/react-query'
import { apiGet } from '@/shared/api/client'
import { useCabangStore } from '@/shared/branch/store'

/** Clinic identity printed on letterheads, receipts and consents (Pengaturan Umum). */
export type Klinik = {
  nama?: string
  alamat?: string
  telepon?: string
  email?: string
  garansi?: string
  catatan_invoice?: string
  /** Active branch printed under the clinic name; its address and phone replace the clinic's. */
  cabang?: string
}

export function useKlinik() {
  const cabang = useCabangStore((s) => s.cabang)
  return useQuery({
    queryKey: ['pengaturan', 'klinik', 'kop', cabang],
    queryFn: () => apiGet<Klinik>('/pengaturan/klinik', { cabang: 'aktif' }),
    staleTime: 10 * 60_000,
  })
}
