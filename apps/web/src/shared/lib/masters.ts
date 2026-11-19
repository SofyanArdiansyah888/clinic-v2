import type { FormField } from '@/shared/lib/form'
import type { Role } from '@/shared/lib/access'

/**
 * Master data that can be created from its admin page and, inline, from the
 * select pickers that load it. One definition keeps both forms identical.
 */
export type MasterDef = {
  endpoint: string
  /** First query-key segment; every list/select query of this master starts with it. */
  queryKey: string
  /** Lowercase noun used in labels, e.g. "Tambah pasien". */
  noun: string
  fields: FormField[]
  /** Roles the API lets create it (mirrors api/internal/middleware/rbac.go). */
  writers: Role[]
}

export const STAFF_JABATAN = [
  'Dokter Umum',
  'Dokter Spesialis',
  'Beautician',
  'Perawat',
  'Apoteker',
  'Front Office',
  'Admin',
] as const

export const MASTERS = {
  pasien: {
    endpoint: '/pasien',
    queryKey: 'pasien',
    noun: 'pasien',
    writers: ['admin', 'staff'],
    fields: [
      { name: 'nama', label: 'Nama Pasien', required: true },
      { name: 'no_telp', label: 'No. Telepon', type: 'tel' },
      { name: 'email', label: 'Email', type: 'email' },
      { name: 'alamat', label: 'Alamat', type: 'textarea' },
      {
        name: 'jenis_kelamin',
        label: 'Jenis Kelamin',
        type: 'select',
        options: [
          { label: 'Laki-laki', value: 'L' },
          { label: 'Perempuan', value: 'P' },
        ],
      },
      { name: 'tanggal_lahir', label: 'Tanggal Lahir', type: 'date' },
    ],
  },
  staff: {
    endpoint: '/staff',
    queryKey: 'staff',
    noun: 'staff',
    writers: ['admin'],
    fields: [
      { name: 'nama', label: 'Nama', required: true },
      {
        name: 'jabatan',
        label: 'Jabatan',
        type: 'select',
        options: STAFF_JABATAN.map((j) => ({ label: j, value: j })),
      },
      { name: 'no_telp', label: 'No. Telepon', type: 'tel' },
      { name: 'email', label: 'Email', type: 'email' },
    ],
  },
  treatment: {
    endpoint: '/treatment',
    queryKey: 'treatment',
    noun: 'treatment',
    writers: ['admin'],
    fields: [
      { name: 'nama', label: 'Nama Treatment', required: true },
      {
        name: 'kategori',
        label: 'Kategori',
        type: 'select',
        options: [
          { label: 'Facial & Skin Care', value: 'Skin Care' },
          { label: 'Laser & Light Therapy', value: 'Laser' },
          { label: 'Injeksi & Anti-Aging', value: 'Injeksi' },
          { label: 'Body Treatment & Slimming', value: 'Body' },
          { label: 'Konsultasi Medis', value: 'Konsultasi' },
          { label: 'Tindakan Bedah Ringan', value: 'Tindakan' },
          // Treatments in this category are sold as a package of sessions (see Sesi Paket).
          { label: 'Paket Perawatan', value: 'Paket' },
        ],
      },
      { name: 'harga', label: 'Harga (Rp)', type: 'currency', required: true },
      { name: 'durasi', label: 'Durasi (menit)', type: 'number', placeholder: '45' },
      { name: 'sesi_paket', label: 'Sesi Paket', type: 'number', placeholder: '5' },
      { name: 'komisi_dokter', label: 'Komisi Dokter (Rp)', type: 'currency', placeholder: '0' },
      { name: 'komisi_terapis', label: 'Komisi Terapis (Rp)', type: 'currency', placeholder: '0' },
      { name: 'deskripsi', label: 'Deskripsi', type: 'textarea' },
    ],
  },
  barang: {
    endpoint: '/barang',
    queryKey: 'barang',
    noun: 'barang',
    writers: ['admin', 'apoteker'],
    fields: [
      { name: 'nama', label: 'Nama', required: true },
      { name: 'kategori', label: 'Kategori' },
      { name: 'satuan', label: 'Satuan' },
      { name: 'harga_beli', label: 'Harga Beli', type: 'currency' },
      { name: 'harga_jual', label: 'Harga Jual', type: 'currency', required: true },
      { name: 'stok_minimal', label: 'Stok Minimal', type: 'number' },
      { name: 'stok_aktual', label: 'Stok Awal', type: 'number' },
      { name: 'lokasi_barang', label: 'Lokasi' },
    ],
  },
  supplier: {
    endpoint: '/supplier',
    queryKey: 'supplier',
    noun: 'supplier',
    writers: ['admin', 'apoteker'],
    fields: [
      { name: 'nama', label: 'Nama Supplier', required: true },
      { name: 'pic', label: 'Nama PIC' },
      { name: 'no_telp', label: 'No. Telepon', type: 'tel' },
      { name: 'email', label: 'Email', type: 'email' },
      { name: 'alamat', label: 'Alamat', type: 'textarea' },
    ],
  },
  bank: {
    endpoint: '/bank',
    queryKey: 'bank',
    noun: 'bank',
    writers: ['admin'],
    fields: [
      { name: 'nama', label: 'Nama Bank', required: true },
      { name: 'no_rekening', label: 'No. Rekening', required: true },
      { name: 'atas_nama', label: 'Atas Nama' },
    ],
  },
} satisfies Record<string, MasterDef>

export type MasterKey = keyof typeof MASTERS

export function canCreateMaster(role: string | undefined, key: MasterKey) {
  return (MASTERS[key].writers as readonly string[]).includes(role ?? '')
}
