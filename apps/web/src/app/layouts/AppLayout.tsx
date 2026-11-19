import { Menu } from 'lucide-react'
import { Button } from '@/shared/ui/button'
import { Outlet, useRouterState } from '@tanstack/react-router'
import { useEffect, useMemo, useState } from 'react'
import { AppSidebar } from '@/shared/components/AppSidebar'
import { Toaster } from '@/shared/components/Toaster'
import { ThemeSwitcher } from '@/shared/components/ThemeSwitcher'

const BREADCRUMB: Record<string, string> = {
  '/': 'Dashboard',
  '/resepsionis/kunjungan': 'Kunjungan',
  '/resepsionis/appointment': 'Appointment',
  '/perawatan': 'Perawatan',
  '/perawatan/detail': 'Detail Perawatan',
  '/perawatan/riwayat': 'Riwayat Pasien',
  '/pembayaran/perawatan': 'Pembayaran Perawatan',
  '/pembayaran/produk': 'Pembayaran Produk',
  '/pembayaran/deposit': 'Deposit & Member',
  '/pembayaran/pembatalan': 'Batal Paket',
  '/depo/penjualan-langsung': 'Penjualan Langsung',
  '/depo/resep': 'Resep',
  '/warehouse/barang': 'Barang',
  '/warehouse/stok-opname': 'Stok Opname',
  '/warehouse/produksi': 'Produksi',
  '/warehouse/konversi': 'Konversi Stok',
  '/data-transaksi/penjualan': 'Data Penjualan',
  '/data-transaksi/pembelian': 'Data Pembelian',
  '/data-transaksi/deposit': 'Riwayat Deposit',
  '/administrasi/pengaturan-umum': 'Pengaturan Umum',
  '/administrasi/pasien': 'Pasien',
  '/administrasi/staff': 'Staff',
  '/administrasi/treatment': 'Treatment',
  '/administrasi/supplier': 'Supplier',
  '/administrasi/user': 'User',
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
  '/laporan/majalah': 'Majalah Kinerja',
  '/finance/jurnal': 'Jurnal Umum',
  '/finance/buku-besar': 'Buku Besar',
  '/finance/neraca-saldo': 'Neraca Saldo',
  '/finance/laba-rugi': 'Laba Rugi',
  '/finance/neraca': 'Neraca',
  '/finance/highlights': 'Financial Highlights',
  '/finance/akun': 'Daftar Akun',
  '/finance/pengaturan-akun': 'Pengaturan Akun',
}

const SECTIONS: Array<[string, string]> = [
  ['/resepsionis', 'Resepsionis'],
  ['/perawatan', 'Perawatan'],
  ['/pembayaran', 'Pembayaran Perawatan'],
  ['/depo', 'Depo'],
  ['/warehouse', 'Barang'],
  ['/data-transaksi', 'Data Transaksi'],
  ['/administrasi', 'Administrasi'],
  ['/laporan', 'Laporan'],
  ['/finance', 'Keuangan'],
]

const WIDE_QUERY ='(min-width: 1280px)'

function formatLiveDate(date: Date) {
  return new Intl.DateTimeFormat('id-ID', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
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
    <div className="print-flow flex h-screen overflow-hidden bg-slate-50 text-slate-800">
      <div className="print-hide hidden md:block">
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

      <div className="print-flow flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="ui-header print-hide sticky top-0 z-20 flex h-16 flex-shrink-0 items-center justify-between border-b border-slate-200/80 bg-white px-4 shadow-sm md:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden"
              onClick={() => setMobileOpen(true)}
              aria-label="Buka menu"
            >
              <Menu />
            </Button>
            <div className="flex min-w-0 items-center gap-2 text-xs whitespace-nowrap">
              {sectionLabel && sectionLabel !== crumb ? (
                <>
                  <span className="hidden text-slate-400 sm:inline">{sectionLabel}</span>
                  <span className="hidden text-slate-300 sm:inline">/</span>
                </>
              ) : null}
              <span className="truncate font-semibold text-slate-900">{crumb}</span>
            </div>
          </div>

          <div className="flex flex-shrink-0 items-center gap-3">
            <span className="hidden text-xs whitespace-nowrap text-slate-500 tabular-nums lg:inline">
              {formatLiveDate(now)}
            </span>
            <ThemeSwitcher />
          </div>
        </header>

        <main className="print-flow relative flex-1 overflow-y-auto bg-slate-50">
          <div className="print-flow p-4 md:p-6">{<Outlet />}</div>
          <Toaster />
        </main>
      </div>
    </div>
  )
}
