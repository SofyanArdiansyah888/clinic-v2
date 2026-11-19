import { StokDokumenPage } from '@/features/warehouse/components/StokDokumenPage'

export function StokOpnamePage() {
  return (
    <StokDokumenPage
      title="Stok Opname"
      description="Hitung fisik dan penyesuaian stok"
      endpoint="/stok-opname"
      queryKey="stok-opname"
      createLabel="Buat Opname"
      variant="opname"
    />
  )
}
