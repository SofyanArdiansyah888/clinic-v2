import { useState } from 'react'
import { Building2, Save } from 'lucide-react'
import { PageHeader } from '@/shared/components/PageHeader'
import { Button } from '@/shared/ui/button'
import { Card } from '@/shared/ui/card'
import { Input } from '@/shared/ui/input'
import { Label } from '@/shared/ui/label'

export function PengaturanUmumPage() {
  // Form Setup Klinik State
  const [klinikForm, setKlinikForm] = useState({
    nama: 'Klinik Utama Sehat',
    telepon: '021-5551234',
    email: 'info@kliniksehat.com',
    alamat: 'Jl. Sudirman No. 45, Jakarta Selatan',
    garansi: '7 hari garansi kontrol ulang tanpa biaya tambahan.',
    catatanInvoice: 'Terima kasih atas kunjungan Anda. Harap simpan bukti pembayaran ini.',
  })
  const [savedSuccess, setSavedSuccess] = useState(false)

  function handleSaveKlinik(e: React.FormEvent) {
    e.preventDefault()
    setSavedSuccess(true)
    setTimeout(() => setSavedSuccess(false), 3000)
  }

  return (
    <div>
      <PageHeader
        title="Pengaturan Umum & Setup Klinik"
        description="Kelola identitas, alamat, kontak, dan konfigurasi umum operasional klinik."
      />

      <div className="mt-6">
        <Card className="p-6">
          <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
            <span className="rounded-xl bg-teal-50 p-2.5 text-teal-600 shadow-sm">
              <Building2 className="h-5 w-5" />
            </span>
            <div>
              <h3 className="text-base font-bold text-slate-900">Identitas & Informasi Klinik</h3>
              <p className="text-xs text-slate-500">
                Pengaturan dasar yang akan ditampilkan pada cetakan invoice, header kwitansi, dan bukti transaksi.
              </p>
            </div>
          </div>

          <form onSubmit={handleSaveKlinik} className="mt-6 space-y-4 max-w-2xl">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="nama">Nama Klinik</Label>
                <Input
                  id="nama"
                  value={klinikForm.nama}
                  onChange={(e) => setKlinikForm({ ...klinikForm, nama: e.target.value })}
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="telepon">No. Telepon</Label>
                <Input
                  id="telepon"
                  value={klinikForm.telepon}
                  onChange={(e) => setKlinikForm({ ...klinikForm, telepon: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="email">Email Klinik</Label>
              <Input
                id="email"
                type="email"
                value={klinikForm.email}
                onChange={(e) => setKlinikForm({ ...klinikForm, email: e.target.value })}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="alamat">Alamat Lengkap</Label>
              <textarea
                id="alamat"
                rows={2}
                className="flex w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-xs focus:ring-2 focus:ring-teal-500"
                value={klinikForm.alamat}
                onChange={(e) => setKlinikForm({ ...klinikForm, alamat: e.target.value })}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="garansi">Catatan Garansi</Label>
              <Input
                id="garansi"
                value={klinikForm.garansi}
                onChange={(e) => setKlinikForm({ ...klinikForm, garansi: e.target.value })}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="catatanInvoice">Catatan Kwitansi / Invoice Footer</Label>
              <textarea
                id="catatanInvoice"
                rows={2}
                className="flex w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-xs focus:ring-2 focus:ring-teal-500"
                value={klinikForm.catatanInvoice}
                onChange={(e) => setKlinikForm({ ...klinikForm, catatanInvoice: e.target.value })}
              />
            </div>

            {savedSuccess ? (
              <div className="rounded-md bg-emerald-50 p-3 text-xs font-semibold text-emerald-700">
                Pengaturan klinik berhasil disimpan!
              </div>
            ) : null}

            <div className="pt-2">
              <Button type="submit" className="gap-2">
                <Save className="h-4 w-4" />
                Simpan Pengaturan
              </Button>
            </div>
          </form>
        </Card>
      </div>
    </div>
  )
}
