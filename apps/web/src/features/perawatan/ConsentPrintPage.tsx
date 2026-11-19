import { useQuery } from '@tanstack/react-query'
import { useParams } from '@tanstack/react-router'
import { Loader2, Printer } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { apiGet } from '@/shared/api/client'
import { useAuthStore } from '@/features/auth/store'
import { KopSurat } from '@/shared/components/print/PrintDocument'
import { useKlinik } from '@/shared/components/print/useKlinik'
import { Button } from '@/shared/ui/button'
import { formatDate, formatDateTime } from '@/shared/lib/formatters'
import { PAGE_CSS, printDocument, waitForImages } from '@/shared/lib/print'
import type { PerawatanConsent } from './consent'

/** A4 copy of a signed informed consent; opened in its own tab and printed once loaded. */
export function ConsentPrintPage() {
  const { id } = useParams({ strict: false }) as { id?: string }
  const user = useAuthStore((s) => s.user)
  const query = useQuery({
    queryKey: ['perawatan-consent', 'detail', id],
    queryFn: () => apiGet<PerawatanConsent>(`/perawatan-consent/${id}`),
    enabled: Boolean(id),
    retry: false,
  })
  const c = query.data?.data
  const klinik = useKlinik()
  const fileName = c ? `Informed Consent ${c.perawatan?.kode ?? c.id} - ${c.pasien?.nama ?? ''}`.trim() : ''

  const printed = useRef(false)
  useEffect(() => {
    // Wait for the letterhead too, so the paper copy is not printed with a placeholder name.
    if (!c || klinik.isLoading || printed.current) return
    printed.current = true
    // Signatures are images; wait for them so the paper copy is not blank.
    void waitForImages().then(() => printDocument(fileName, PAGE_CSS.A4))
  }, [c, klinik.isLoading, fileName])

  return (
    <div className="min-h-screen bg-slate-100 py-6 print:bg-white print:py-0">
      <div className="print-hide mx-auto mb-4 flex max-w-[210mm] justify-end px-4">
        <Button type="button" size="sm" disabled={!c} onClick={() => printDocument(fileName, PAGE_CSS.A4)}>
          <Printer />
          Cetak
        </Button>
      </div>
      {query.isLoading ? (
        <p className="flex items-center justify-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Memuat consent...
        </p>
      ) : !c ? (
        <p className="mx-auto max-w-md rounded-xl bg-white p-6 text-center text-sm font-semibold text-rose-700">
          {(query.error as Error | null)?.message || 'Consent tidak ditemukan.'}
        </p>
      ) : (
        <div className="relative mx-auto w-[210mm] bg-white p-[14mm] text-[12px] leading-relaxed text-slate-900 shadow-sm print:w-auto print:p-0 print:shadow-none">
          {c.status === 'dibatalkan' ? (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="-rotate-[20deg] rounded-lg border-4 border-red-600/70 px-8 py-3 text-center text-red-600/70">
                <p className="text-4xl font-black tracking-[0.2em]">DIBATALKAN</p>
                {c.alasan_batal ? <p className="max-w-[120mm] text-xs font-bold">{c.alasan_batal}</p> : null}
              </div>
            </div>
          ) : null}

          <KopSurat klinik={klinik.data?.data} />
          <h1 className="mt-5 text-center text-base font-extrabold uppercase tracking-wide">{c.judul}</h1>
          <p className="text-center text-[11px] text-slate-500">
            Perawatan {c.perawatan?.kode ?? '-'} · {formatDate(c.perawatan?.tanggal)}
          </p>

          <table className="mt-5 text-[12px]">
            <tbody>
              <Info label="Nama pasien" value={c.pasien?.nama} />
              <Info label="No. pasien" value={c.pasien?.kode} />
              {c.pasien?.tanggal_lahir ? <Info label="Tanggal lahir" value={formatDate(c.pasien.tanggal_lahir)} /> : null}
              <Info label="Penandatangan" value={`${c.nama_penandatangan} (${c.hubungan})`} />
              <Info label="Ditandatangani" value={formatDateTime(c.signed_at)} />
            </tbody>
          </table>

          <div className="mt-5 whitespace-pre-wrap text-justify">{c.isi}</div>

          <div className="print-keep mt-10 grid grid-cols-3 gap-6 text-center text-[11px]">
            <Ttd label="Pasien / Wali" nama={c.nama_penandatangan} url={c.ttd_pasien_url} />
            <Ttd label="Dokter" nama={c.dokter?.nama} url={c.ttd_dokter_url} />
            <Ttd label="Saksi" nama={c.saksi} />
          </div>

          <p className="mt-10 text-[10px] text-slate-500">
            Dicetak oleh {user?.name || user?.username || '-'} pada {formatDateTime(new Date())}
          </p>
        </div>
      )}
    </div>
  )
}

function Info({ label, value }: { label: string; value?: string }) {
  return (
    <tr>
      <td className="w-36 py-0.5 pr-3 text-slate-500">{label}</td>
      <td className="py-0.5 font-semibold">{value || '-'}</td>
    </tr>
  )
}

function Ttd({ label, nama, url }: { label: string; nama?: string; url?: string }) {
  return (
    <div>
      <p>{label},</p>
      <div className="flex h-24 items-end justify-center">
        {url ? <img src={url} alt={`Tanda tangan ${label}`} className="max-h-24 max-w-full object-contain" /> : null}
      </div>
      <div className="border-t border-slate-500 pt-1 font-semibold">{nama || ' '}</div>
    </div>
  )
}
