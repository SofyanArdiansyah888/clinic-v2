import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import {
  CheckCircle2,
  Clock3,
  DoorOpen,
  Grip,
  ListChecks,
  Plus,
  Printer,
  RotateCcw,
  Search,
  Stethoscope,
  Users,
  Volume2,
  X,
} from 'lucide-react'
import { useMemo, useState, type FormEvent } from 'react'
import { apiGet, apiPost, apiPut } from '@/shared/api/client'
import { uploadImage } from '@/shared/api/upload'
import { Dialog } from '@/shared/components/Dialog'
import { DokterSelect } from '@/shared/components/DokterSelect'
import { FotoSebelumDialog, type PendingPhoto } from '@/shared/components/FotoSebelumDialog'
import { PasienSelect } from '@/shared/components/PasienSelect'
import { StatusBadge } from '@/shared/components/StatusBadge'
import { KpiCard } from '@/shared/components/KpiCard'
import { cn } from '@/shared/lib/cn'
import { Button } from '@/shared/ui/button'
import { todayISO } from '@/shared/lib/formatters'

type PasienLite = { id: number; kode?: string; nama?: string; no_telp?: string }
type StaffLite = { id: number; nama?: string; jabatan?: string }

type AntrianRow = {
  id: number
  kode: string
  pasien_id: number
  staff_id: number
  tanggal: string
  jam?: string
  status: string
  keterangan?: string
  pasien?: PasienLite
  staff?: StaffLite
}

const today = todayISO()

function nowTime() {
  return new Date().toTimeString().slice(0, 5)
}

const STATUS_OPTIONS = [
  { value: 'all', label: 'Semua Status' },
  { value: 'menunggu', label: 'Menunggu' },
  { value: 'dipanggil', label: 'Dipanggil' },
  { value: 'diproses', label: 'Sedang Dilayani' },
  { value: 'bayar', label: 'Ke Kasir' },
  { value: 'selesai', label: 'Selesai' },
  { value: 'batal', label: 'Batal' },
] as const

const BOARD_COLUMNS = [
  { key: 'menunggu', title: 'Menunggu' },
  { key: 'dipanggil', title: 'Dipanggil' },
  { key: 'diproses', title: 'Sedang Dilayani' },
  { key: 'bayar', title: 'Ke Kasir' },
] as const

const STATUS_LABEL: Record<string, string> = {
  menunggu: 'Menunggu',
  dipanggil: 'Dipanggil',
  diproses: 'Sedang Dilayani',
  bayar: 'Ke Kasir',
  selesai: 'Selesai',
  batal: 'Batal',
}

function toDateInput(value?: string) {
  if (!value) return today
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10)
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return today
  return d.toISOString().slice(0, 10)
}

function formatJam(jam?: string) {
  if (!jam) return '-'
  return jam.length >= 5 ? jam.slice(0, 5) : jam
}

function formatTanggalPrint(value?: string) {
  const d = value ? new Date(toDateInput(value)) : new Date()
  return new Intl.DateTimeFormat('id-ID', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }).format(d)
}

function nextActionsFor(status: string): Array<{ label: string; next: string; tone: 'primary' | 'soft' | 'danger' }> {
  switch (status.toLowerCase()) {
    case 'menunggu':
      return [
        { label: 'Panggil', next: 'dipanggil', tone: 'primary' },
        { label: 'Batal', next: 'batal', tone: 'danger' },
      ]
    case 'dipanggil':
      return [
        { label: 'Layani', next: 'diproses', tone: 'primary' },
        { label: 'Batal', next: 'batal', tone: 'danger' },
      ]
    case 'diproses':
      return [
        { label: 'Ke Kasir', next: 'bayar', tone: 'primary' },
        { label: 'Selesai', next: 'selesai', tone: 'soft' },
      ]
    case 'bayar':
      return [{ label: 'Selesai', next: 'selesai', tone: 'primary' }]
    default:
      return []
  }
}

function printAntrianTicket(row: AntrianRow) {
  const win = window.open('', '_blank', 'width=420,height=640')
  if (!win) return

  const html = `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8" />
  <title>Tiket Antrian ${row.kode}</title>
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: "Segoe UI", Arial, sans-serif;
      color: #0f172a;
      background: #fff;
    }
    .ticket {
      width: 80mm;
      margin: 12px auto;
      padding: 16px 14px;
      border: 1px dashed #94a3b8;
      text-align: center;
    }
    .brand { font-size: 12px; font-weight: 800; letter-spacing: 0.04em; text-transform: uppercase; }
    .sub { font-size: 10px; color: #64748b; margin-top: 2px; }
    .code {
      margin: 14px 0 8px;
      font-size: 34px;
      font-weight: 900;
      font-family: ui-monospace, Consolas, monospace;
      letter-spacing: 0.06em;
      color: #be123c;
    }
    .name { font-size: 14px; font-weight: 700; }
    .meta { margin-top: 10px; font-size: 11px; color: #334155; line-height: 1.55; text-align: left; }
    .meta b { color: #0f172a; }
    .foot { margin-top: 14px; font-size: 10px; color: #64748b; }
    @media print {
      body { margin: 0; }
      .ticket { border: none; margin: 0; width: 100%; }
      .no-print { display: none !important; }
    }
  </style>
</head>
<body>
  <div class="ticket">
    <div class="brand">Clinic OS</div>
    <div class="sub">Tiket Antrian Kunjungan</div>
    <div class="code">${row.kode}</div>
    <div class="name">${row.pasien?.nama || 'Pasien'}</div>
    <div class="meta">
      <div><b>No. RM</b>: ${row.pasien?.kode || '-'}</div>
      <div><b>Dokter/Staff</b>: ${row.staff?.nama || '-'}</div>
      <div><b>Tanggal</b>: ${formatTanggalPrint(row.tanggal)}</div>
      <div><b>Jam</b>: ${formatJam(row.jam)} WIB</div>
      <div><b>Status</b>: ${STATUS_LABEL[row.status] || row.status}</div>
      ${row.keterangan ? `<div><b>Ket.</b>: ${row.keterangan}</div>` : ''}
    </div>
    <div class="foot">Harap menunggu panggilan di area resepsionis.</div>
  </div>
  <script>
    window.onload = function () {
      window.focus();
      window.print();
    };
  </script>
</body>
</html>`

  win.document.open()
  win.document.write(html)
  win.document.close()
}

export function KunjunganPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [viewMode, setViewMode] = useState<'table' | 'board'>('table')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [modalOpen, setModalOpen] = useState(false)
  const [printAfterCreate, setPrintAfterCreate] = useState(true)
  const [layaniRow, setLayaniRow] = useState<AntrianRow | null>(null)
  const [layaniSubmitting, setLayaniSubmitting] = useState(false)
  const [toast, setToast] = useState<{ message: string; tone: 'success' | 'info' | 'error' } | null>(null)
  const [form, setForm] = useState({
    mode: 'existing' as 'existing' | 'new',
    pasien_id: '',
    nama: '',
    no_telp: '',
    staff_id: '',
    jam: nowTime(),
    keterangan: '',
  })

  const { data, isLoading, isError } = useQuery({
    queryKey: ['antrian', 'kunjungan'],
    queryFn: () => apiGet<AntrianRow[]>('/antrian', { per_page: 100, page: 1 }),
  })

  const rows = data?.data ?? []

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows.filter((r) => {
      const matchQ =
        !q ||
        r.kode.toLowerCase().includes(q) ||
        (r.pasien?.nama ?? '').toLowerCase().includes(q) ||
        (r.pasien?.kode ?? '').toLowerCase().includes(q) ||
        (r.staff?.nama ?? '').toLowerCase().includes(q)
      const matchStatus = statusFilter === 'all' || r.status.toLowerCase() === statusFilter
      return matchQ && matchStatus
    })
  }, [rows, search, statusFilter])

  const stats = useMemo(() => {
    const menunggu = rows.filter((r) => r.status === 'menunggu').length
    const aktif = rows.filter((r) => ['dipanggil', 'diproses'].includes(r.status)).length
    const selesai = rows.filter((r) => r.status === 'selesai' || r.status === 'bayar').length
    return { total: rows.length, menunggu, aktif, selesai }
  }, [rows])

  function showToast(message: string, tone: 'success' | 'info' | 'error' = 'info') {
    setToast({ message, tone })
    window.setTimeout(() => setToast(null), 3200)
  }

  const updateMutation = useMutation({
    mutationFn: (row: AntrianRow & { nextStatus: string }) =>
      apiPut<AntrianRow>(`/antrian/${row.id}`, {
        pasien_id: row.pasien_id,
        staff_id: row.staff_id,
        tanggal: toDateInput(row.tanggal),
        jam: row.jam || '',
        status: row.nextStatus,
        keterangan: row.keterangan || '',
      }),
    onSuccess: (_res, vars) => {
      void queryClient.invalidateQueries({ queryKey: ['antrian'] })
      showToast(`Antrian ${vars.kode} → ${STATUS_LABEL[vars.nextStatus] || vars.nextStatus}`, 'success')
    },
    onError: () => showToast('Gagal memperbarui status antrian', 'error'),
  })

  const createMutation = useMutation({
    mutationFn: async () => {
      const staffId = Number(form.staff_id)
      if (!staffId) throw new Error('Dokter wajib dipilih')
      const jam = form.jam || nowTime()

      if (form.mode === 'existing') {
        const pasienId = Number(form.pasien_id)
        if (!pasienId) throw new Error('Pasien wajib dipilih')
        return apiPost<AntrianRow>('/antrian', {
          pasien_id: pasienId,
          staff_id: staffId,
          tanggal: today,
          jam,
          status: 'menunggu',
          keterangan: form.keterangan || '',
        })
      }

      if (!form.nama.trim() || !form.no_telp.trim()) {
        throw new Error('Nama dan no. telp wajib diisi')
      }
      return apiPost<{ antrian: AntrianRow }>('/antrian/create-pasien-antrian', {
        nama: form.nama.trim(),
        no_telp: form.no_telp.trim(),
        staff_id: staffId,
        tanggal: today,
        jam,
        keterangan: form.keterangan || '',
      })
    },
    onSuccess: (res) => {
      void queryClient.invalidateQueries({ queryKey: ['antrian'] })
      void queryClient.invalidateQueries({ queryKey: ['pasien'] })
      setModalOpen(false)
      setForm({
        mode: 'existing',
        pasien_id: '',
        nama: '',
        no_telp: '',
        staff_id: '',
        jam: nowTime(),
        keterangan: '',
      })

      const created =
        res.data && 'antrian' in (res.data as object)
          ? (res.data as { antrian: AntrianRow }).antrian
          : (res.data as AntrianRow)

      if (printAfterCreate && created?.kode) {
        printAntrianTicket(created)
      }
      showToast('Kunjungan berhasil didaftarkan ke antrian', 'success')
    },
    onError: (err) => showToast(err instanceof Error ? err.message : 'Gagal mendaftarkan kunjungan', 'error'),
  })

  function setStatus(row: AntrianRow, nextStatus: string) {
    if (nextStatus === 'diproses') {
      setLayaniRow(row)
      return
    }
    updateMutation.mutate({ ...row, nextStatus })
  }

  async function confirmLayani(photos: PendingPhoto[]) {
    if (!layaniRow) return
    setLayaniSubmitting(true)
    try {
      const uploaded = []
      for (const photo of photos) {
        uploaded.push(await uploadImage(photo.file, 'foto-sebelum'))
      }
      const urls = uploaded.map((u) => u.url)
      const antrianId = layaniRow.id

      await apiPost('/perawatan', {
        pasien_id: layaniRow.pasien_id,
        staff_id: layaniRow.staff_id,
        antrian_id: antrianId,
        tanggal: today,
        jam_mulai: nowTime(),
        status: 'proses',
        foto_sebelum: urls,
        catatan: layaniRow.keterangan || '',
      })

      await apiPut(`/antrian/${antrianId}`, {
        pasien_id: layaniRow.pasien_id,
        staff_id: layaniRow.staff_id,
        tanggal: toDateInput(layaniRow.tanggal),
        jam: layaniRow.jam || '',
        status: 'diproses',
        keterangan: layaniRow.keterangan || '',
      })

      void queryClient.invalidateQueries({ queryKey: ['antrian'] })
      void queryClient.invalidateQueries({ queryKey: ['perawatan'] })
      setLayaniRow(null)
      showToast('Foto tersimpan. Membuka perawatan...', 'success')
      void navigate({ to: '/perawatan' })
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal menyimpan foto / perawatan', 'error')
    } finally {
      setLayaniSubmitting(false)
    }
  }

  function resetFilters() {
    setSearch('')
    setStatusFilter('all')
  }

  function onSubmitModal(e: FormEvent) {
    e.preventDefault()
    createMutation.mutate()
  }

  const empty = !isLoading && filtered.length === 0

  return (
    <div className="space-y-6">
      {toast ? (
        <div className="pointer-events-none fixed top-5 right-5 z-[110] max-w-sm">
          <div
            className={cn(
              'pointer-events-auto flex items-center gap-3 rounded-2xl border p-3.5 text-xs font-semibold text-white shadow-xl',
              toast.tone === 'error'
                ? 'border-rose-800 bg-rose-950'
                : toast.tone === 'success'
                  ? 'border-rose-500/40 bg-slate-950'
                  : 'border-slate-700 bg-slate-950',
            )}
          >
            <span className="flex-1">{toast.message}</span>
            <button type="button" className="text-slate-400 hover:text-white" onClick={() => setToast(null)}>
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      ) : null}

      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-2xl font-extrabold tracking-tight text-slate-900">Kunjungan & Antrian Pasien</h2>
            <span className="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-rose-100 px-2.5 py-0.5 text-xs font-bold text-rose-800">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-rose-600" />
              Front Desk Active
            </span>
          </div>
          <p className="mt-0.5 text-xs text-slate-500">
            Kelola kedatangan pasien, panggilan antrian, cetak tiket, dan status layanan hari ini.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex items-center gap-1 rounded-xl bg-slate-200/80 p-1">
            <button
              type="button"
              onClick={() => setViewMode('table')}
              className={cn(
                'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-all',
                viewMode === 'table' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-600 hover:text-slate-900',
              )}
            >
              <ListChecks className="h-3.5 w-3.5" />
              Daftar Tabel
            </button>
            <button
              type="button"
              onClick={() => setViewMode('board')}
              className={cn(
                'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-all',
                viewMode === 'board' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-600 hover:text-slate-900',
              )}
            >
              <Grip className="h-3.5 w-3.5" />
              Board Status
            </button>
          </div>
          <Button
            onClick={() => {
              setForm((f) => ({ ...f, jam: nowTime() }))
              setModalOpen(true)
            }}
            className="rounded-xl text-xs"
          >
            <Plus className="h-3.5 w-3.5" />
            Registrasi Kunjungan
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Total Kunjungan"
          value={`${stats.total} Pasien`}
          icon={<Users className="h-5 w-5" />}
          iconClass="bg-rose-50 text-rose-600"
        />
        <KpiCard
          label="Menunggu"
          value={`${stats.menunggu} Pasien`}
          valueClass="text-amber-600"
          icon={<Clock3 className="h-5 w-5" />}
          iconClass="bg-amber-50 text-amber-600"
        />
        <KpiCard
          label="Sedang Dilayani"
          value={`${stats.aktif} Pasien`}
          valueClass="text-indigo-600"
          icon={<Stethoscope className="h-5 w-5" />}
          iconClass="bg-indigo-50 text-indigo-600"
        />
        <KpiCard
          label="Selesai"
          value={`${stats.selesai} Pasien`}
          valueClass="text-emerald-700"
          icon={<CheckCircle2 className="h-5 w-5" />}
          iconClass="bg-emerald-50 text-emerald-600"
        />
      </div>

      <div className="flex flex-col overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-sm">
        <div className="flex flex-col items-stretch justify-between gap-3 border-b border-slate-100 bg-slate-50/50 p-4 md:flex-row md:items-center">
          <div className="relative flex-1">
            <Search className="absolute top-1/2 left-3.5 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari nama pasien, kode RM, no. antrian, atau dokter..."
              className="w-full rounded-xl border border-slate-200 bg-white py-2 pr-10 pl-10 text-xs font-medium placeholder:text-slate-400 focus:border-rose-500 focus:ring-2 focus:ring-rose-500/20 focus:outline-none"
            />
            {search ? (
              <button
                type="button"
                className="absolute top-1/2 right-3 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                onClick={() => setSearch('')}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </div>
          <div className="relative">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="appearance-none rounded-xl border border-slate-200 bg-white px-3.5 py-2 pr-8 text-xs font-bold text-slate-700 focus:border-rose-500 focus:ring-2 focus:ring-rose-500/20 focus:outline-none"
            >
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {isError ? <div className="p-8 text-center text-sm text-rose-600">Gagal memuat data antrian.</div> : null}
        {isLoading ? <div className="p-10 text-center text-xs text-slate-500">Memuat antrian...</div> : null}

        {empty ? (
          <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
            <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-3xl border border-rose-100 bg-rose-50 text-rose-600 shadow-sm">
              <DoorOpen className="h-8 w-8" />
            </div>
            <h3 className="text-base font-bold text-slate-900">Tidak Ada Antrian</h3>
            <p className="mt-1 mb-6 max-w-md text-xs text-slate-500">
              Belum ada kunjungan pasien untuk filter yang dipilih. Daftarkan kunjungan baru atau reset filter.
            </p>
            <div className="flex items-center gap-3">
              <Button
                onClick={() => {
                  setForm((f) => ({ ...f, jam: nowTime() }))
                  setModalOpen(true)
                }}
                className="rounded-xl text-xs"
              >
                <Plus className="h-3.5 w-3.5" />
                Registrasi Kunjungan
              </Button>
              <Button variant="outline" onClick={resetFilters} className="rounded-xl text-xs">
                <RotateCcw className="h-3.5 w-3.5" />
                Reset Filter
              </Button>
            </div>
          </div>
        ) : null}

        {!isLoading && !empty && viewMode === 'table' ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50/80 text-[11px] font-bold tracking-wider text-slate-500 uppercase">
                <tr>
                  <th className="w-28 px-3 py-3 text-center">No.</th>
                  <th className="px-3 py-3">Pasien & RM</th>
                  <th className="px-3 py-3">Dokter</th>
                  <th className="w-16 px-3 py-3">Jam</th>
                  <th className="px-3 py-3">Keterangan</th>
                  <th className="w-28 px-3 py-3 text-center">Status</th>
                  <th className="min-w-[200px] px-3 py-3 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {filtered.map((row) => (
                  <tr key={row.id} className="transition-colors hover:bg-slate-50/80">
                    <td className="px-3 py-2.5 text-center">
                      <span className="queue-no inline-block rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1 font-mono text-sm font-bold tracking-wide text-rose-800">
                        {row.kode}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="text-xs font-bold text-slate-900">{row.pasien?.nama || '-'}</div>
                      <div className="font-mono text-[10px] text-slate-400">
                        {row.pasien?.kode || `ID-${row.pasien_id}`}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-xs font-medium text-slate-700">{row.staff?.nama || '-'}</td>
                    <td className="px-3 py-2.5 text-xs font-semibold text-slate-600">{formatJam(row.jam)}</td>
                    <td className="max-w-[160px] truncate px-3 py-2.5 text-xs text-slate-500">
                      {row.keterangan || '—'}
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <span className={cn(row.status === 'dipanggil' && 'pulse-call inline-flex')}>
                        <StatusBadge status={row.status} />
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      <QueueActions
                        row={row}
                        dense
                        disabled={updateMutation.isPending}
                        onStatus={setStatus}
                        onPrint={printAntrianTicket}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        {!isLoading && !empty && viewMode === 'board' ? (
          <div className="grid grid-cols-1 gap-4 bg-slate-100/60 p-6 md:grid-cols-2 lg:grid-cols-4">
            {BOARD_COLUMNS.map((col) => {
              const items = filtered.filter((r) => r.status.toLowerCase() === col.key)
              return (
                <div
                  key={col.key}
                  className="flex h-full flex-col rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm"
                >
                  <div className="mb-3 flex items-center justify-between border-b border-slate-100 pb-2.5">
                    <h4 className="text-xs font-extrabold tracking-wider text-slate-900 uppercase">{col.title}</h4>
                    <span className="rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-xs font-bold text-rose-700">
                      {items.length}
                    </span>
                  </div>
                  <div className="max-h-[520px] space-y-2.5 overflow-y-auto">
                    {items.length === 0 ? (
                      <p className="py-6 text-center text-xs text-slate-400 italic">Kosong</p>
                    ) : (
                      items.map((item) => (
                        <div
                          key={item.id}
                          className={cn(
                            'space-y-2 rounded-xl border bg-white p-3 shadow-sm',
                            item.status === 'dipanggil'
                              ? 'border-rose-300 bg-rose-50/80 ring-2 ring-rose-400/30'
                              : item.status === 'diproses'
                                ? 'border-indigo-200 bg-indigo-50/70'
                                : 'border-slate-200',
                          )}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="rounded border border-rose-200 bg-rose-50 px-1.5 py-0.5 font-mono text-[11px] font-bold text-rose-800">
                              {item.kode}
                            </span>
                            <span className="text-[10px] font-bold text-slate-500">{formatJam(item.jam)}</span>
                          </div>
                          <div>
                            <h5 className="text-xs font-extrabold text-slate-900">{item.pasien?.nama || '-'}</h5>
                            <p className="text-[11px] text-slate-400">
                              {item.pasien?.kode || `ID-${item.pasien_id}`} ·{' '}
                              <span className="font-semibold text-rose-600">{item.staff?.nama || 'Staff'}</span>
                            </p>
                          </div>
                          <div className="border-t border-slate-100 pt-2">
                            <QueueActions
                              row={item}
                              disabled={updateMutation.isPending}
                              onStatus={setStatus}
                              onPrint={printAntrianTicket}
                            />
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        ) : null}

        {!empty ? (
          <div className="flex flex-col items-center justify-between gap-3 border-t border-slate-100 bg-slate-50/50 p-4 text-xs text-slate-500 sm:flex-row">
            <div>
              Menampilkan{' '}
              <span className="font-bold text-slate-800">
                {filtered.length === 0 ? '0' : `1-${filtered.length}`}
              </span>{' '}
              dari <span className="font-bold text-slate-800">{filtered.length}</span> antrian
            </div>
          </div>
        ) : null}
      </div>

      <Dialog
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Registrasi Kunjungan Pasien"
        description="Daftarkan pasien ke antrian front desk hari ini."
        className="max-w-2xl"
      >
        <form onSubmit={onSubmitModal} className="space-y-4">
          <div className="flex gap-2 rounded-xl bg-slate-100 p-1">
            <button
              type="button"
              onClick={() => setForm((f) => ({ ...f, mode: 'existing' }))}
              className={cn(
                'flex-1 rounded-lg px-3 py-2 text-xs font-bold transition-all',
                form.mode === 'existing' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600',
              )}
            >
              Pasien Terdaftar
            </button>
            <button
              type="button"
              onClick={() => setForm((f) => ({ ...f, mode: 'new' }))}
              className={cn(
                'flex-1 rounded-lg px-3 py-2 text-xs font-bold transition-all',
                form.mode === 'new' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600',
              )}
            >
              Pasien Baru
            </button>
          </div>

          {form.mode === 'existing' ? (
            <div>
              <label className="mb-1 block text-xs font-bold text-slate-700">Pasien *</label>
              <PasienSelect
                required
                value={form.pasien_id}
                onChange={(pasien_id) => setForm((f) => ({ ...f, pasien_id }))}
              />
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-bold text-slate-700">Nama Pasien *</label>
                <input
                  required
                  value={form.nama}
                  onChange={(e) => setForm((f) => ({ ...f, nama: e.target.value }))}
                  placeholder="Contoh: Siti Aminah"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-medium focus:border-rose-500 focus:ring-2 focus:ring-rose-500/20 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-bold text-slate-700">No. Telepon *</label>
                <input
                  required
                  value={form.no_telp}
                  onChange={(e) => setForm((f) => ({ ...f, no_telp: e.target.value }))}
                  placeholder="08xxxxxxxxxx"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-medium focus:border-rose-500 focus:ring-2 focus:ring-rose-500/20 focus:outline-none"
                />
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-bold text-slate-700">Dokter *</label>
              <DokterSelect
                required
                value={form.staff_id}
                onChange={(staff_id) => setForm((f) => ({ ...f, staff_id }))}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold text-slate-700">Jam Kedatangan</label>
              <input
                type="time"
                value={form.jam}
                onChange={(e) => setForm((f) => ({ ...f, jam: e.target.value }))}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-medium focus:border-rose-500 focus:ring-2 focus:ring-rose-500/20 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-bold text-slate-700">Keluhan / Keterangan</label>
            <input
              value={form.keterangan}
              onChange={(e) => setForm((f) => ({ ...f, keterangan: e.target.value }))}
              placeholder="Cth: Kontrol rutin, konsultasi kulit..."
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs focus:border-rose-500 focus:ring-2 focus:ring-rose-500/20 focus:outline-none"
            />
          </div>

          <label className="flex items-center gap-2 text-xs font-semibold text-slate-700">
            <input
              type="checkbox"
              checked={printAfterCreate}
              onChange={(e) => setPrintAfterCreate(e.target.checked)}
              className="rounded border-slate-300 text-rose-600 focus:ring-rose-500"
            />
            Cetak tiket antrian setelah simpan
          </label>

          <div className="flex items-center justify-end gap-3 border-t border-slate-100 pt-3">
            <Button type="button" variant="outline" className="rounded-xl text-xs" onClick={() => setModalOpen(false)}>
              Batal
            </Button>
            <Button type="submit" disabled={createMutation.isPending} className="rounded-xl text-xs">
              {createMutation.isPending ? 'Menyimpan...' : 'Masukkan Antrian'}
            </Button>
          </div>
        </form>
      </Dialog>

      <FotoSebelumDialog
        open={Boolean(layaniRow)}
        onClose={() => {
          if (!layaniSubmitting) setLayaniRow(null)
        }}
        patientName={layaniRow?.pasien?.nama}
        queueCode={layaniRow?.kode}
        submitting={layaniSubmitting}
        onConfirm={confirmLayani}
      />
    </div>
  )
}

function QueueActions({
  row,
  onStatus,
  onPrint,
  disabled,
  dense,
}: {
  row: AntrianRow
  onStatus: (row: AntrianRow, next: string) => void
  onPrint: (row: AntrianRow) => void
  disabled?: boolean
  dense?: boolean
}) {
  const actions = nextActionsFor(row.status)

  return (
    <div className={cn('flex flex-wrap items-center gap-1', dense ? 'justify-end' : 'justify-start')}>
      {actions.map((action) => (
        <button
          key={action.next + action.label}
          type="button"
          disabled={disabled}
          onClick={() => onStatus(row, action.next)}
          className={cn(
            'inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-bold transition-colors disabled:opacity-50',
            action.tone === 'primary' && 'bg-rose-600 text-white hover:bg-rose-700',
            action.tone === 'soft' && 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50',
            action.tone === 'danger' && 'border border-slate-200 bg-white text-slate-500 hover:border-rose-200 hover:text-rose-700',
          )}
        >
          {action.next === 'dipanggil' ? <Volume2 className="h-3 w-3" /> : null}
          {action.label}
        </button>
      ))}
      <button
        type="button"
        title="Cetak tiket antrian"
        onClick={() => onPrint(row)}
        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-bold text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900"
      >
        <Printer className="h-3 w-3" />
        Cetak
      </button>
    </div>
  )
}
