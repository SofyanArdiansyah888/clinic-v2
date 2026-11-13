import { Bell, Menu } from 'lucide-react'
import { Outlet, useRouterState } from '@tanstack/react-router'
import { useEffect, useMemo, useState } from 'react'
import { AppSidebar } from '@/shared/components/AppSidebar'
import { Toaster } from '@/shared/components/Toaster'

const BREADCRUMB: Record<string, string> = {
  '/': 'Dashboard Operasional',
  '/resepsionis/kunjungan': 'Kunjungan & Antrian Pasien',
  '/resepsionis/appointment': 'Appointment',
  '/perawatan': 'Perawatan & Treatment',
  '/perawatan/detail': 'Detail Perawatan',
  '/perawatan/riwayat': 'Riwayat Pasien',
  '/pembayaran/perawatan': 'Kasir & Pembayaran',
  '/pembayaran/produk': 'Pembayaran Produk',
  '/pembayaran/deposit': 'Deposit & Member',
  '/pembayaran/pembatalan': 'Batal Paket Perawatan',
  '/depo/penjualan-langsung': 'Depo — Penjualan Langsung',
  '/depo/resep': 'Depo — Resep',
  '/warehouse/barang': 'Warehouse & Stok',
  '/warehouse/stok-opname': 'Stok Opname',
  '/warehouse/produksi': 'Produksi',
  '/warehouse/konversi': 'Konversi Stok',
  '/data-transaksi/penjualan': 'Data Penjualan',
  '/data-transaksi/pembelian': 'Data Pembelian',
  '/data-transaksi/deposit': 'Riwayat Deposit & Member',
  '/administrasi/pengaturan-umum': 'Pengaturan Umum & Setup Klinik',
  '/administrasi/pasien': 'Data Master Pasien',
  '/administrasi/staff': 'Data Staff',
  '/administrasi/treatment': 'Data Treatment',
  '/administrasi/supplier': 'Supplier',
  '/administrasi/user': 'User Akses',
  '/administrasi/bank': 'Bank',
  '/administrasi/cabang': 'Cabang',
  '/administrasi/perusahaan': 'Perusahaan',
  '/administrasi/membership': 'Membership',
  '/administrasi/voucher': 'Voucher',
  '/administrasi/promo': 'Promo',
  '/administrasi/template-informed-consent': 'Template Informed Consent',
  '/laporan/fo': 'Laporan FO',
  '/laporan/apotek': 'Laporan Apotek',
  '/laporan/nurse': 'Laporan Nurse',
  '/laporan/dm': 'Laporan DM',
  '/finance/jurnal': 'Jurnal Umum',
  '/finance/buku-besar': 'Buku Besar',
  '/finance/neraca-saldo': 'Neraca Saldo',
  '/finance/laba-rugi': 'Laba Rugi',
  '/finance/neraca': 'Neraca',
  '/finance/akun': 'Daftar Akun (COA)',
  '/finance/pengaturan-akun': 'Pengaturan Akun',
}

const SECTIONS: Array<[string, string]> = [
  ['/resepsionis', 'Resepsionis'],
  ['/perawatan', 'Perawatan'],
  ['/pembayaran', 'Kasir & Pembayaran'],
  ['/depo', 'Depo'],
  ['/warehouse', 'Warehouse & Stok'],
  ['/data-transaksi', 'Data Transaksi'],
  ['/administrasi', 'Administrasi'],
  ['/laporan', 'Laporan'],
  ['/finance', 'Keuangan'],
]

const WIDE_QUERY ='(min-width: 1280px)'

function formatLiveDate(date: Date) {
  return new Intl.DateTimeFormat('id-ID', {
    weekday: 'long',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

export function AppLayout() {
  // Below xl the expanded sidebar eats too much width (tablet tables lose their action columns),
  // so default to the icon rail there; the user can still expand it manually.
  const [collapsed, setCollapsed] = useState(() => !window.matchMedia(WIDE_QUERY).matches)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [now, setNow] = useState(() => new Date())
  const pathname = useRouterState({ select: (s) => s.location.pathname })

  useEffect(() => {
    const mq = window.matchMedia(WIDE_QUERY)
    const onChange = (e: MediaQueryListEvent) => setCollapsed(!e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 30_000)
    return () => window.clearInterval(id)
  }, [])

  const crumb = useMemo(() => {
    if (BREADCRUMB[pathname]) return BREADCRUMB[pathname]
    const match = Object.keys(BREADCRUMB)
      .filter((k) => k !== '/' && pathname.startsWith(k))
      .sort((a, b) => b.length - a.length)[0]
    return match ? BREADCRUMB[match] : 'Operasional'
  }, [pathname])

  const sectionLabel = SECTIONS.find(([prefix]) => pathname.startsWith(prefix))?.[1] ?? null

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50 text-slate-800">
      <div className="hidden md:block">
        <AppSidebar collapsed={collapsed} onToggle={() => setCollapsed((v) => !v)} />
      </div>

      {mobileOpen ? (
        <div className="fixed inset-0 z-40 md:hidden">
          <button
            type="button"
            className="overlay-backdrop absolute inset-0"
            aria-label="Tutup menu"
            onClick={() => setMobileOpen(false)}
          />
          <div className="absolute inset-y-0 left-0 w-64 shadow-2xl">
            <AppSidebar collapsed={false} onToggle={() => setMobileOpen(false)} />
          </div>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="sticky top-0 z-20 flex h-16 flex-shrink-0 items-center justify-between border-b border-slate-200/80 bg-white px-4 shadow-sm md:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 hover:text-slate-900 md:hidden"
              onClick={() => setMobileOpen(true)}
              aria-label="Buka menu"
            >
              <Menu className="h-6 w-6" />
            </button>
            <div className="flex min-w-0 items-center gap-2 text-xs whitespace-nowrap">
              <span className="hidden text-slate-400 sm:inline">Clinic OS</span>
              <span className="hidden text-slate-300 sm:inline">/</span>
              {sectionLabel ? (
                <>
                  <span className="hidden text-slate-400 lg:inline">{sectionLabel}</span>
                  <span className="hidden text-slate-300 lg:inline">/</span>
                </>
              ) : null}
              <span className="truncate rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1 font-bold text-rose-950">
                {crumb}
              </span>
            </div>
          </div>

          <div className="flex flex-shrink-0 items-center gap-3">
            <div className="hidden items-center gap-2 rounded-full border border-slate-200 bg-slate-100 px-3 py-1.5 text-xs font-medium whitespace-nowrap text-slate-600 lg:flex">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-rose-600" />
              </span>
              <span className="tabular-nums">{formatLiveDate(now)}</span>
            </div>
            <button
              type="button"
              className="relative rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700"
              aria-label="Notifikasi"
            >
              <Bell className="h-4 w-4" />
            </button>
          </div>
        </header>

        <main className="relative flex-1 overflow-y-auto bg-slate-50">
          <div className="p-4 md:p-6">{<Outlet />}</div>
          <Toaster />
        </main>
      </div>
    </div>
  )
}
