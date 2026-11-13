import { StokDokumenPage } from '@/features/warehouse/components/StokDokumenPage'

export function ProduksiPage() {
  return (
    <StokDokumenPage
      title="Produksi Barang"
      description="Produksi / racikan barang dari bahan. Menghapus dokumen mengembalikan stok."
      endpoint="/produksi-barang"
      queryKey="produksi-barang"
      createLabel="Buat Produksi"
      variant="mutasi"
      keluarLabel="Bahan"
      masukLabel="Hasil produksi"
    />
  )
}
