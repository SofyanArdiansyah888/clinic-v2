import { useState } from 'react'
import { CalendarDays, UsersRound } from 'lucide-react'
import { ResourceListPage, type FormField } from '@/shared/components/ResourceListPage'
import { StatusBadge } from '@/shared/components/StatusBadge'
import type { Column } from '@/shared/components/DataTable'

type Staff = {
  id: number
  kode: string
  nama: string
  jabatan?: string
  no_telp?: string
  email?: string
  is_active: boolean
}

type JadwalDokter = {
  id: number
  dokter_nama: string
  hari: string
  jam_mulai: string
  jam_selesai: string
  is_active: boolean
}

const staffColumns: Column<Staff>[] = [
  { key: 'kode', header: 'Kode', cell: (r) => <span className="font-mono font-bold text-teal-700">{r.kode}</span> },
  { key: 'nama', header: 'Nama Staff / Dokter', cell: (r) => <span className="font-bold text-slate-900">{r.nama}</span> },
  { key: 'jabatan', header: 'Jabatan / Peran', cell: (r) => r.jabatan || '-' },
  { key: 'no_telp', header: 'No. Telp', cell: (r) => <span className="font-mono">{r.no_telp || '-'}</span> },
  { key: 'email', header: 'Email', cell: (r) => r.email || '-' },
  { key: 'status', header: 'Status', cell: (r) => <StatusBadge status={r.is_active} /> },
]

const staffFields: FormField[] = [
  { name: 'nama', label: 'Nama Staff / Dokter', required: true },
  {
    name: 'jabatan',
    label: 'Jabatan / Peran',
    type: 'select',
    options: [
      { label: 'Dokter Umum', value: 'Dokter Umum' },
      { label: 'Dokter Spesialis / Aesthetic', value: 'Dokter Spesialis' },
      { label: 'Beautician / Terapis', value: 'Beautician' },
      { label: 'Perawat', value: 'Perawat' },
      { label: 'Apoteker', value: 'Apoteker' },
      { label: 'Front Office / Kasir', value: 'Front Office' },
      { label: 'Admin Operasional', value: 'Admin' },
    ],
  },
  { name: 'no_telp', label: 'No. Telepon', type: 'tel' },
  { name: 'email', label: 'Email', type: 'email' },
]

const jadwalColumns: Column<JadwalDokter>[] = [
  { key: 'dokter_nama', header: 'Nama Dokter', cell: (r) => <span className="font-bold text-slate-900">{r.dokter_nama}</span> },
  { key: 'hari', header: 'Hari Praktek', cell: (r) => <span className="font-semibold text-teal-800">{r.hari}</span> },
  { key: 'jam', header: 'Jam Operasional', cell: (r) => <span className="font-mono">{r.jam_mulai} - {r.jam_selesai}</span> },
  { key: 'status', header: 'Status', cell: (r) => <StatusBadge status={r.is_active} /> },
]

const jadwalFields: FormField[] = [
  { name: 'dokter_nama', label: 'Nama Dokter', required: true },
  {
    name: 'hari',
    label: 'Hari',
    type: 'select',
    options: [
      { label: 'Senin', value: 'Senin' },
      { label: 'Selasa', value: 'Selasa' },
      { label: 'Rabu', value: 'Rabu' },
      { label: 'Kamis', value: 'Kamis' },
      { label: 'Jumat', value: 'Jumat' },
      { label: 'Sabtu', value: 'Sabtu' },
      { label: 'Minggu', value: 'Minggu' },
    ],
  },
  { name: 'jam_mulai', label: 'Jam Mulai (HH:MM)', placeholder: '09:00', required: true },
  { name: 'jam_selesai', label: 'Jam Selesai (HH:MM)', placeholder: '17:00', required: true },
]

export function StaffPage() {
  const [activeTab, setActiveTab] = useState<'staff' | 'jadwal'>('staff')

  return (
    <div>
      <div className="flex border-b border-slate-200 bg-white px-4 pt-2">
        <button
          type="button"
          onClick={() => setActiveTab('staff')}
          className={`flex items-center gap-2 border-b-2 px-4 py-3 text-xs font-bold transition-colors ${
            activeTab === 'staff'
              ? 'border-teal-600 text-teal-700'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <UsersRound className="h-4 w-4" />
          Data Staff & Dokter
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('jadwal')}
          className={`flex items-center gap-2 border-b-2 px-4 py-3 text-xs font-bold transition-colors ${
            activeTab === 'jadwal'
              ? 'border-teal-600 text-teal-700'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <CalendarDays className="h-4 w-4" />
          Jadwal Dokter Praktek
        </button>
      </div>

      <div className="mt-4">
        {activeTab === 'staff' && (
          <ResourceListPage<Staff>
            title="Staff & Dokter"
            description="Master data tenaga medis, perawat, beautician, dan staf klinik"
            endpoint="/staff"
            queryKey="staff"
            columns={staffColumns}
            createLabel="Tambah Staff / Dokter"
            createFields={staffFields}
            editFields={staffFields}
          />
        )}

        {activeTab === 'jadwal' && (
          <ResourceListPage<JadwalDokter>
            title="Jadwal Dokter Praktek"
            description="Pengaturan jadwal jam kerja dan hari praktek dokter"
            endpoint="/jadwal-dokter"
            queryKey="jadwal-dokter"
            columns={jadwalColumns}
            createLabel="Tambah Jadwal"
            createFields={jadwalFields}
            editFields={jadwalFields}
          />
        )}
      </div>
    </div>
  )
}
