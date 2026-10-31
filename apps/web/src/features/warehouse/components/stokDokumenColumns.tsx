import type { Column } from '@/shared/components/DataTable'
import type { StokDokumenVariant } from '@/features/warehouse/components/StokDokumenDialog'

export type StokDokumenDetail = {
  id: number
  qty?: number
  tipe?: string
  stok_sistem?: number
  stok_fisik?: number
  selisih?: number
  barang?: { nama?: string; satuan?: string }
}

export type StokDokumenRow = {
  id: number
  kode: string
  tanggal: string
  keterangan?: string
  details?: StokDokumenDetail[]
}

function detailText(d: StokDokumenDetail, variant: StokDokumenVariant) {
  const nama = d.barang?.nama ?? '-'
  if (variant === 'opname') {
    const s = d.selisih ?? 0
    return `${nama}: ${d.stok_sistem} → ${d.stok_fisik} (${s > 0 ? `+${s}` : s})`
  }
  if (variant === 'mutasi') return `${d.tipe === 'masuk' || d.tipe === 'input' ? '+' : '−'}${d.qty} ${nama}`
  return `${d.qty} × ${nama}`
}

export function itemsColumn<T extends { details?: StokDokumenDetail[] }>(variant: StokDokumenVariant): Column<T> {
  return {
    key: 'items',
    header: 'Barang',
    cell: (r) =>
      (r.details ?? []).length === 0 ? (
        '-'
      ) : (
        <ul className="space-y-0.5 text-xs">
          {(r.details ?? []).map((d) => (
            <li key={d.id}>{detailText(d, variant)}</li>
          ))}
        </ul>
      ),
  }
}
