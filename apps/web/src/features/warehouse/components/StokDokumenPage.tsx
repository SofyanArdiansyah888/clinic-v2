import { Plus } from 'lucide-react'
import { useState } from 'react'
import { ResourceListPage } from '@/shared/components/ResourceListPage'
import type { Column } from '@/shared/components/DataTable'
import { Button } from '@/shared/ui/button'
import { formatDate } from '@/shared/lib/formatters'
import { StokDokumenDialog, type StokDokumenVariant } from '@/features/warehouse/components/StokDokumenDialog'
import { itemsColumn, type StokDokumenRow } from '@/features/warehouse/components/stokDokumenColumns'

type StokDokumenPageProps = {
  title: string
  description: string
  endpoint: string
  queryKey: string
  createLabel: string
  variant: StokDokumenVariant
  keluarLabel?: string
  masukLabel?: string
}

// List + create page for stock documents (konversi, produksi, stok opname).
// Deleting a document reverses its stock movement on the server.
export function StokDokumenPage({
  title,
  description,
  endpoint,
  queryKey,
  createLabel,
  variant,
  keluarLabel,
  masukLabel,
}: StokDokumenPageProps) {
  const [open, setOpen] = useState(false)

  const columns: Column<StokDokumenRow>[] = [
    { key: 'kode', header: 'Kode', cell: (r) => <span className="font-mono font-bold text-teal-700">{r.kode}</span> },
    { key: 'tanggal', header: 'Tanggal', cell: (r) => formatDate(r.tanggal) },
    itemsColumn<StokDokumenRow>(variant),
    { key: 'keterangan', header: 'Keterangan', cell: (r) => r.keterangan || '-' },
  ]

  return (
    <>
      <ResourceListPage<StokDokumenRow>
        title={title}
        description={description}
        endpoint={endpoint}
        queryKey={queryKey}
        columns={columns}
        enableCreate={false}
        enableEdit={false}
        extraActions={
          <Button type="button" onClick={() => setOpen(true)} className="gap-1.5">
            <Plus className="h-4 w-4" />
            {createLabel}
          </Button>
        }
      />
      <StokDokumenDialog
        open={open}
        onClose={() => setOpen(false)}
        title={createLabel}
        endpoint={endpoint}
        queryKey={queryKey}
        variant={variant}
        keluarLabel={keluarLabel}
        masukLabel={masukLabel}
      />
    </>
  )
}
