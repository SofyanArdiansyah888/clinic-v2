import { StokDokumenPage } from '@/features/warehouse/components/StokDokumenPage'

export function KonversiPage() {
  return (
    <StokDokumenPage
      title="Konversi Stok"
      description="Konversi antar satuan atau item"
      endpoint="/konversi-stok"
      queryKey="konversi-stok"
      createLabel="Buat Konversi"
      variant="mutasi"
      keluarLabel="Asal"
      masukLabel="Hasil"
    />
  )
}
