import { ResourceListPage } from '@/shared/components/ResourceListPage'
import { StatusBadge } from '@/shared/components/StatusBadge'
import type { Column } from '@/shared/components/DataTable'
import { formatDate } from '@/shared/lib/formatters'

type Row = {
  id: number
  kode: string
  tanggal: string
  jam?: string
  status: string
  pasien?: { nama?: string }
  staff?: { nama?: string }
}

const today = new Date().toISOString().slice(0, 10)

const columns: Column<Row>[] = [
  { key: 'kode', header: 'Kode', cell: (r) => <span className="font-mono font-bold text-teal-700">{r.kode}</span> },
  { key: 'tanggal', header: 'Tanggal', cell: (r) => formatDate(r.tanggal) },
  { key: 'jam', header: 'Jam', cell: (r) => r.jam || '-' },
  { key: 'pasien', header: 'Pasien', cell: (r) => <span className="font-bold text-slate-900">{r.pasien?.nama || '-'}</span> },
  { key: 'staff', header: 'Staff', cell: (r) => r.staff?.nama || '-' },
  { key: 'status', header: 'Status', cell: (r) => <StatusBadge status={r.status} /> },
]

export function AppointmentPage() {
  return (
    <ResourceListPage<Row>
      title="Appointment"
      description="Janji temu pasien"
      endpoint="/appointment"
      queryKey="appointment"
      columns={columns}
      createLabel="Tambah Appointment"
      createFields={[
        { name: 'pasien_id', label: 'ID Pasien', type: 'number', required: true, placeholder: '1' },
        { name: 'staff_id', label: 'ID Staff / Dokter', type: 'number', required: true, placeholder: '1' },
        { name: 'tanggal', label: 'Tanggal', type: 'date', required: true },
        { name: 'jam', label: 'Jam', placeholder: '10:00' },
        {
          name: 'status',
          label: 'Status',
          type: 'select',
          options: [
            { label: 'Terjadwal', value: 'scheduled' },
            { label: 'Datang', value: 'arrived' },
            { label: 'Selesai', value: 'completed' },
            { label: 'Batal', value: 'cancelled' },
          ],
        },
        { name: 'keterangan', label: 'Keterangan' },
      ]}
      transformCreateBody={(v) => ({
        pasien_id: Number(v.pasien_id),
        staff_id: Number(v.staff_id),
        tanggal: v.tanggal || today,
        jam: v.jam || '',
        status: v.status || 'scheduled',
        keterangan: v.keterangan || '',
      })}
    />
  )
}
