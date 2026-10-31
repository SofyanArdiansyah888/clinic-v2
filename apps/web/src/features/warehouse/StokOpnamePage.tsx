import { StokDokumenPage } from '@/features/warehouse/components/StokDokumenPage'

export function StokOpnamePage() {
  return (
    <StokDokumenPage
      title="Stok Opname"
      description="Sesi hitung fisik gudang. Stok disesuaikan ke hasil hitung; selisih tercatat di kartu stok."
      endpoint="/stok-opname"
      queryKey="stok-opname"
      createLabel="Buat Stok Opname"
      variant="opname"
    />
  )
}
