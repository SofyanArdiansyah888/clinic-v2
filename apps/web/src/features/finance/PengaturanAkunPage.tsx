import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Save } from 'lucide-react'
import { toast } from '@/shared/components/Toaster'
import { useEffect, useMemo, useState } from 'react'
import { apiGet, apiPut } from '@/shared/api/client'
import { PageHeader } from '@/shared/components/PageHeader'
import { Button } from '@/shared/ui/button'
import { Card } from '@/shared/ui/card'
import { AkunSelect } from '@/features/finance/components/AkunSelect'
import { apiErrorMessage, type MappingResponse } from '@/features/finance/types'

export function PengaturanAkunPage() {
  const queryClient = useQueryClient()
  const { data, isLoading } = useQuery({
    queryKey: ['finance', 'mapping'],
    queryFn: () => apiGet<MappingResponse>('/finance/mapping'),
  })
  const mapping = data?.data

  // Draft values keyed by mapping key; '' means unset.
  const [draft, setDraft] = useState<Record<string, string>>({})

  const saved = useMemo(() => {
    const next: Record<string, string> = {}
    for (const it of mapping?.items ?? []) next[it.key] = it.akun_id ? String(it.akun_id) : ''
    for (const b of mapping?.banks ?? []) next[b.key] = b.akun_id ? String(b.akun_id) : ''
    return next
  }, [mapping])

  useEffect(() => setDraft(saved), [saved])

  const changed = Object.keys(saved).filter((k) => (draft[k] ?? '') !== saved[k]).length

  const groups = useMemo(() => {
    const out = new Map<string, MappingResponse['items']>()
    for (const it of mapping?.items ?? []) out.set(it.grup, [...(out.get(it.grup) ?? []), it])
    return [...out.entries()]
  }, [mapping?.items])

  const missing = (mapping?.items ?? []).filter((it) => !draft[it.key]).length

  const saveMutation = useMutation({
    mutationFn: () =>
      apiPut<MappingResponse>('/finance/mapping', {
        items: Object.entries(draft).map(([key, v]) => ({ key, akun_id: v ? Number(v) : null })),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['finance', 'mapping'] })
      toast('Pengaturan akun tersimpan')
    },
    onError: (err) => toast(apiErrorMessage(err, 'Gagal menyimpan pengaturan akun'), 'error'),
  })

  const set = (key: string) => (v: string) => setDraft((d) => ({ ...d, [key]: v }))

  return (
    <div className="space-y-5 pb-20">
      <PageHeader
        title="Pengaturan Akun Transaksi"
        description="Tentukan akun yang dipakai jurnal otomatis untuk setiap jenis transaksi kasir, deposit, pembelian, dan stok."
      />

      {missing > 0 ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          {missing} jenis transaksi belum punya akun. Transaksi jenis itu akan ditolak sampai akunnya diatur.
        </div>
      ) : null}
      {isLoading ? <p className="text-sm text-slate-500">Memuat pengaturan...</p> : null}

      <div className="grid gap-4 xl:grid-cols-2">
        {groups.map(([grup, items]) => (
          <Card key={grup} className="overflow-hidden">
            <div className="border-b border-slate-100 bg-slate-50 px-4 py-2.5">
              <h3 className="text-xs font-extrabold tracking-wider text-slate-700 uppercase">{grup}</h3>
            </div>
            <div className="divide-y divide-slate-100">
              {items.map((it) => (
                <div key={it.key} className="grid items-center gap-2 px-4 py-3 sm:grid-cols-[1fr_1.3fr]">
                  <div>
                    <p className="text-xs font-bold text-slate-800">{it.label}</p>
                    <p className="text-[11px] text-slate-500">{it.keterangan}</p>
                  </div>
                  <AkunSelect
                    value={draft[it.key] ?? ''}
                    onChange={set(it.key)}
                    className={draft[it.key] ? undefined : 'rounded-xl ring-2 ring-amber-300'}
                  />
                </div>
              ))}
            </div>
          </Card>
        ))}

        {mapping && mapping.banks.length > 0 ? (
          <Card className="overflow-hidden">
            <div className="border-b border-slate-100 bg-slate-50 px-4 py-2.5">
              <h3 className="text-xs font-extrabold tracking-wider text-slate-700 uppercase">Akun per Rekening Bank</h3>
              <p className="text-[11px] text-slate-500">
                Opsional. Bila kosong, transaksi ke bank ini memakai akun metode pembayarannya.
              </p>
            </div>
            <div className="divide-y divide-slate-100">
              {mapping.banks.map((b) => (
                <div key={b.key} className="grid items-center gap-2 px-4 py-3 sm:grid-cols-[1fr_1.3fr]">
                  <div>
                    <p className="text-xs font-bold text-slate-800">{b.nama}</p>
                    <p className="font-mono text-[11px] text-slate-500">{b.kode}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <AkunSelect value={draft[b.key] ?? ''} onChange={set(b.key)} placeholder="Ikuti metode pembayaran" className="flex-1" />
                    {draft[b.key] ? (
                      <Button variant="ghost" size="sm" onClick={() => set(b.key)('')}>
                        Kosongkan
                      </Button>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        ) : null}
      </div>

      {/* Save bar stays in reach on a long page and shows whether anything is pending. */}
      <div className="sticky bottom-0 z-10 -mx-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur md:-mx-6 md:px-6">
        <p className="text-xs text-slate-600">
          {changed > 0 ? (
            <span className="font-semibold text-amber-700">{changed} perubahan belum disimpan</span>
          ) : (
            'Semua perubahan sudah tersimpan'
          )}
          {missing > 0 ? <span className="text-slate-500"> · {missing} jenis transaksi belum diatur</span> : null}
        </p>
        <div className="flex gap-2">
          {changed > 0 ? (
            <Button variant="outline" onClick={() => setDraft(saved)} disabled={saveMutation.isPending}>
              Batalkan
            </Button>
          ) : null}
          <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || isLoading || changed === 0} className="gap-1.5">
            <Save className="h-4 w-4" />
            Simpan Pengaturan
          </Button>
        </div>
      </div>
    </div>
  )
}
