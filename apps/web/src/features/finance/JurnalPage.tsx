import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { format, startOfMonth } from 'date-fns'
import { ChevronDown, ChevronRight, Plus, RotateCcw, Search, Trash2 } from 'lucide-react'
import { Fragment, useState, type FormEvent } from 'react'
import { apiGet, apiPost } from '@/shared/api/client'
import { Dialog } from '@/shared/components/Dialog'
import { EmptyState } from '@/shared/components/EmptyState'
import { PageHeader } from '@/shared/components/PageHeader'
import { Pagination } from '@/shared/components/Pagination'
import { Button } from '@/shared/ui/button'
import { Card } from '@/shared/ui/card'
import { Input } from '@/shared/ui/input'
import { TableSkeleton } from '@/shared/ui/skeleton'
import { cn } from '@/shared/lib/cn'
import { formatCurrency, formatDate, todayISO } from '@/shared/lib/formatters'
import { AkunSelect } from '@/features/finance/components/AkunSelect'
import { apiErrorMessage, SOURCE_LABEL, type Jurnal } from '@/features/finance/types'

const fieldLabel = 'text-[11px] font-bold uppercase tracking-wider text-slate-500'
const inputClass = 'rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-800 focus:border-teal-500 focus:outline-none'

type Line = { akun_id: string; debit: string; kredit: string; keterangan: string }
const emptyLine = (): Line => ({ akun_id: '', debit: '', kredit: '', keterangan: '' })

export function JurnalPage() {
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const [dari, setDari] = useState(() => format(startOfMonth(new Date()), 'yyyy-MM-dd'))
  const [sampai, setSampai] = useState(todayISO)
  const [sourceType, setSourceType] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [expanded, setExpanded] = useState<Record<number, boolean>>({})
  const [open, setOpen] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['finance', 'jurnal', page, dari, sampai, sourceType, search],
    queryFn: () =>
      apiGet<Jurnal[]>('/finance/jurnal', {
        page,
        per_page: 25,
        dari: dari || undefined,
        sampai: sampai || undefined,
        source_type: sourceType || undefined,
        search: search || undefined,
        sort_by: 'tanggal',
      }),
  })
  const rows = data?.data ?? []

  const reverseMutation = useMutation({
    mutationFn: (id: number) => apiPost(`/finance/jurnal/${id}/reverse`, { tanggal: todayISO() }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['finance', 'jurnal'] }),
    onError: (err) => window.alert(apiErrorMessage(err, 'Gagal membalik jurnal')),
  })

  return (
    <div className="space-y-5">
      <PageHeader
        title="Jurnal Umum"
        description="Semua jurnal otomatis dari transaksi dan jurnal manual. Koreksi dilakukan dengan jurnal pembalik, bukan menghapus."
        actions={
          <Button onClick={() => setOpen(true)} className="gap-1.5">
            <Plus className="h-4 w-4" />
            Jurnal Manual
          </Button>
        }
      />

      <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200 bg-white p-4">
        <div className="space-y-1.5">
          <label className={fieldLabel} htmlFor="j-dari">Dari</label>
          <input id="j-dari" type="date" value={dari} max={sampai} onChange={(e) => { setDari(e.target.value); setPage(1) }} className={inputClass} />
        </div>
        <div className="space-y-1.5">
          <label className={fieldLabel} htmlFor="j-sampai">Sampai</label>
          <input id="j-sampai" type="date" value={sampai} min={dari} onChange={(e) => { setSampai(e.target.value); setPage(1) }} className={inputClass} />
        </div>
        <div className="space-y-1.5">
          <label className={fieldLabel} htmlFor="j-sumber">Sumber</label>
          <select id="j-sumber" value={sourceType} onChange={(e) => { setSourceType(e.target.value); setPage(1) }} className={inputClass}>
            <option value="">Semua sumber</option>
            {Object.entries(SOURCE_LABEL).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>
        <form
          className="flex flex-1 items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            setSearch(searchInput.trim())
            setPage(1)
          }}
        >
          <div className="relative min-w-[200px] flex-1">
            <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input value={searchInput} onChange={(e) => setSearchInput(e.target.value)} placeholder="Kode, referensi, keterangan..." className="pl-9" />
          </div>
          <Button type="submit" variant="outline">Cari</Button>
        </form>
      </div>

      <Card className="overflow-hidden">
        {isLoading ? (
          <div className="p-4"><TableSkeleton rows={6} cols={5} /></div>
        ) : rows.length === 0 ? (
          <EmptyState title="Belum ada jurnal" description="Jurnal muncul otomatis saat transaksi dibayar atau dibuat manual." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-bold tracking-wider text-slate-500 uppercase">
                  <th className="w-8 px-3 py-3" />
                  <th className="px-3 py-3">Tanggal</th>
                  <th className="px-3 py-3">Kode</th>
                  <th className="px-3 py-3">Sumber</th>
                  <th className="px-3 py-3">Keterangan</th>
                  <th className="px-3 py-3 text-right">Nilai</th>
                  <th className="px-3 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {rows.map((j) => {
                  const isOpen = Boolean(expanded[j.id])
                  return (
                    <Fragment key={j.id}>
                      <tr
                        className={cn('cursor-pointer hover:bg-slate-50', (j.is_reversed || j.reversal_of_id) && 'text-slate-400')}
                        onClick={() => setExpanded((x) => ({ ...x, [j.id]: !isOpen }))}
                      >
                        <td className="px-3 py-3 text-slate-400">{isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</td>
                        <td className="px-3 py-3 whitespace-nowrap">{formatDate(j.tanggal)}</td>
                        <td className="px-3 py-3 font-mono font-bold text-teal-700">{j.kode}</td>
                        <td className="px-3 py-3">
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">
                            {SOURCE_LABEL[j.source_type] ?? j.source_type}
                          </span>
                          {j.reversal_of_id ? <span className="ml-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">pembalik</span> : null}
                          {j.is_reversed ? <span className="ml-1 rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-700">dibalik</span> : null}
                        </td>
                        <td className="px-3 py-3">
                          <p className="font-medium text-slate-800">{j.keterangan}</p>
                          {j.referensi ? <p className="font-mono text-[10px] text-slate-500">{j.referensi}</p> : null}
                        </td>
                        <td className="px-3 py-3 text-right font-semibold whitespace-nowrap">{formatCurrency(j.total_debit)}</td>
                        <td className="px-3 py-3 text-right">
                          {j.source_type === 'manual' && !j.is_reversed && !j.reversal_of_id ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="gap-1"
                              onClick={(e) => {
                                e.stopPropagation()
                                if (window.confirm(`Buat jurnal pembalik untuk ${j.kode}?`)) reverseMutation.mutate(j.id)
                              }}
                            >
                              <RotateCcw className="h-3.5 w-3.5" />
                              Balik
                            </Button>
                          ) : null}
                        </td>
                      </tr>
                      {isOpen ? (
                        <tr className="bg-slate-50/60">
                          <td />
                          <td colSpan={6} className="px-3 pb-3">
                            <table className="w-full text-[11px]">
                              <thead>
                                <tr className="text-slate-500">
                                  <th className="py-1.5 text-left font-semibold">Akun</th>
                                  <th className="py-1.5 text-left font-semibold">Keterangan</th>
                                  <th className="py-1.5 text-right font-semibold">Debit</th>
                                  <th className="py-1.5 text-right font-semibold">Kredit</th>
                                </tr>
                              </thead>
                              <tbody>
                                {(j.details ?? []).map((d) => (
                                  <tr key={d.id} className="border-t border-slate-200/70">
                                    <td className={cn('py-1.5', d.kredit > 0 && 'pl-6')}>
                                      <span className="font-mono text-teal-700">{d.akun?.kode}</span> {d.akun?.nama}
                                    </td>
                                    <td className="py-1.5 text-slate-500">{d.keterangan || ''}</td>
                                    <td className="py-1.5 text-right">{d.debit ? formatCurrency(d.debit) : ''}</td>
                                    <td className="py-1.5 text-right">{d.kredit ? formatCurrency(d.kredit) : ''}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
        <Pagination meta={data?.meta} onPageChange={setPage} />
      </Card>

      <JurnalManualDialog
        open={open}
        onClose={() => setOpen(false)}
        onSaved={() => {
          setOpen(false)
          void queryClient.invalidateQueries({ queryKey: ['finance', 'jurnal'] })
        }}
      />
    </div>
  )
}

function JurnalManualDialog({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const [tanggal, setTanggal] = useState(todayISO)
  const [keterangan, setKeterangan] = useState('')
  const [referensi, setReferensi] = useState('')
  const [lines, setLines] = useState<Line[]>(() => [emptyLine(), emptyLine()])
  const [error, setError] = useState<string | null>(null)

  const totalD = lines.reduce((s, l) => s + (Number(l.debit) || 0), 0)
  const totalK = lines.reduce((s, l) => s + (Number(l.kredit) || 0), 0)
  const balanced = totalD > 0 && Math.round(totalD * 100) === Math.round(totalK * 100)

  const mutation = useMutation({
    mutationFn: () =>
      apiPost('/finance/jurnal', {
        tanggal,
        keterangan,
        referensi,
        details: lines
          .filter((l) => l.akun_id && (Number(l.debit) || Number(l.kredit)))
          .map((l) => ({ akun_id: Number(l.akun_id), debit: Number(l.debit) || 0, kredit: Number(l.kredit) || 0, keterangan: l.keterangan })),
      }),
    onSuccess: () => {
      setKeterangan('')
      setReferensi('')
      setLines([emptyLine(), emptyLine()])
      setError(null)
      onSaved()
    },
    onError: (err) => setError(apiErrorMessage(err, 'Gagal menyimpan jurnal')),
  })

  const update = (i: number, patch: Partial<Line>) => setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)))

  function submit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    mutation.mutate()
  }

  return (
    <Dialog open={open} onClose={onClose} title="Jurnal Manual" description="Untuk beban operasional, saldo awal, atau koreksi." className="max-w-3xl">
      <form onSubmit={submit} className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-[160px_1fr_160px]">
          <div className="space-y-1.5">
            <label className={fieldLabel} htmlFor="jm-tgl">Tanggal</label>
            <Input id="jm-tgl" type="date" required value={tanggal} onChange={(e) => setTanggal(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <label className={fieldLabel} htmlFor="jm-ket">Keterangan</label>
            <Input id="jm-ket" required value={keterangan} onChange={(e) => setKeterangan(e.target.value)} placeholder="Contoh: Bayar listrik November" />
          </div>
          <div className="space-y-1.5">
            <label className={fieldLabel} htmlFor="jm-ref">Referensi</label>
            <Input id="jm-ref" value={referensi} onChange={(e) => setReferensi(e.target.value)} placeholder="No. bukti" />
          </div>
        </div>

        <div className="space-y-2">
          <div className="hidden grid-cols-[1.6fr_1fr_1fr_1fr_32px] gap-2 text-[11px] font-bold tracking-wider text-slate-500 uppercase sm:grid">
            <span>Akun</span>
            <span>Keterangan</span>
            <span className="text-right">Debit</span>
            <span className="text-right">Kredit</span>
            <span />
          </div>
          {lines.map((l, i) => (
            <div key={i} className="grid gap-2 rounded-xl border border-slate-100 p-2 sm:grid-cols-[1.6fr_1fr_1fr_1fr_32px] sm:border-0 sm:p-0">
              <AkunSelect value={l.akun_id} onChange={(v) => update(i, { akun_id: v })} />
              <Input value={l.keterangan} onChange={(e) => update(i, { keterangan: e.target.value })} placeholder="Opsional" />
              <Input
                type="number"
                min={0}
                step="0.01"
                className="text-right"
                value={l.debit}
                onChange={(e) => update(i, { debit: e.target.value, kredit: e.target.value ? '' : l.kredit })}
                placeholder="0"
              />
              <Input
                type="number"
                min={0}
                step="0.01"
                className="text-right"
                value={l.kredit}
                onChange={(e) => update(i, { kredit: e.target.value, debit: e.target.value ? '' : l.debit })}
                placeholder="0"
              />
              <button
                type="button"
                disabled={lines.length <= 2}
                onClick={() => setLines((ls) => ls.filter((_, idx) => idx !== i))}
                className="flex h-10 items-center justify-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-30"
                title="Hapus baris"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
          <Button variant="outline" size="sm" onClick={() => setLines((ls) => [...ls, emptyLine()])} className="gap-1">
            <Plus className="h-3.5 w-3.5" />
            Tambah Baris
          </Button>
        </div>

        <div className={cn('flex flex-wrap items-center justify-between gap-2 rounded-xl p-3 text-xs font-semibold', balanced ? 'bg-teal-50 text-teal-800' : 'bg-amber-50 text-amber-800')}>
          <span>Total Debit {formatCurrency(totalD)} · Total Kredit {formatCurrency(totalK)}</span>
          <span>{balanced ? 'Seimbang' : `Selisih ${formatCurrency(Math.abs(totalD - totalK))}`}</span>
        </div>
        {error ? <div className="rounded-xl bg-rose-50 p-3 text-xs font-semibold text-rose-700">{error}</div> : null}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Batal</Button>
          <Button type="submit" disabled={!balanced || mutation.isPending}>Simpan Jurnal</Button>
        </div>
      </form>
    </Dialog>
  )
}
