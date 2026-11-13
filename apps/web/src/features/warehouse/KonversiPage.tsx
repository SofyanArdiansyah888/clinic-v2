import { StokDokumenPage } from '@/features/warehouse/components/StokDokumenPage'

export function KonversiPage() {
  return (
    <StokDokumenPage
      title="Konversi Stok"
      description="Konversi antar satuan / item stok. Menghapus dokumen mengembalikan stok."
      endpoint="/konversi-stok"
      queryKey="konversi-stok"
      createLabel="Buat Konversi"
      variant="mutasi"
      keluarLabel="Barang asal"
      masukLabel="Barang hasil"
    />
  )
}
