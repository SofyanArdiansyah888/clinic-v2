import { useMutation, useQueryClient } from '@tanstack/react-query'
import { PackageCheck } from 'lucide-react'
import { useState } from 'react'
import { apiPatch } from '@/shared/api/client'
import { ResourceListPage } from '@/shared/components/ResourceListPage'
import { StatusBadge } from '@/shared/components/StatusBadge'
import type { Column } from '@/shared/components/DataTable'
import { Button } from '@/shared/ui/button'
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

const TABS = [
  { key: 'dibayar', label: 'Siap Diserahkan' },
  { key: 'draft', label: 'Belum Dibayar' },
  { key: 'diserahkan', label: 'Sudah Diserahkan' },
] as const

type TabKey = (typeof TABS)[number]['key']

const columns: Column<Row>[] = [
  { key: 'kode', header: 'Kode', cell: (r) => <span className="font-mono font-bold text-rose-700">{r.kode}</span> },
  { key: 'tanggal', header: 'Tanggal', cell: (r) => formatDate(r.tanggal) },
  { key: 'pasien', header: 'Pasien', cell: (r) => r.pasien?.nama || '-' },
  { key: 'dokter', header: 'Dokter', cell: (r) => r.staff?.nama || '-' },
  {
    key: 'obat',
    header: 'Obat / Produk',
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
    <div>
      <div className="flex border-b border-slate-200 bg-white px-4 pt-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`border-b-2 px-4 py-3 text-xs font-bold transition-colors ${
              tab === t.key ? 'border-rose-600 text-rose-700' : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {error ? <div className="mt-4 rounded-md bg-rose-50 p-3 text-xs font-semibold text-rose-700">{error}</div> : null}

      <div className="mt-4">
        <ResourceListPage<Row>
          key={tab}
          title="Resep"
          description={
            tab === 'dibayar'
              ? 'Resep yang sudah dibayar di kasir. Stok sudah dikurangi; serahkan obat ke pasien.'
              : tab === 'draft'
                ? 'Resep yang belum dibayar. Stok berkurang saat pasien membayar di kasir.'
                : 'Riwayat resep yang sudah diserahkan ke pasien.'
          }
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
                    className="gap-1.5 text-xs"
                  >
                    <PackageCheck className="h-3.5 w-3.5" />
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
