import { useQuery } from '@tanstack/react-query'
import { apiGet } from '@/shared/api/client'
import { useAuthStore } from '@/features/auth/store'
import { formatDateTime } from '@/shared/lib/formatters'

type Klinik = { nama?: string; alamat?: string; telepon?: string; email?: string }

function useKlinik() {
  return useQuery({
    queryKey: ['pengaturan', 'klinik'],
    queryFn: () => apiGet<Klinik>('/pengaturan/klinik'),
    staleTime: 10 * 60_000,
  })
}

/** Letterhead + report title, shown only on paper (Save as PDF). */
export function PrintHeader({ title, periode }: { title: string; periode: string }) {
  const k = useKlinik().data?.data
  const kontak = [k?.telepon, k?.email].filter(Boolean).join(' · ')
  return (
    <div className="print-only mb-5">
      <div className="border-b-2 border-slate-900 pb-2">
        <p className="text-lg font-extrabold text-slate-900">{k?.nama || 'Klinik'}</p>
        {k?.alamat ? <p className="text-[11px] text-slate-600">{k.alamat}</p> : null}
        {kontak ? <p className="text-[11px] text-slate-600">{kontak}</p> : null}
      </div>
      <div className="mt-3">
        <p className="text-base font-bold text-slate-900">{title}</p>
        <p className="text-xs text-slate-600">{periode}</p>
      </div>
    </div>
  )
}

/** Who printed it and when, plus signature lines for the archive copy. */
export function PrintFooter() {
  const user = useAuthStore((s) => s.user)
  return (
    <div className="print-only print-keep mt-8 text-[11px] text-slate-600">
      <div className="mb-6 grid grid-cols-2 gap-16">
        {['Dibuat oleh', 'Disetujui oleh'].map((label) => (
          <div key={label}>
            <p>{label},</p>
            <div className="mt-14 border-t border-slate-400" />
          </div>
        ))}
      </div>
      <p>
        Dicetak oleh {user?.name || user?.username || '-'} pada {formatDateTime(new Date())}
      </p>
    </div>
  )
}
