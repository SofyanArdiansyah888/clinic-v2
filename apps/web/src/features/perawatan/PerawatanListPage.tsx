import { ResourceListPage } from '@/shared/components/ResourceListPage'
import { StatusBadge } from '@/shared/components/StatusBadge'
import type { Column } from '@/shared/components/DataTable'
import { formatCurrency, formatDate } from '@/shared/lib/formatters'

type Row = {
  id: number
  kode: string
  tanggal?: string
  status: string
  biaya?: number
  diagnosa?: string
  pasien?: { nama?: string }
  staff?: { nama?: string }
}

const today = new Date().toISOString().slice(0, 10)

const columns: Column<Row>[] = [
  { key: 'kode', header: 'Kode', cell: (r) => <span className="font-mono font-bold text-teal-700">{r.kode}</span> },
  { key: 'tanggal', header: 'Tanggal', cell: (r) => formatDate(r.tanggal) },
  { key: 'pasien', header: 'Pasien', cell: (r) => <span className="font-bold text-slate-900">{r.pasien?.nama || '-'}</span> },
  { key: 'staff', header: 'DPJP', cell: (r) => r.staff?.nama || '-' },
  { key: 'diagnosa', header: 'Diagnosa', cell: (r) => r.diagnosa || '-' },
  { key: 'biaya', header: 'Biaya', cell: (r) => formatCurrency(r.biaya ?? 0) },
  { key: 'status', header: 'Status', cell: (r) => <StatusBadge status={r.status} /> },
]

export function PerawatanListPage() {
  return (
    <ResourceListPage<Row>
      title="Perawatan (SOAP)"
      description="Rekam medis & tindakan perawatan"
      endpoint="/perawatan"
      queryKey="perawatan"
      columns={columns}
      createLabel="Tambah Perawatan"
      createFields={[
        { name: 'pasien_id', label: 'ID Pasien', type: 'number', required: true, placeholder: '1' },
        { name: 'staff_id', label: 'ID Staff / Dokter', type: 'number', required: true, placeholder: '1' },
        { name: 'treatment_id', label: 'ID Treatment (opsional)', type: 'number', placeholder: '1' },
        { name: 'antrian_id', label: 'ID Antrian (opsional)', type: 'number' },
        { name: 'tanggal', label: 'Tanggal', type: 'date', required: true },
        { name: 'anamnesis', label: 'S — Subjective / Anamnesis' },
        { name: 'pemeriksaan', label: 'O — Objective / Pemeriksaan' },
        { name: 'diagnosa', label: 'A — Assessment / Diagnosa' },
        { name: 'tindakan', label: 'P — Plan / Tindakan' },
        { name: 'biaya', label: 'Biaya', type: 'number', placeholder: '150000' },
        {
          name: 'status',
          label: 'Status',
          type: 'select',
          options: [
            { label: 'Draft', value: 'draft' },
            { label: 'Diproses', value: 'diproses' },
            { label: 'Selesai', value: 'selesai' },
          ],
        },
      ]}
      transformCreateBody={(v) => ({
        pasien_id: Number(v.pasien_id),
        staff_id: Number(v.staff_id),
        treatment_id: v.treatment_id ? Number(v.treatment_id) : null,
        antrian_id: v.antrian_id ? Number(v.antrian_id) : null,
        tanggal: v.tanggal || today,
        anamnesis: v.anamnesis || '',
        pemeriksaan: v.pemeriksaan || '',
        diagnosa: v.diagnosa || '',
        tindakan: v.tindakan || '',
        biaya: Number(v.biaya || 0),
        status: v.status || 'draft',
      })}
    />
  )
}
