import { toast as pushToast } from '@/shared/components/Toaster'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { addDays, format, parseISO, isValid } from 'date-fns'
import { id as localeId } from 'date-fns/locale'
import {
  CalendarCheck2,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Hourglass,
  LogIn,
  Phone,
  Plus,
  Search,
  UserCheck,
  X,
  XCircle,
} from 'lucide-react'
import { useMemo, useState, type FormEvent } from 'react'
import { apiGet, apiPatch, apiPost } from '@/shared/api/client'
import { Dialog } from '@/shared/components/Dialog'
import { DokterSelect } from '@/shared/components/DokterSelect'
import { PasienSelect } from '@/shared/components/PasienSelect'
import { StatusBadge } from '@/shared/components/StatusBadge'
import { KpiCard } from '@/shared/components/KpiCard'
import { Button } from '@/shared/ui/button'

type PasienLite = { id: number; kode?: string; nama?: string; no_telp?: string }
type StaffLite = { id: number; nama?: string; jabatan?: string }

type AppointmentRow = {
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

const STATUS_FILTERS = [
  { value: 'all', label: 'Semua Status' },
  { value: 'scheduled', label: 'Terjadwal' },
  { value: 'arrived', label: 'Sudah Check-In' },
  { value: 'completed', label: 'Selesai' },
  { value: 'cancelled', label: 'Batal' },
] as const

function todayIso() {
  return format(new Date(), 'yyyy-MM-dd')
}

function nowTime() {
  return new Date().toTimeString().slice(0, 5)
}

function toDateKey(value?: string) {
  if (!value) return ''
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10)
  const d = parseISO(value)
  return isValid(d) ? format(d, 'yyyy-MM-dd') : ''
}

function formatJam(jam?: string) {
  if (!jam) return '-'
  return jam.length >= 5 ? jam.slice(0, 5) : jam
}

function formatDayLabel(iso: string) {
  const d = parseISO(iso)
  if (!isValid(d)) return iso
  return format(d, 'EEEE, d MMMM yyyy', { locale: localeId })
}

function shiftDay(iso: string, delta: number) {
  const d = parseISO(iso)
  if (!isValid(d)) return todayIso()
  return format(addDays(d, delta), 'yyyy-MM-dd')
}

export function AppointmentPage() {
  const queryClient = useQueryClient()
  const [selectedDate, setSelectedDate] = useState(todayIso)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState({
    pasien_id: '',
    staff_id: '',
    tanggal: todayIso(),
    jam: nowTime(),
    keterangan: '',
  })

  const { data, isLoading, isError } = useQuery({
    queryKey: ['appointment', 'list'],
    queryFn: () => apiGet<AppointmentRow[]>('/appointment', { per_page: 200, page: 1 }),
  })

  const rows = data?.data ?? []

  const dayRows = useMemo(() => {
    return rows.filter((r) => toDateKey(r.tanggal) === selectedDate)
  }, [rows, selectedDate])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return dayRows.filter((r) => {
      const matchQ =
        !q ||
        r.kode.toLowerCase().includes(q) ||
        (r.pasien?.nama ?? '').toLowerCase().includes(q) ||
        (r.pasien?.kode ?? '').toLowerCase().includes(q) ||
        (r.pasien?.no_telp ?? '').toLowerCase().includes(q) ||
        (r.staff?.nama ?? '').toLowerCase().includes(q) ||
        (r.keterangan ?? '').toLowerCase().includes(q)
      const matchStatus = statusFilter === 'all' || r.status.toLowerCase() === statusFilter
      return matchQ && matchStatus
    })
  }, [dayRows, search, statusFilter])

  const stats = useMemo(() => {
    const total = dayRows.length
    const checked = dayRows.filter((r) => r.status === 'arrived' || r.status === 'completed').length
    const pending = dayRows.filter((r) => r.status === 'scheduled').length
    const cancelled = dayRows.filter((r) => r.status === 'cancelled').length
    return { total, checked, pending, cancelled }
  }, [dayRows])

  function showToast(message: string, tone: 'success' | 'info' | 'error' = 'info') {
    pushToast(message, tone)
  }

  function openCreateModal() {
    setForm({
      pasien_id: '',
      staff_id: '',
      tanggal: selectedDate,
      jam: nowTime(),
      keterangan: '',
    })
    setModalOpen(true)
  }

  const createMutation = useMutation({
    mutationFn: async () => {
      const pasienId = Number(form.pasien_id)
      const staffId = Number(form.staff_id)
      if (!pasienId) throw new Error('Pasien wajib dipilih')
      if (!staffId) throw new Error('Dokter wajib dipilih')
      return apiPost<AppointmentRow>('/appointment', {
        pasien_id: pasienId,
        staff_id: staffId,
        tanggal: form.tanggal || selectedDate,
        jam: form.jam || nowTime(),
        status: 'scheduled',
        keterangan: form.keterangan || '',
      })
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['appointment'] })
      setModalOpen(false)
      showToast('Reservasi berhasil disimpan', 'success')
    },
    onError: (err) => showToast(err instanceof Error ? err.message : 'Gagal menyimpan reservasi', 'error'),
  })

  const checkInMutation = useMutation({
    mutationFn: async (row: AppointmentRow) => {
      await apiPatch(`/appointment/${row.id}/status`, { status: 'arrived' })
      await apiPost('/antrian', {
        pasien_id: row.pasien_id,
        staff_id: row.staff_id,
        tanggal: todayIso(),
        jam: nowTime(),
        status: 'menunggu',
        keterangan: row.keterangan ? `Check-in dari ${row.kode}: ${row.keterangan}` : `Check-in dari ${row.kode}`,
      })
      return row
    },
    onSuccess: (row) => {
      void queryClient.invalidateQueries({ queryKey: ['appointment'] })
      void queryClient.invalidateQueries({ queryKey: ['antrian'] })
      showToast(`${row.pasien?.nama || 'Pasien'} check-in — masuk antrian`, 'success')
    },
    onError: () => showToast('Gagal check-in pasien', 'error'),
  })

  const cancelMutation = useMutation({
    mutationFn: (row: AppointmentRow) => apiPatch(`/appointment/${row.id}/status`, { status: 'cancelled' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['appointment'] })
      showToast('Reservasi dibatalkan', 'info')
    },
    onError: () => showToast('Gagal membatalkan reservasi', 'error'),
  })

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    createMutation.mutate()
  }

  return (
    <div className="space-y-6">

      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-2xl font-extrabold tracking-tight text-slate-900">Appointment & Reservasi</h2>
            <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-800">
              <CalendarCheck2 className="h-3 w-3" />
              Jadwal Kunjungan
            </span>
          </div>
          <p className="mt-0.5 text-xs text-slate-500">
            Kelola janji temu pasien. Gunakan <b>Check-In</b> saat kedatangan untuk masuk antrian.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex items-center rounded-xl border border-slate-200 bg-white px-1.5 py-1 text-xs shadow-sm">
            <button
              type="button"
              className="rounded-lg p-1.5 text-slate-600 hover:bg-slate-100"
              onClick={() => setSelectedDate((d) => shiftDay(d, -1))}
              aria-label="Hari sebelumnya"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            <span className="flex items-center gap-1.5 px-2 font-extrabold text-slate-800">
              <CalendarDays className="h-3.5 w-3.5 text-rose-600" />
              {formatDayLabel(selectedDate)}
            </span>
            <button
              type="button"
              className="rounded-lg p-1.5 text-slate-600 hover:bg-slate-100"
              onClick={() => setSelectedDate((d) => shiftDay(d, 1))}
              aria-label="Hari berikutnya"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>

          <Button onClick={openCreateModal} className="rounded-xl text-xs">
            <Plus className="h-3.5 w-3.5" />
            Buat Reservasi
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <KpiCard
          label="Total Janji Temu"
          value={`${stats.total} Janji`}
          icon={<CalendarDays className="h-5 w-5" />}
          iconClass="bg-rose-50 text-rose-600"
        />
        <KpiCard
          label="Sudah Check-In"
          value={`${stats.checked} Pasien`}
          valueClass="text-emerald-600"
          icon={<UserCheck className="h-5 w-5" />}
          iconClass="bg-emerald-50 text-emerald-600"
        />
        <KpiCard
          label="Belum Tiba"
          value={`${stats.pending} Pasien`}
          valueClass="text-amber-600"
          icon={<Hourglass className="h-5 w-5" />}
          iconClass="bg-amber-50 text-amber-600"
        />
        <KpiCard
          label="Batal"
          value={`${stats.cancelled} Janji`}
          valueClass="text-slate-600"
          icon={<XCircle className="h-5 w-5" />}
          iconClass="bg-slate-100 text-slate-600"
        />
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-sm">
        <div className="flex flex-col items-stretch justify-between gap-3 border-b border-slate-100 bg-slate-50/50 p-4 md:flex-row md:items-center">
          <div className="relative flex-1">
            <Search className="absolute top-1/2 left-3.5 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari nama pasien, kode booking, dokter, atau keterangan..."
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
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 focus:border-rose-500 focus:ring-2 focus:ring-rose-500/20 focus:outline-none"
          >
            {STATUS_FILTERS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        {isError ? <div className="p-8 text-center text-sm text-rose-600">Gagal memuat data appointment.</div> : null}
        {isLoading ? <div className="p-10 text-center text-xs text-slate-500">Memuat reservasi...</div> : null}

        {!isLoading && filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
            <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-3xl border border-rose-100 bg-rose-50 text-rose-600 shadow-sm">
              <CalendarDays className="h-8 w-8" />
            </div>
            <h3 className="text-base font-bold text-slate-900">Tidak Ada Reservasi</h3>
            <p className="mt-1 mb-6 max-w-md text-xs text-slate-500">
              Belum ada janji temu untuk tanggal atau filter yang dipilih.
            </p>
            <Button onClick={openCreateModal} className="rounded-xl text-xs">
              <Plus className="h-3.5 w-3.5" />
              Buat Reservasi
            </Button>
          </div>
        ) : null}

        {!isLoading && filtered.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50/80 text-[11px] font-bold tracking-wider text-slate-500 uppercase">
                <tr>
                  <th className="w-28 px-3 py-3 text-center">Jam Booking</th>
                  <th className="px-3 py-3">Pasien & Kontak</th>
                  <th className="px-3 py-3">Keterangan / Layanan</th>
                  <th className="px-3 py-3">Dokter</th>
                  <th className="w-28 px-3 py-3 text-center">Status</th>
                  <th className="min-w-[180px] px-3 py-3 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {filtered.map((row) => {
                  const checkedIn = row.status === 'arrived' || row.status === 'completed'
                  const cancelled = row.status === 'cancelled'
                  return (
                    <tr key={row.id} className="transition-colors hover:bg-slate-50/80">
                      <td className="px-3 py-3 text-center">
                        <div className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2 py-1 font-mono text-xs font-black text-rose-900">
                          <Clock3 className="h-3 w-3" />
                          {formatJam(row.jam)}
                        </div>
                        <div className="mt-0.5 font-mono text-[11px] text-slate-400">{row.kode}</div>
                      </td>
                      <td className="px-3 py-3">
                        <div className="text-xs font-bold text-slate-900">{row.pasien?.nama || '-'}</div>
                        <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500">
                          <span className="inline-flex items-center gap-1">
                            <Phone className="h-2.5 w-2.5 text-slate-400" />
                            {row.pasien?.no_telp || '—'}
                          </span>
                          {row.pasien?.kode ? (
                            <span className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 font-mono text-[11px] text-slate-600">
                              {row.pasien.kode}
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td className="max-w-[220px] px-3 py-3 text-xs font-medium text-slate-700">
                        {row.keterangan || '—'}
                      </td>
                      <td className="px-3 py-3 text-xs font-semibold text-slate-800">{row.staff?.nama || '-'}</td>
                      <td className="px-3 py-3 text-center">
                        <StatusBadge status={row.status} />
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex flex-wrap items-center justify-end gap-1">
                          {checkedIn ? (
                            <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-600">
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              Sudah Check-In
                            </span>
                          ) : cancelled ? (
                            <span className="text-xs font-semibold text-slate-400">Dibatalkan</span>
                          ) : (
                            <>
                              <button
                                type="button"
                                disabled={checkInMutation.isPending}
                                onClick={() => checkInMutation.mutate(row)}
                                className="inline-flex items-center gap-1 rounded-xl bg-gradient-to-r from-rose-600 to-rose-500 px-2.5 py-1.5 text-[11px] font-bold text-white shadow-sm hover:from-rose-700 hover:to-rose-600 disabled:opacity-50"
                              >
                                <LogIn className="h-3 w-3" />
                                Check-In
                              </button>
                              <button
                                type="button"
                                disabled={cancelMutation.isPending}
                                onClick={() => cancelMutation.mutate(row)}
                                className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[11px] font-bold text-slate-500 hover:border-rose-200 hover:text-rose-700 disabled:opacity-50"
                              >
                                Batal
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : null}

        {filtered.length > 0 ? (
          <div className="border-t border-slate-100 bg-slate-50/50 p-4 text-xs text-slate-500">
            Menampilkan <span className="font-bold text-slate-800">{filtered.length}</span> dari{' '}
            <span className="font-bold text-slate-800">{dayRows.length}</span> reservasi pada tanggal ini
          </div>
        ) : null}
      </div>

      <Dialog
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Buat Reservasi Baru"
        description="Jadwalkan janji temu pasien dengan dokter."
        className="max-w-xl"
      >
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label htmlFor="appointmentpage-f1" className="mb-1 block text-xs font-bold text-slate-700">Pasien *</label>
            <PasienSelect id="appointmentpage-f1"
              required
              value={form.pasien_id}
              onChange={(pasien_id) => setForm((f) => ({ ...f, pasien_id }))}
            />
          </div>

          <div>
            <label htmlFor="appointmentpage-f2" className="mb-1 block text-xs font-bold text-slate-700">Dokter *</label>
            <DokterSelect id="appointmentpage-f2"
              required
              value={form.staff_id}
              onChange={(staff_id) => setForm((f) => ({ ...f, staff_id }))}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="appointmentpage-f3" className="mb-1 block text-xs font-bold text-slate-700">Tanggal Reservasi *</label>
              <input id="appointmentpage-f3"
                type="date"
                required
                value={form.tanggal}
                onChange={(e) => setForm((f) => ({ ...f, tanggal: e.target.value }))}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 focus:border-rose-500 focus:ring-2 focus:ring-rose-500/20 focus:outline-none"
              />
            </div>
            <div>
              <label htmlFor="appointmentpage-f4" className="mb-1 block text-xs font-bold text-slate-700">Jam Booking *</label>
              <input id="appointmentpage-f4"
                type="time"
                required
                value={form.jam}
                onChange={(e) => setForm((f) => ({ ...f, jam: e.target.value }))}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 focus:border-rose-500 focus:ring-2 focus:ring-rose-500/20 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label htmlFor="appointmentpage-f5" className="mb-1 block text-xs font-bold text-slate-700">Keterangan / Layanan</label>
            <input id="appointmentpage-f5"
              value={form.keterangan}
              onChange={(e) => setForm((f) => ({ ...f, keterangan: e.target.value }))}
              placeholder="Cth: Kontrol rutin, konsultasi, treatment laser..."
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs focus:border-rose-500 focus:ring-2 focus:ring-rose-500/20 focus:outline-none"
            />
          </div>

          <div className="flex items-center justify-end gap-3 border-t border-slate-100 pt-3">
            <Button type="button" variant="outline" className="rounded-xl text-xs" onClick={() => setModalOpen(false)}>
              Batal
            </Button>
            <Button type="submit" disabled={createMutation.isPending} className="rounded-xl text-xs">
              {createMutation.isPending ? 'Menyimpan...' : 'Simpan Booking'}
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  )
}
