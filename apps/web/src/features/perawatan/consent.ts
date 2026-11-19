import { apiPost } from '@/shared/api/client'
import { uploadImage } from '@/shared/api/upload'

export type PerawatanConsent = {
  id: number
  perawatan_id: number
  pasien_id: number
  template_id?: number | null
  judul: string
  isi: string
  nama_penandatangan: string
  hubungan: string
  ttd_pasien_url: string
  dokter_id?: number | null
  ttd_dokter_url?: string
  saksi?: string
  signed_at: string
  status: 'aktif' | 'dibatalkan'
  alasan_batal?: string
  dibatalkan_at?: string | null
  pasien?: { id: number; nama?: string; kode?: string; tanggal_lahir?: string | null; alamat?: string }
  dokter?: { id: number; nama?: string } | null
  perawatan?: { id: number; kode?: string; tanggal?: string }
}

export type ConsentBody = {
  template_id: number
  nama_penandatangan: string
  hubungan: string
  ttd_pasien_url: string
  dokter_id?: number | null
  ttd_dokter_url?: string
  saksi?: string
}

/** A consent signed before the perawatan exists; posted once the perawatan has an id. */
export type PendingConsent = {
  key: string
  judul: string
  body: ConsentBody
}

export const HUBUNGAN_OPTIONS = ['Pasien sendiri', 'Orang tua', 'Suami / Istri', 'Anak', 'Wali', 'Keluarga lain']

/** Uploads a drawn signature as a PNG and returns its URL. */
export async function uploadSignature(blob: Blob, nama: string) {
  const file = new File([blob], `ttd-${nama.replace(/[^a-z0-9]+/gi, '-').toLowerCase() || 'consent'}.png`, { type: 'image/png' })
  const res = await uploadImage(file, 'ttd-consent')
  return res.url
}

export function postConsent(perawatanId: number, body: ConsentBody) {
  return apiPost<PerawatanConsent>(`/perawatan/${perawatanId}/consent`, body)
}

/** Saves consents signed on a new perawatan; returns how many failed. */
export async function savePendingConsents(perawatanId: number, pending: PendingConsent[]) {
  let failed = 0
  for (const p of pending) {
    try {
      await postConsent(perawatanId, p.body)
    } catch {
      failed++
    }
  }
  return failed
}

/** Client-side preview of the server's placeholder filling; the server's snapshot is what counts. */
export function previewIsi(isi: string, vals: Record<string, string | undefined>) {
  return isi.replace(/\{(nama_pasien|kode_pasien|tanggal|nama_dokter|treatment)\}/g, (m, key: string) => vals[key] || m)
}
