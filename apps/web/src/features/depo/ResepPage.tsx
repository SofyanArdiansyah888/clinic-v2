import { useMutation, useQueryClient } from '@tanstack/react-query'
import { PackageCheck } from 'lucide-react'
import { useState } from 'react'
import { apiPatch } from '@/shared/api/client'
import { ResourceListPage } from '@/shared/components/ResourceListPage'
import { StatusBadge } from '@/shared/components/StatusBadge'
import type { Column } from '@/shared/components/DataTable'
import { Button } from '@/shared/ui/button'
import { Tabs } from '@/shared/ui/tabs'
import { formatDate } from '@/shared/lib/formatters'

type ResepBarang = {
  id: number
  nama_barang?: string
  jumlah: number
  unit?: string
}

type Row = {
  id: number
  kode: string
  tanggal: string
  status: string
  pasien?: { nama?: string; kode?: string }
  staff?: { nama?: string }
  barangs?: ResepBarang[]
}

type TabKey = 'dibayar' | 'draft' | 'diserahkan'

const TABS: { value: TabKey; label: string }[] = [
  { value: 'dibayar', label: 'Siap Diserahkan' },
  { value: 'draft', label: 'Belum Dibayar' },
  { value: 'diserahkan', label: 'Sudah Diserahkan' },
]

const TAB_DESCRIPTION: Record<TabKey, string> = {
  dibayar: 'Sudah dibayar, siap diserahkan ke pasien',
  draft: 'Stok berkurang setelah dibayar di kasir',
  diserahkan: 'Resep yang sudah diserahkan',
}

const columns: Column<Row>[] = [
  { key: 'kode', header: 'Kode', cell: (r) => <span className="font-mono font-bold text-rose-700">{r.kode}</span> },
  { key: 'tanggal', header: 'Tanggal', cell: (r) => formatDate(r.tanggal) },
  { key: 'pasien', header: 'Pasien', cell: (r) => r.pasien?.nama || '-' },
  { key: 'dokter', header: 'Dokter', cell: (r) => r.staff?.nama || '-' },
  {
    key: 'obat',
    header: 'Obat',
    cell: (r) =>
      (r.barangs ?? []).length === 0 ? (
        '-'
      ) : (
        <ul className="space-y-0.5 text-xs">
          {(r.barangs ?? []).map((b) => (
            <li key={b.id}>
              {b.nama_barang || '-'}{' '}
              <span className="text-slate-500">
                × {b.jumlah} {b.unit || ''}
              </span>
            </li>
          ))}
        </ul>
      ),
  },
  { key: 'status', header: 'Status', cell: (r) => <StatusBadge status={r.status} /> },
]

export function ResepPage() {
  const queryClient = useQueryClient()
  const [tab, setTab] = useState<TabKey>('dibayar')
  const [error, setError] = useState<string | null>(null)

  const serahkanMutation = useMutation({
    mutationFn: (id: number) => apiPatch(`/resep/${id}/serahkan`),
    onSuccess: () => {
      setError(null)
      void queryClient.invalidateQueries({ queryKey: ['depo-resep'] })
    },
    onError: (err: unknown) => {
      setError(
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Gagal menyerahkan resep',
      )
    },
  })

  return (
    <div className="space-y-4">
      <Tabs value={tab} onChange={setTab} items={TABS} />

      {error ? <div className="rounded-xl bg-rose-50 p-3 text-xs font-semibold text-rose-700">{error}</div> : null}

      <div>
        <ResourceListPage<Row>
          key={tab}
          title="Resep"
          description={TAB_DESCRIPTION[tab]}
          endpoint="/resep"
          queryKey="depo-resep"
          columns={columns}
          enableCreate={false}
          enableEdit={false}
          enableDelete={false}
          filterParams={{ status: tab }}
          customRowActions={
            tab === 'dibayar'
              ? (row) => (
                  <Button
                    type="button"
                    size="sm"
                    disabled={serahkanMutation.isPending}
                    onClick={() => serahkanMutation.mutate(row.id)}
                  >
                    <PackageCheck />
                    Serahkan
                  </Button>
                )
              : undefined
          }
        />
      </div>
    </div>
  )
}
