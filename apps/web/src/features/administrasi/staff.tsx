import { useState } from 'react'
import { CalendarDays, UsersRound } from 'lucide-react'
import { ResourceListPage, type FormField } from '@/shared/components/ResourceListPage'
import { MASTERS } from '@/shared/lib/masters'
import { Tabs } from '@/shared/ui/tabs'
import { StatusBadge } from '@/shared/components/StatusBadge'
import type { Column } from '@/shared/components/DataTable'
import { CabangBadges } from '@/shared/components/CabangBadges'

type Staff = {
  id: number
  kode: string
  nama: string
  jabatan?: string
  no_telp?: string
  email?: string
  is_active: boolean
  cabang_ids?: number[]
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
  { key: 'kode', header: 'Kode', cell: (r) => <span className="font-mono font-bold text-rose-700">{r.kode}</span> },
  { key: 'nama', header: 'Nama', cell: (r) => <span className="font-bold text-slate-900">{r.nama}</span> },
  { key: 'jabatan', header: 'Jabatan', cell: (r) => r.jabatan || '-' },
  { key: 'no_telp', header: 'No. Telp', cell: (r) => <span className="font-mono">{r.no_telp || '-'}</span> },
  { key: 'email', header: 'Email', cell: (r) => r.email || '-' },
  { key: 'cabang', header: 'Cabang', cell: (r) => <CabangBadges ids={r.cabang_ids} /> },
  { key: 'status', header: 'Status', cell: (r) => <StatusBadge status={r.is_active} /> },
]

const staffFields = MASTERS.staff.fields

const jadwalColumns: Column<JadwalDokter>[] = [
  { key: 'dokter_nama', header: 'Nama Dokter', cell: (r) => <span className="font-bold text-slate-900">{r.dokter_nama}</span> },
  { key: 'hari', header: 'Hari', cell: (r) => <span className="font-semibold text-rose-800">{r.hari}</span> },
  { key: 'jam', header: 'Jam', cell: (r) => <span className="font-mono">{r.jam_mulai} - {r.jam_selesai}</span> },
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
  { name: 'jam_mulai', label: 'Jam Mulai', placeholder: '09:00', required: true },
  { name: 'jam_selesai', label: 'Jam Selesai', placeholder: '17:00', required: true },
]

export function StaffPage() {
  const [activeTab, setActiveTab] = useState<'staff' | 'jadwal'>('staff')

  return (
    <div className="space-y-6">
      <Tabs
        value={activeTab}
        onChange={setActiveTab}
        items={[
          { value: 'staff', label: 'Staff', icon: <UsersRound /> },
          { value: 'jadwal', label: 'Jadwal Dokter', icon: <CalendarDays /> },
        ]}
      />

      <div>
        {activeTab === 'staff' && (
          <ResourceListPage<Staff>
            title="Staff & Dokter"
            description="Tenaga medis dan staf klinik"
            endpoint="/staff"
            queryKey="staff"
            columns={staffColumns}
            createLabel="Tambah Staff"
            createFields={staffFields}
            editFields={staffFields}
          />
        )}

        {activeTab === 'jadwal' && (
          <ResourceListPage<JadwalDokter>
            title="Jadwal Dokter"
            description="Hari dan jam praktek dokter"
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
