import { StokDokumenPage } from '@/features/warehouse/components/StokDokumenPage'

export function ProduksiPage() {
  return (
    <StokDokumenPage
      title="Produksi Barang"
      description="Racikan barang dari bahan"
      endpoint="/produksi-barang"
      queryKey="produksi-barang"
      createLabel="Buat Produksi"
      variant="mutasi"
      keluarLabel="Bahan"
      masukLabel="Hasil"
    />
  )
}
