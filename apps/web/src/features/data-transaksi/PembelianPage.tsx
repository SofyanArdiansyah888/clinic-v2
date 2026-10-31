import { Plus } from 'lucide-react'
import { useState } from 'react'
import { ResourceListPage } from '@/shared/components/ResourceListPage'
import { StatusBadge } from '@/shared/components/StatusBadge'
import type { Column } from '@/shared/components/DataTable'
import { Button } from '@/shared/ui/button'
import { formatCurrency, formatDate } from '@/shared/lib/formatters'
import { StokDokumenDialog } from '@/features/warehouse/components/StokDokumenDialog'
import { itemsColumn, type StokDokumenDetail } from '@/features/warehouse/components/stokDokumenColumns'

type Row = {
  id: number
  kode: string
  tanggal: string
  no_invoice?: string
  status: string
  total_harga?: number
  supplier?: { nama?: string }
  details?: StokDokumenDetail[]
}

const columns: Column<Row>[] = [
  { key: 'kode', header: 'Kode', cell: (r) => <span className="font-mono font-bold text-teal-700">{r.kode}</span> },
  { key: 'tanggal', header: 'Tanggal', cell: (r) => formatDate(r.tanggal) },
  { key: 'supplier', header: 'Supplier', cell: (r) => r.supplier?.nama || '-' },
  { key: 'invoice', header: 'No. Invoice', cell: (r) => r.no_invoice || '-' },
  itemsColumn<Row>('pembelian'),
  { key: 'total', header: 'Total', cell: (r) => formatCurrency(r.total_harga ?? 0) },
  { key: 'status', header: 'Status', cell: (r) => <StatusBadge status={r.status} /> },
]

export function PembelianPage() {
  const [open, setOpen] = useState(false)

  return (
    <>
      <ResourceListPage<Row>
        title="Data Pembelian"
        description="Pembelian barang dari supplier. Stok bertambah saat disimpan; menghapus pembelian mengembalikan stok."
        endpoint="/pembelian"
        queryKey="pembelian"
        columns={columns}
        enableCreate={false}
        enableEdit={false}
        extraActions={
          <Button type="button" onClick={() => setOpen(true)} className="gap-1.5">
            <Plus className="h-4 w-4" />
            Buat Pembelian
          </Button>
        }
      />
      <StokDokumenDialog
        open={open}
        onClose={() => setOpen(false)}
        title="Buat Pembelian"
        endpoint="/pembelian"
        queryKey="pembelian"
        variant="pembelian"
      />
    </>
  )
}
