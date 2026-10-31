import {
  ChevronDown,
  ClipboardList,
  CreditCard,
  FileBarChart,
  HeartPulse,
  LayoutDashboard,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  Pill,
  Receipt,
  Settings2,
  Stethoscope,
  Warehouse,
} from 'lucide-react'
import { useMemo, useState, type ElementType } from 'react'
import { Link, useRouterState } from '@tanstack/react-router'
import { useAuthStore } from '@/features/auth/store'
import { cn } from '@/shared/lib/cn'

type NavItem = { label: string; to: string; badge?: string; badgeTone?: 'amber' | 'rose' }

type NavSection = {
  title: string
  items: Array<{
    label: string
    icon: ElementType
    to?: string
    children?: NavItem[]
    badge?: string
    badgeTone?: 'amber' | 'rose'
  }>
}

const NAV: NavSection[] = [
  {
    title: 'Operasional Utama',
    items: [
      { label: 'Dashboard KPI', icon: LayoutDashboard, to: '/' },
      {
        label: 'Resepsionis',
        icon: ClipboardList,
        children: [
          { label: 'Kunjungan / Antrian', to: '/resepsionis/kunjungan' },
          { label: 'Appointment', to: '/resepsionis/appointment' },
        ],
      },
      { label: 'Perawatan', icon: Stethoscope, to: '/perawatan' },
      {
        label: 'Kasir & Pembayaran',
        icon: CreditCard,
        children: [
          { label: 'Perawatan', to: '/pembayaran/perawatan' },
          { label: 'Produk', to: '/pembayaran/produk' },
          { label: 'Deposit & Member', to: '/pembayaran/deposit' },
          { label: 'Batal Paket Perawatan', to: '/pembayaran/pembatalan' },
        ],
      },
    ],
  },
  {
    title: 'Farmasi & Gudang',
    items: [
      {
        label: 'Depo',
        icon: Pill,
        children: [
          { label: 'Penjualan Langsung', to: '/depo/penjualan-langsung' },
          { label: 'Resep', to: '/depo/resep' },
        ],
      },
      {
        label: 'Warehouse & Stok',
        icon: Warehouse,
        children: [
          { label: 'Gudang / Barang', to: '/warehouse/barang' },
          { label: 'Stok Opname', to: '/warehouse/stok-opname' },
          { label: 'Produksi', to: '/warehouse/produksi' },
          { label: 'Konversi', to: '/warehouse/konversi' },
          { label: 'Kartu Stok', to: '/warehouse/kartu-stok' },
        ],
      },
      {
        label: 'Data Transaksi',
        icon: Receipt,
        children: [
          { label: 'Penjualan', to: '/data-transaksi/penjualan' },
          { label: 'Pembelian', to: '/data-transaksi/pembelian' },
          { label: 'Deposit & Member', to: '/data-transaksi/deposit' },
        ],
      },
    ],
  },
  {
    title: 'Administrasi & Laporan',
    items: [
      {
        label: 'Administrasi',
        icon: Settings2,
        children: [
          { label: 'Pengaturan Umum', to: '/administrasi/pengaturan-umum' },
          { label: 'Pasien', to: '/administrasi/pasien' },
          { label: 'Staff', to: '/administrasi/staff' },
          { label: 'Treatment', to: '/administrasi/treatment' },
          { label: 'Supplier', to: '/administrasi/supplier' },
          { label: 'User', to: '/administrasi/user' },
          { label: 'Bank', to: '/administrasi/bank' },
          { label: 'Cabang', to: '/administrasi/cabang' },
          { label: 'Perusahaan', to: '/administrasi/perusahaan' },
          { label: 'Membership', to: '/administrasi/membership' },
          { label: 'Voucher', to: '/administrasi/voucher' },
          { label: 'Promo', to: '/administrasi/promo' },
          { label: 'Template Informed Consent', to: '/administrasi/template-informed-consent' },
        ],
      },
      {
        label: 'Laporan',
        icon: FileBarChart,
        children: [
          { label: 'FO', to: '/laporan/fo' },
          { label: 'Apotek', to: '/laporan/apotek' },
          { label: 'Nurse', to: '/laporan/nurse' },
          { label: 'DM', to: '/laporan/dm' },
        ],
      },
    ],
  },
]

const badgeClass: Record<string, string> = {
  amber: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
  rose: 'bg-rose-600 text-white border-rose-500/40',
}

type AppSidebarProps = {
  collapsed: boolean
  onToggle: () => void
}

export function AppSidebar({ collapsed, onToggle }: AppSidebarProps) {
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {}
    for (const section of NAV) {
      for (const item of section.items) {
        if (item.children?.some((c) => pathname.startsWith(c.to))) {
          initial[item.label] = true
        }
      }
    }
    return initial
  })

  const initials = useMemo(() => {
    const name = user?.name ?? 'HP'
    return name
      .split(' ')
      .map((p) => p[0])
      .join('')
      .slice(0, 2)
      .toUpperCase()
  }, [user?.name])

  function isActive(to: string) {
    if (to === '/') return pathname === '/'
    return pathname === to || pathname.startsWith(`${to}/`)
  }

  return (
    <aside
      className={cn(
        'relative z-30 flex h-full flex-shrink-0 flex-col border-r border-slate-800 bg-slate-950 text-slate-300 transition-[width] duration-300',
        collapsed ? 'w-20' : 'w-64',
      )}
    >
      <div className="flex h-16 items-center justify-between border-b border-slate-800/80 px-4">
        <Link to="/" className={cn('flex min-w-0 items-center gap-3', collapsed && 'justify-center')}>
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-tr from-rose-600 via-rose-500 to-pink-400 text-white shadow-lg shadow-rose-600/30">
            <HeartPulse className="h-5 w-5" strokeWidth={2.5} />
          </div>
          {!collapsed ? (
            <div className="min-w-0">
              <h1 className="flex items-center gap-1.5 truncate text-base leading-tight font-extrabold text-white">
                Clinic OS
                <span className="rounded bg-gradient-to-r from-amber-400 to-rose-400 px-1.5 py-0.5 text-[9px] font-black tracking-wide text-slate-950 uppercase">
                  Klinik
                </span>
              </h1>
              <p className="text-[11px] font-medium text-rose-300/80">Sistem Operasional Klinik</p>
            </div>
          ) : null}
        </Link>
        <button
          type="button"
          onClick={onToggle}
          className="hidden rounded-lg p-1.5 text-slate-400 hover:bg-slate-900 hover:text-white md:block"
          title={collapsed ? 'Perluas sidebar' : 'Ciutkan sidebar'}
        >
          {collapsed ? <PanelLeftOpen className="h-5 w-5" /> : <PanelLeftClose className="h-5 w-5" />}
        </button>
      </div>

      {!collapsed ? (
        <div className="border-b border-slate-800/60 p-4">
          <label className="mb-1.5 block text-[10px] font-bold tracking-wider text-slate-400 uppercase">
            Unit Cabang
          </label>
          <button
            type="button"
            className="group flex w-full items-center justify-between rounded-xl border border-slate-800 bg-slate-900/90 px-3 py-2.5 text-left transition-colors hover:bg-slate-800/90"
          >
            <div className="min-w-0 truncate">
              <p className="truncate text-xs font-bold text-white">Klinik Utama Sehat</p>
              <p className="truncate text-[11px] text-slate-400">Jakarta Selatan (Cabang 01)</p>
            </div>
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-400 group-hover:text-white" />
          </button>
        </div>
      ) : null}

      <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-4">
        {NAV.map((section) => (
          <div key={section.title}>
            {!collapsed ? (
              <div className="mb-2 px-3 text-[10px] font-bold tracking-wider text-slate-400 uppercase">
                {section.title}
              </div>
            ) : null}
            <div className="space-y-1">
              {section.items.map((item) => {
                const Icon = item.icon
                if (item.to) {
                  const active = isActive(item.to)
                  return (
                    <Link
                      key={item.label}
                      to={item.to}
                      title={item.label}
                      className={cn(
                        'flex w-full items-center justify-between rounded-lg px-3 py-2 text-xs font-medium transition-colors',
                        active
                          ? 'border border-rose-500/20 bg-rose-500/10 font-bold text-rose-400'
                          : 'text-slate-400 hover:bg-slate-900 hover:text-white',
                        collapsed && 'justify-center px-2',
                      )}
                    >
                      <div className={cn('flex items-center', collapsed ? 'justify-center' : 'gap-3')}>
                        <Icon className={cn('h-4 w-4', active ? 'text-rose-400' : 'text-slate-500')} />
                        {!collapsed ? <span>{item.label}</span> : null}
                      </div>
                    </Link>
                  )
                }

                const open = collapsed ? false : Boolean(openGroups[item.label])
                const groupActive = item.children?.some((c) => isActive(c.to))
                return (
                  <div key={item.label} className="space-y-1">
                    <button
                      type="button"
                      title={item.label}
                      onClick={() =>
                        !collapsed && setOpenGroups((prev) => ({ ...prev, [item.label]: !prev[item.label] }))
                      }
                      className={cn(
                        'flex w-full items-center justify-between rounded-lg px-3 py-2 text-xs font-medium transition-colors',
                        groupActive
                          ? 'border border-rose-500/20 bg-rose-500/10 font-bold text-rose-400'
                          : 'text-slate-400 hover:bg-slate-900 hover:text-white',
                        collapsed && 'justify-center px-2',
                      )}
                    >
                      <div className={cn('flex items-center', collapsed ? 'justify-center' : 'gap-3')}>
                        <Icon className={cn('h-4 w-4', groupActive ? 'text-rose-400' : 'text-slate-500')} />
                        {!collapsed ? <span>{item.label}</span> : null}
                      </div>
                      {!collapsed ? (
                        <ChevronDown
                          className={cn(
                            'h-2.5 w-2.5 transition-transform',
                            groupActive ? 'text-rose-400' : 'text-slate-600',
                            open && 'rotate-180',
                          )}
                        />
                      ) : null}
                    </button>
                    {!collapsed && open ? (
                      <div className="space-y-1 pt-1 pr-1 pl-7">
                        {item.children?.map((child) => {
                          const active = isActive(child.to)
                          return (
                            <Link
                              key={child.to}
                              to={child.to}
                              className={cn(
                                'flex items-center justify-between rounded-md px-3 py-1.5 text-xs transition-colors',
                                active
                                  ? 'border-l-2 border-rose-500 bg-slate-900 font-semibold text-white'
                                  : 'font-medium text-slate-400 hover:bg-slate-900/60 hover:text-slate-200',
                              )}
                            >
                              <span>{child.label}</span>
                              {child.badge ? (
                                <span
                                  className={cn(
                                    'rounded-full border px-1.5 py-0.5 text-[10px] font-bold',
                                    badgeClass[child.badgeTone ?? 'rose'],
                                  )}
                                >
                                  {child.badge}
                                </span>
                              ) : null}
                            </Link>
                          )
                        })}
                      </div>
                    ) : null}
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="flex items-center justify-between border-t border-slate-800/80 bg-slate-950 p-3">
        <div className={cn('flex min-w-0 items-center gap-2.5', collapsed && 'w-full justify-center')}>
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-tr from-rose-600 to-pink-500 text-xs font-bold text-white ring-2 ring-rose-500/30">
            {initials}
          </div>
          {!collapsed ? (
            <div className="min-w-0 truncate">
              <p className="truncate text-xs font-bold text-white">{user?.name ?? 'Staff'}</p>
              <p className="truncate text-[11px] font-medium text-rose-400">{user?.role ?? 'Online'}</p>
            </div>
          ) : null}
        </div>
        {!collapsed ? (
          <button
            type="button"
            title="Keluar / Logout"
            className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-900 hover:text-rose-400"
            onClick={() => {
              logout()
              window.location.href = '/login'
            }}
          >
            <LogOut className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </div>
      {collapsed ? (
        <div className="border-t border-slate-800 p-2">
          <button
            type="button"
            className="flex w-full items-center justify-center rounded-lg p-2 text-slate-400 hover:bg-slate-900 hover:text-rose-400"
            onClick={() => {
              logout()
              window.location.href = '/login'
            }}
            title="Keluar"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      ) : null}
    </aside>
  )
}
