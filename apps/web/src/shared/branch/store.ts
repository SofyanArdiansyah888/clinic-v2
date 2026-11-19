import { create } from 'zustand'
import { getCabang, setCabang } from '@/shared/api/client'

// The active branch, mirrored from localStorage so components re-render when it changes.
// The API client sends it as X-Cabang-ID on every request.
type CabangStore = {
  cabang: string | null
  setCabang: (value: string | null) => void
}

export const useCabangStore = create<CabangStore>((set) => ({
  cabang: getCabang(),
  setCabang: (value) => {
    setCabang(value)
    set({ cabang: value })
  },
}))

export type CabangAkses = {
  cabangs: { id: number; kode: string; nama: string; singkatan: string; is_utama: boolean }[]
  aktif_id: number
  semua: boolean
  bisa_semua: boolean
}
