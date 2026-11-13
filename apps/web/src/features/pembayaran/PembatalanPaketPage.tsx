import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, FileText, Info, Pencil, Search } from 'lucide-react'
import { Link } from '@tanstack/react-router'
import { useState } from 'react'
import { apiGet, apiPost } from '@/shared/api/client'
import { BankSelect } from '@/shared/components/BankSelect'
import { Dialog } from '@/shared/components/Dialog'
import { JenisPembayaranSelect } from '@/shared/components/JenisPembayaranSelect'
import { StatusBadge } from '@/shared/components/StatusBadge'
import { Button } from '@/shared/ui/button'
import { formatCurrency, formatDate } from '@/shared/lib/formatters'
import { PembayaranToast } from '@/features/pembayaran/components/PembayaranToast'

type PaketRow = {
  id: number
  kode: string
  tanggal_beli: string
  total_sesi: number
  sisa_sesi: number
  harga_total?: number
  status: string
  pasien?: { id: number; nama?: string }
  staff?: { id: number; nama?: string }
  treatment?: { id: number; nama?: string }
}

export function PembatalanPaketPage() {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [cancelTarget, setCancelTarget] = useState<PaketRow | null>(null)
  const [keterangan, setKeterangan] = useState('')
  const [refund, setRefund] = useState('')
  const [metodeRefund, setMetodeRefund] = useState('tunai')
  const [bankId, setBankId] = useState('')
  const needsBank = metodeRefund === 'transfer' || metodeRefund === 'e_money' || metodeRefund === 'kartu_debit'
  const [toast, setToast] = useState<{ message: string; tone: 'success' | 'error' } | null>(null)

  function showToast(message: string, tone: 'success' | 'error' = 'success') {
    setToast({ message, tone })
    window.setTimeout(() => setToast(null), 3200)
  }

  const { data, isLoading } = useQuery({
    queryKey: ['pembayaran-paket-sisa', search],
    queryFn: () => apiGet<PaketRow[]>('/pembayaran/paket/sisa', { per_page: 200, page: 1, search: search || undefined }),
  })

  const rows = data?.data ?? []

  const cancelMutation = useMutation({
    mutationFn: (payload: { id: number; keterangan: string; refund: number }) =>
      apiPost(`/pembayaran/paket/${payload.id}/batal`, {
        keterangan: payload.keterangan,
        refund: payload.refund,
        jenis_pembayaran: metodeRefund,
        bank_id: needsBank && bankId ? Number(bankId) : null,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['pembayaran-paket-sisa'] })
      setCancelTarget(null)
      setKeterangan('')
      setRefund('')
      setMetodeRefund('tunai')
      setBankId('')
      showToast('Paket perawatan berhasil dibatalkan', 'success')
    },
    onError: (err) =>
      showToast(
        (err as { response?: { data?: { message?: string } } }).response?.data?.message ??
          (err instanceof Error ? err.message : 'Gagal membatalkan paket'),
        'error',
      ),
  })

  return (
    <div className="space-y-6">
      {toast ? <PembayaranToast message={toast.message} tone={toast.tone} /> : null}

      <div>
        <h2 className="text-2xl font-extrabold tracking-tight text-slate-900">Batal Paket Perawatan</h2>
        <p className="mt-0.5 text-xs text-slate-500">
          Pembatalan paket treatment yang masih memiliki sisa sesi belum terpakai.
        </p>
      </div>

      <div className="flex items-start gap-3 rounded-2xl border border-orange-100 bg-orange-50/60 p-4">
        <Info className="mt-0.5 h-5 w-5 shrink-0 text-orange-600" />
        <div className="text-xs text-orange-900">
          <p className="font-bold">Alur: Beli Paket → Bayar di Kasir → Batal jika perlu refund</p>
          <ol className="mt-2 list-decimal space-y-1 pl-4 text-orange-800">
            <li>Pasien beli paket di Perawatan → tab Treatment Paket → Proses Ke Kasir</li>
            <li>Bayar di Kasir → tab Perawatan Paket — sistem membuat record paket aktif dengan total sesi</li>
            <li>Jika pasien ingin batalkan sisa sesi, daftar muncul di halaman ini untuk refund/kompensasi</li>
          </ol>
          <Link
            to="/pembayaran/perawatan"
            className="mt-2 inline-block font-bold text-orange-700 hover:underline"
          >
            Ke Kasir Perawatan Paket →
          </Link>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-100 bg-slate-50/50 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-orange-500" />
            <h3 className="text-sm font-extrabold text-slate-900">Paket dengan Sisa Perawatan</h3>
          </div>
          <div className="relative w-full sm:w-72">
            <Search className="absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari pasien / kode paket..."
              className="w-full rounded-xl border border-slate-200 bg-white py-1.5 pr-3 pl-9 text-xs font-medium focus:border-orange-400 focus:outline-none"
            />
          </div>
        </div>

        {isLoading ? (
          <div className="p-8 text-center text-xs text-slate-500">Memuat data paket...</div>
        ) : rows.length === 0 ? (
          <div className="space-y-2 p-12 text-center">
            <p className="text-sm font-bold text-slate-700">Belum ada paket dengan sisa sesi</p>
            <p className="text-xs text-slate-500">
              Paket muncul setelah pembayaran paket treatment di kasir. Pastikan treatment master memiliki kategori
              &quot;paket&quot;.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50/80 text-[11px] font-bold tracking-wider text-slate-500 uppercase">
                <tr>
                  <th className="px-4 py-3">Tanggal Beli</th>
                  <th className="px-4 py-3">Pasien</th>
                  <th className="px-4 py-3">Dokter</th>
                  <th className="px-4 py-3">Paket Perawatan</th>
                  <th className="px-4 py-3">Sisa Sesi</th>
                  <th className="px-4 py-3">Nilai</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((row) => (
                  <tr key={row.id} className="hover:bg-slate-50/60">
                    <td className="px-4 py-3 text-xs text-slate-600">{formatDate(row.tanggal_beli)}</td>
                    <td className="px-4 py-3 text-xs font-semibold text-slate-800">{row.pasien?.nama || '-'}</td>
                    <td className="px-4 py-3 text-xs text-slate-600">{row.staff?.nama || '-'}</td>
                    <td className="px-4 py-3 text-xs text-slate-700">{row.treatment?.nama || row.kode}</td>
                    <td className="px-4 py-3 text-xs font-bold text-orange-600">
                      {row.sisa_sesi} / {row.total_sesi}
                    </td>
                    <td className="px-4 py-3 text-xs font-bold">{formatCurrency(row.harga_total ?? 0)}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={row.status} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => {
                          setCancelTarget(row)
                          setRefund('')
                          setKeterangan('')
                        }}
                        className="h-8 rounded-lg bg-orange-500 text-[11px] font-bold text-white hover:bg-orange-600"
                      >
                        <Pencil className="mr-1 h-3 w-3" />
                        Batalkan
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Dialog
        open={Boolean(cancelTarget)}
        onClose={() => setCancelTarget(null)}
        title="Konfirmasi Pembatalan Paket"
        description={cancelTarget ? `${cancelTarget.pasien?.nama} — ${cancelTarget.treatment?.nama || cancelTarget.kode}` : undefined}
      >
        <div className="space-y-4 p-5">
          <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
            <p className="text-xs text-amber-900">
              Paket dengan <strong>{cancelTarget?.sisa_sesi}</strong> sisa sesi dari{' '}
              <strong>{cancelTarget?.total_sesi}</strong> akan ditandai dibatalkan. Catat nilai refund jika ada
              pengembalian dana ke pasien.
            </p>
          </div>
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Nilai Refund (Rp)</label>
            <input
              type="number"
              min={0}
              value={refund}
              onChange={(e) => setRefund(e.target.value)}
              placeholder="0 jika tanpa refund"
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs focus:border-orange-400 focus:outline-none"
            />
          </div>
          {Number(refund) > 0 ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Metode Refund</label>
                <JenisPembayaranSelect value={metodeRefund} onChange={setMetodeRefund} />
              </div>
              {needsBank ? (
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Rekening Asal</label>
                  <BankSelect value={bankId} onChange={setBankId} />
                </div>
              ) : null}
            </div>
          ) : null}
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Keterangan</label>
            <textarea
              value={keterangan}
              onChange={(e) => setKeterangan(e.target.value)}
              rows={3}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs focus:border-orange-400 focus:outline-none"
              placeholder="Alasan pembatalan..."
            />
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => setCancelTarget(null)} className="flex-1 rounded-xl text-xs">
              Batal
            </Button>
            <Button
              type="button"
              disabled={cancelMutation.isPending}
              onClick={() =>
                cancelTarget &&
                cancelMutation.mutate({
                  id: cancelTarget.id,
                  keterangan,
                  refund: Number(refund) || 0,
                })
              }
              className="flex-1 rounded-xl bg-orange-500 text-xs font-bold text-white hover:bg-orange-600"
            >
              Konfirmasi Pembatalan
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  )
}
