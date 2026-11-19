import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowRight, CheckCircle2, Loader2, PackageCheck, Plus, Send, Trash2, Truck, Undo2, XCircle } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { useAuthStore } from '@/features/auth/store'
import { apiGet, apiPost } from '@/shared/api/client'
import { useCabangStore } from '@/shared/branch/store'
import { BarangSelect, type BarangLite } from '@/shared/components/BarangSelect'
import type { Column } from '@/shared/components/DataTable'
import { Dialog } from '@/shared/components/Dialog'
import { KpiCard } from '@/shared/components/KpiCard'
import { FilterBar, FilterField, FilterSelect, PeriodeFilter } from '@/shared/components/ListFilters'
import { ResourceListPage } from '@/shared/components/ResourceListPage'
import { StatusBadge } from '@/shared/components/StatusBadge'
import { formatDate, formatNumber, todayISO } from '@/shared/lib/formatters'
import { EMPTY_PERIODE, useListSummary, type Periode } from '@/shared/lib/listFilters'
import { FieldErrorsContext, useFormValidation } from '@/shared/lib/validation'
import { Button } from '@/shared/ui/button'
import { Field, FormAlert } from '@/shared/ui/field'

type Transfer = {
  id: number
  kode: string
  tanggal: string
  status: 'dikirim' | 'diterima' | 'batal'
  dari_cabang_id: number
  ke_cabang_id: number
  dari_cabang_nama: string
  ke_cabang_nama: string
  dikirim_nama: string
  selesai_nama: string
  selesai_at: string | null
  keterangan?: string
  catatan_terima?: string
  details?: { id: number; qty: number; barang?: { nama?: string; kode?: string; satuan?: string } }[]
}

type Summary = { menunggu_diterima: number; dalam_pengiriman: number; diterima: number; batal: number }

type CabangLite = { id: number; nama: string; singkatan?: string; is_active?: boolean }

const ARAH_OPTIONS = [
  { value: '', label: 'Masuk & keluar' },
  { value: 'masuk', label: 'Masuk ke cabang ini' },
  { value: 'keluar', label: 'Keluar dari cabang ini' },
]
const STATUS_OPTIONS = [
  { value: '', label: 'Semua status' },
  { value: 'dikirim', label: 'Dalam pengiriman' },
  { value: 'diterima', label: 'Diterima' },
  { value: 'batal', label: 'Dibatalkan' },
]

function errorMessage(err: unknown, fallback: string) {
  return (
    (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
    (err instanceof Error ? err.message : fallback)
  )
}

/** Gudang › Transfer Stok: send barang to another branch, receive what was sent here. */
export function TransferStokPage() {
  const role = useAuthStore((s) => s.user?.role)
  const cabang = useCabangStore((s) => s.cabang)
  const aktifID = cabang && cabang !== 'all' ? Number(cabang) : 0
  const canWrite = role === 'admin' || role === 'apoteker'
  const [arah, setArah] = useState('')
  const [status, setStatus] = useState('')
  const [periode, setPeriode] = useState<Periode>(EMPTY_PERIODE)
  const [search, setSearch] = useState('')
  const [kirimOpen, setKirimOpen] = useState(false)
  const [aksi, setAksi] = useState<{ row: Transfer; jenis: 'terima' | 'batal' } | null>(null)

  const filterParams = {
    arah: arah || undefined,
    status: status || undefined,
    dari: periode.dari || undefined,
    sampai: periode.sampai || undefined,
  }
  const { data: s } = useListSummary<Summary>('/transfer-stok', 'transfer-stok', { ...filterParams, search })

  const columns: Column<Transfer>[] = [
    { key: 'tanggal', header: 'Tanggal', cell: (r) => formatDate(r.tanggal) },
    { key: 'kode', header: 'Kode', cell: (r) => <span className="font-mono text-xs font-semibold">{r.kode}</span> },
    {
      key: 'rute',
      header: 'Dari → Ke',
      cell: (r) => {
        const masuk = aktifID === r.ke_cabang_id
        const keluar = aktifID === r.dari_cabang_id
        return (
          <div className="space-y-0.5">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-800">
              {r.dari_cabang_nama}
              <ArrowRight className="h-3 w-3 text-slate-400" />
              {r.ke_cabang_nama}
            </p>
            {masuk || keluar ? (
              <p className={`text-[10px] font-bold uppercase tracking-wider ${masuk ? 'text-emerald-600' : 'text-amber-600'}`}>
                {masuk ? 'Masuk' : 'Keluar'}
              </p>
            ) : null}
          </div>
        )
      },
    },
    {
      key: 'barang',
      header: 'Barang',
      cell: (r) => (
        <ul className="space-y-0.5 text-xs text-slate-700">
          {(r.details ?? []).map((d) => (
            <li key={d.id}>
              {d.barang?.nama ?? '-'}{' '}
              <span className="font-semibold">
                × {d.qty} {d.barang?.satuan ?? ''}
              </span>
            </li>
          ))}
        </ul>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      cell: (r) => (
        <div className="space-y-0.5">
          <StatusBadge status={r.status} />
          <p className="text-[11px] text-slate-500">
            {r.status === 'dikirim' ? `oleh ${r.dikirim_nama || '-'}` : `${r.selesai_nama || '-'} · ${r.selesai_at ? formatDate(r.selesai_at) : ''}`}
          </p>
        </div>
      ),
    },
  ]

  return (
    <>
      <ResourceListPage<Transfer>
        title="Transfer Stok"
        description="Kirim barang ke cabang lain dan terima kiriman dari cabang lain"
        endpoint="/transfer-stok"
        queryKey="transfer-stok"
        columns={columns}
        enableCreate={false}
        enableEdit={false}
        enableDelete={false}
        filterParams={filterParams}
        onSearchChange={setSearch}
        emptyDescription="Belum ada transfer stok pada filter ini."
        customRowActions={(r) => {
          if (!canWrite || r.status !== 'dikirim') return null
          if (aktifID === r.ke_cabang_id || (!aktifID && role === 'admin')) {
            return (
              <Button variant="outline" size="sm" onClick={() => setAksi({ row: r, jenis: 'terima' })}>
                <PackageCheck />
                Terima
              </Button>
            )
          }
          if (aktifID === r.dari_cabang_id) {
            return (
              <Button variant="ghost-danger" size="sm" onClick={() => setAksi({ row: r, jenis: 'batal' })}>
                <Undo2 />
                Batalkan
              </Button>
            )
          }
          return null
        }}
        extraActions={
          canWrite ? (
            <Button
              type="button"
              onClick={() => setKirimOpen(true)}
              disabled={!aktifID}
              title={aktifID ? undefined : 'Pilih satu cabang aktif untuk mengirim'}
            >
              <Send />
              Kirim Transfer
            </Button>
          ) : null
        }
        summary={
          <>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <KpiCard
                label="Menunggu Diterima"
                value={formatNumber(s?.menunggu_diterima ?? 0)}
                icon={<PackageCheck className="h-5 w-5" />}
                iconClass="bg-emerald-50 text-emerald-600"
              />
              <KpiCard
                label="Dalam Pengiriman"
                value={formatNumber(s?.dalam_pengiriman ?? 0)}
                icon={<Truck className="h-5 w-5" />}
                iconClass="bg-amber-50 text-amber-600"
              />
              <KpiCard
                label="Diterima"
                value={formatNumber(s?.diterima ?? 0)}
                icon={<CheckCircle2 className="h-5 w-5" />}
                iconClass="bg-indigo-50 text-indigo-600"
              />
              <KpiCard
                label="Dibatalkan"
                value={formatNumber(s?.batal ?? 0)}
                icon={<XCircle className="h-5 w-5" />}
                iconClass="bg-slate-100 text-slate-600"
              />
            </div>
            <FilterBar
              canReset={Boolean(arah || status || periode.dari || periode.sampai)}
              onReset={() => {
                setArah('')
                setStatus('')
                setPeriode(EMPTY_PERIODE)
              }}
            >
              <FilterField label="Arah" htmlFor="transfer-arah" className="min-w-[170px]">
                <FilterSelect id="transfer-arah" value={arah} onChange={setArah} options={ARAH_OPTIONS} />
              </FilterField>
              <FilterField label="Status" htmlFor="transfer-status" className="min-w-[150px]">
                <FilterSelect id="transfer-status" value={status} onChange={setStatus} options={STATUS_OPTIONS} />
              </FilterField>
              <PeriodeFilter idPrefix="transfer" value={periode} onChange={setPeriode} />
            </FilterBar>
          </>
        }
      />
      <KirimDialog open={kirimOpen} onClose={() => setKirimOpen(false)} aktifID={aktifID} />
      <AksiDialog aksi={aksi} onClose={() => setAksi(null)} />
    </>
  )
}

type Line = { key: number; barangId: string; barang?: BarangLite; qty: string }
let nextKey = 1
const newLine = (): Line => ({ key: nextKey++, barangId: '', qty: '' })
const inputClass =
  'w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:border-rose-500 focus:outline-none'

function invalidateStok(qc: ReturnType<typeof useQueryClient>) {
  for (const key of ['transfer-stok', 'barang', 'kartu-stok']) void qc.invalidateQueries({ queryKey: [key] })
}

function KirimDialog({ open, onClose, aktifID }: { open: boolean; onClose: () => void; aktifID: number }) {
  const qc = useQueryClient()
  const validation = useFormValidation()
  const [tujuan, setTujuan] = useState('')
  const [tanggal, setTanggal] = useState(todayISO)
  const [keterangan, setKeterangan] = useState('')
  const [lines, setLines] = useState<Line[]>(() => [newLine()])
  const [error, setError] = useState<string | null>(null)

  const cabangs = useQuery({
    queryKey: ['cabang', 'select'],
    queryFn: () => apiGet<CabangLite[]>('/cabang', { per_page: 100, page: 1 }),
    enabled: open,
  })
  const tujuanList = (cabangs.data?.data ?? []).filter((c) => c.id !== aktifID && c.is_active !== false)
  const asal = (cabangs.data?.data ?? []).find((c) => c.id === aktifID)

  useEffect(() => {
    if (!open) return
    validation.reset()
    setTujuan('')
    setTanggal(todayISO())
    setKeterangan('')
    setLines([newLine()])
    setError(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const update = (key: number, patch: Partial<Line>) => setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)))

  const save = useMutation({
    mutationFn: () => {
      const filled = lines.filter((l) => l.barangId)
      if (!filled.length) throw new Error('Tambahkan minimal satu barang')
      if (new Set(filled.map((l) => l.barangId)).size !== filled.length) throw new Error('Barang yang sama tercantum lebih dari sekali')
      for (const l of filled) {
        const qty = Number(l.qty)
        if (!(qty > 0)) throw new Error(`Qty ${l.barang?.nama ?? ''} harus lebih dari 0`)
        if (l.barang?.stok_aktual !== undefined && qty > l.barang.stok_aktual) {
          throw new Error(`Stok ${l.barang.nama} di cabang ini hanya ${l.barang.stok_aktual}`)
        }
      }
      return apiPost('/transfer-stok', {
        ke_cabang_id: Number(tujuan),
        tanggal,
        keterangan,
        details: filled.map((l) => ({ barang_id: Number(l.barangId), qty: Math.floor(Number(l.qty)) })),
      })
    },
    onSuccess: () => {
      invalidateStok(qc)
      onClose()
    },
    onError: (err) => setError(errorMessage(err, 'Gagal mengirim transfer')),
  })

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    save.mutate()
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Kirim Transfer Stok"
      description={asal ? `Stok keluar dari ${asal.nama} saat dikirim, dan masuk ke tujuan setelah diterima.` : undefined}
      className="max-w-2xl"
    >
      <FieldErrorsContext.Provider value={validation.errors}>
        <form {...validation.formProps} onSubmit={onSubmit} className="max-h-[75vh] space-y-4 overflow-y-auto p-5">
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Cabang Tujuan" htmlFor="transfer-tujuan" required>
              <select id="transfer-tujuan" required value={tujuan} onChange={(e) => setTujuan(e.target.value)} className={inputClass}>
                <option value="">Pilih cabang tujuan...</option>
                {tujuanList.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nama}
                    {c.singkatan ? ` (${c.singkatan})` : ''}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Tanggal Kirim" htmlFor="transfer-tanggal" required>
              <input id="transfer-tanggal" type="date" required value={tanggal} onChange={(e) => setTanggal(e.target.value)} className={inputClass} />
            </Field>
          </div>

          <div className="space-y-2">
            <p className="text-[11px] font-bold tracking-wider text-slate-500 uppercase">Barang dikirim</p>
            {lines.map((l) => (
              <div key={l.key} className="grid grid-cols-12 items-start gap-2 rounded-xl border border-slate-100 bg-slate-50/60 p-2">
                <div className="col-span-12 md:col-span-7">
                  <BarangSelect
                    id={`transfer-barang-${l.key}`}
                    value={l.barangId}
                    onChange={(v, b) => update(l.key, { barangId: v, barang: b })}
                    required={l.qty !== ''}
                  />
                  {l.barang?.stok_aktual !== undefined ? (
                    <p className="mt-1 text-[11px] text-slate-500">
                      Stok di cabang ini: <span className="font-semibold">{l.barang.stok_aktual}</span> {l.barang.satuan ?? ''}
                    </p>
                  ) : null}
                </div>
                <div className="col-span-8 md:col-span-4">
                  <input
                    id={`transfer-qty-${l.key}`}
                    type="number"
                    min={1}
                    required={!!l.barangId}
                    value={l.qty}
                    onChange={(e) => update(l.key, { qty: e.target.value })}
                    placeholder="Qty"
                    aria-label="Qty"
                    className={inputClass}
                  />
                </div>
                <div className="col-span-4 md:col-span-1">
                  <Button
                    type="button"
                    variant="ghost-danger"
                    size="icon"
                    title="Hapus baris"
                    aria-label="Hapus baris"
                    disabled={lines.length <= 1}
                    onClick={() => setLines((prev) => prev.filter((x) => x.key !== l.key))}
                  >
                    <Trash2 />
                  </Button>
                </div>
              </div>
            ))}
            <Button type="button" variant="outline" size="sm" onClick={() => setLines((prev) => [...prev, newLine()])}>
              <Plus />
              Tambah Barang
            </Button>
          </div>

          <Field label="Keterangan" htmlFor="transfer-keterangan">
            <textarea id="transfer-keterangan" rows={2} value={keterangan} onChange={(e) => setKeterangan(e.target.value)} className={inputClass} />
          </Field>

          <FormAlert>{error}</FormAlert>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Batal
            </Button>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending ? <Loader2 className="animate-spin" /> : <Send />}
              Kirim
            </Button>
          </div>
        </form>
      </FieldErrorsContext.Provider>
    </Dialog>
  )
}

function AksiDialog({ aksi, onClose }: { aksi: { row: Transfer; jenis: 'terima' | 'batal' } | null; onClose: () => void }) {
  const qc = useQueryClient()
  const [catatan, setCatatan] = useState('')
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    setCatatan('')
    setError(null)
  }, [aksi])

  const run = useMutation({
    mutationFn: () => apiPost(`/transfer-stok/${aksi!.row.id}/${aksi!.jenis}`, { catatan }),
    onSuccess: () => {
      invalidateStok(qc)
      onClose()
    },
    onError: (err) => setError(errorMessage(err, 'Gagal memproses transfer')),
  })

  if (!aksi) return null
  const { row, jenis } = aksi
  const terima = jenis === 'terima'
  return (
    <Dialog
      open
      onClose={onClose}
      title={terima ? 'Terima Transfer' : 'Batalkan Transfer'}
      description={`${row.kode} · ${row.dari_cabang_nama} → ${row.ke_cabang_nama}`}
      className="max-w-lg"
    >
      <div className="space-y-4 p-5">
        <ul className="divide-y divide-slate-100 rounded-xl border border-slate-100 text-sm">
          {(row.details ?? []).map((d) => (
            <li key={d.id} className="flex justify-between px-3 py-2">
              <span className="text-slate-700">{d.barang?.nama ?? '-'}</span>
              <span className="font-semibold text-slate-900">
                {d.qty} {d.barang?.satuan ?? ''}
              </span>
            </li>
          ))}
        </ul>
        <p className="text-xs text-slate-500">
          {terima
            ? `Stok di atas masuk ke ${row.ke_cabang_nama}. Pastikan barang sudah sampai dan jumlahnya sesuai.`
            : `Stok di atas dikembalikan ke ${row.dari_cabang_nama}. Transfer yang dibatalkan tidak bisa diterima lagi.`}
        </p>
        <Field label="Catatan" htmlFor="transfer-catatan">
          <textarea id="transfer-catatan" rows={2} value={catatan} onChange={(e) => setCatatan(e.target.value)} className={inputClass} />
        </Field>
        <FormAlert>{error}</FormAlert>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Tutup
          </Button>
          <Button type="button" variant={terima ? 'default' : 'destructive'} disabled={run.isPending} onClick={() => run.mutate()}>
            {run.isPending ? <Loader2 className="animate-spin" /> : terima ? <PackageCheck /> : <Undo2 />}
            {terima ? 'Terima Barang' : 'Batalkan Transfer'}
          </Button>
        </div>
      </div>
    </Dialog>
  )
}
