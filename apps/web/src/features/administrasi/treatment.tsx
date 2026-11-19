import { PackageOpen } from 'lucide-react'
import { useState } from 'react'
import { ResourceListPage } from '@/shared/components/ResourceListPage'
import { MASTERS } from '@/shared/lib/masters'
import { StatusBadge } from '@/shared/components/StatusBadge'
import type { Column } from '@/shared/components/DataTable'
import { formatCurrency } from '@/shared/lib/formatters'
import { useAuthStore } from '@/features/auth/store'
import { Button } from '@/shared/ui/button'
import { PaketItemsDialog, type PaketTreatment } from './PaketItemsDialog'

type Treatment = PaketTreatment & { kode: string }

const isPaket = (r: Treatment) => !!r.kategori?.toLowerCase().includes('paket')

function isiPaket(r: Treatment) {
  const items = (r.items ?? []).filter((it) => it.treatment_id !== r.id)
  if (!items.length) return `${r.sesi_paket || 1}x ${r.nama}`
  return items.map((it) => `${it.sesi}x ${it.treatment?.nama ?? '#' + it.treatment_id}`).join(' + ')
}

const columns: Column<Treatment>[] = [
  { key: 'kode', header: 'Kode', cell: (r) => <span className="font-mono font-bold text-rose-700">{r.kode}</span> },
  { key: 'nama', header: 'Nama Treatment', cell: (r) => <span className="font-bold text-slate-900">{r.nama}</span> },
  { key: 'kategori', header: 'Kategori', cell: (r) => <span className="rounded-md bg-slate-100 px-2 py-1 text-slate-700">{r.kategori || 'Umum'}</span> },
  { key: 'harga', header: 'Harga', cell: (r) => <span className="font-semibold text-slate-900">{formatCurrency(r.harga)}</span> },
  { key: 'durasi', header: 'Durasi', cell: (r) => (r.durasi ? `${r.durasi} menit` : '-') },
  {
    key: 'sesi',
    header: 'Sesi / Isi Paket',
    cell: (r) =>
      isPaket(r) ? (
        <span className="text-slate-700" data-testid={`isi-paket-${r.id}`}>
          <span className="font-semibold">{r.sesi_paket || 1}x</span>
          <span className="ml-1 text-[11px] text-slate-500">({isiPaket(r)})</span>
        </span>
      ) : (
        '-'
      ),
  },
  { key: 'status', header: 'Status', cell: (r) => <StatusBadge status={r.is_active} /> },
]

const formFields = MASTERS.treatment.fields

export function TreatmentPage() {
  const role = useAuthStore((s) => s.user?.role)
  const [editing, setEditing] = useState<Treatment | null>(null)
  const canWrite = (MASTERS.treatment.writers as string[]).includes(role ?? '')

  return (
    <>
      <ResourceListPage<Treatment>
        title="Treatment"
        description="Katalog layanan, tarif dan komisi. Paket berisi beberapa treatment diatur lewat Isi Paket."
        endpoint="/treatment"
        queryKey="treatment"
        columns={columns}
        createLabel="Tambah Treatment"
        createFields={formFields}
        editFields={formFields}
        customRowActions={(r) =>
          canWrite && isPaket(r) ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              title="Isi Paket"
              aria-label={`Isi Paket ${r.nama}`}
              onClick={() => setEditing(r)}
            >
              <PackageOpen />
            </Button>
          ) : null
        }
      />
      <PaketItemsDialog paket={editing} onClose={() => setEditing(null)} />
    </>
  )
}
