import {
  Outlet,
  createRootRoute,
  createRoute,
  createRouter,
  redirect,
} from '@tanstack/react-router'
import { AppLayout } from '@/app/layouts/AppLayout'
import { LoginPage } from '@/features/auth/LoginPage'
import { useAuthStore } from '@/features/auth/store'
import { DashboardPage } from '@/features/dashboard/DashboardPage'
import { KunjunganPage } from '@/features/resepsionis/KunjunganPage'
import { AppointmentPage } from '@/features/resepsionis/AppointmentPage'
import { PerawatanListPage } from '@/features/perawatan/PerawatanListPage'
import { DetailPerawatanPage } from '@/features/perawatan/DetailPerawatanPage'
import { RiwayatPage } from '@/features/perawatan/RiwayatPage'
import { PembayaranPerawatanPage } from '@/features/pembayaran/PembayaranPerawatanPage'
import { PembayaranProdukPage } from '@/features/pembayaran/PembayaranProdukPage'
import { PembayaranDepositPage } from '@/features/pembayaran/PembayaranDepositPage'
import { PembatalanPaketPage } from '@/features/pembayaran/PembatalanPaketPage'
import { PenjualanLangsungPage } from '@/features/depo/PenjualanLangsungPage'
import { ResepPage } from '@/features/depo/ResepPage'
import { BarangPage } from '@/features/warehouse/BarangPage'
import { StokOpnamePage } from '@/features/warehouse/StokOpnamePage'
import { ProduksiPage } from '@/features/warehouse/ProduksiPage'
import { KonversiPage } from '@/features/warehouse/KonversiPage'
import { PenjualanPage } from '@/features/data-transaksi/PenjualanPage'
import { PembelianPage } from '@/features/data-transaksi/PembelianPage'
import { PasienPage } from '@/features/administrasi/pasien'
import { StaffPage } from '@/features/administrasi/staff'
import { TreatmentPage } from '@/features/administrasi/treatment'
import { SupplierPage } from '@/features/administrasi/supplier'
import { UserPage } from '@/features/administrasi/user'
import { BankPage } from '@/features/administrasi/bank'
import { CabangPage } from '@/features/administrasi/cabang'
import { PerusahaanPage } from '@/features/administrasi/perusahaan'
import { MembershipPage } from '@/features/administrasi/membership'
import { VoucherPage } from '@/features/administrasi/voucher'
import { PromoPage } from '@/features/administrasi/promo'
import { FoPage } from '@/features/laporan/FoPage'
import { ApotekPage } from '@/features/laporan/ApotekPage'
import { NursePage } from '@/features/laporan/NursePage'
import { DmPage } from '@/features/laporan/DmPage'

function requireAuth() {
  const token = localStorage.getItem('clinic_access_token')
  if (!token) {
    throw redirect({ to: '/login' })
  }
}

function redirectIfAuthed() {
  const token = localStorage.getItem('clinic_access_token')
  if (token) {
    throw redirect({ to: '/' })
  }
}

const rootRoute = createRootRoute({
  component: () => <Outlet />,
})

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/login',
  beforeLoad: () => {
    useAuthStore.getState().hydrate()
    redirectIfAuthed()
  },
  component: LoginPage,
})

const appRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: 'app',
  beforeLoad: () => {
    useAuthStore.getState().hydrate()
    requireAuth()
  },
  component: AppLayout,
})

const dashboardRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/',
  component: DashboardPage,
})

const kunjunganRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/resepsionis/kunjungan',
  component: KunjunganPage,
})

const appointmentRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/resepsionis/appointment',
  component: AppointmentPage,
})

const perawatanRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/perawatan',
  component: PerawatanListPage,
})

const perawatanDetailRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/perawatan/detail',
  component: DetailPerawatanPage,
})

const perawatanRiwayatRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/perawatan/riwayat',
  component: RiwayatPage,
})

const bayarPerawatanRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/pembayaran/perawatan',
  component: PembayaranPerawatanPage,
})

const bayarProdukRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/pembayaran/produk',
  component: PembayaranProdukPage,
})

const bayarDepositRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/pembayaran/deposit',
  component: PembayaranDepositPage,
})

const batalPaketRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/pembayaran/pembatalan',
  component: PembatalanPaketPage,
})

const depoPenjualanRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/depo/penjualan-langsung',
  component: PenjualanLangsungPage,
})

const depoResepRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/depo/resep',
  component: ResepPage,
})

const barangRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/warehouse/barang',
  component: BarangPage,
})

const stokOpnameRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/warehouse/stok-opname',
  component: StokOpnamePage,
})

const produksiRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/warehouse/produksi',
  component: ProduksiPage,
})

const konversiRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/warehouse/konversi',
  component: KonversiPage,
})

const penjualanRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/data-transaksi/penjualan',
  component: PenjualanPage,
})

const pembelianRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/data-transaksi/pembelian',
  component: PembelianPage,
})

const pasienRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/administrasi/pasien',
  component: PasienPage,
})

const staffRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/administrasi/staff',
  component: StaffPage,
})

const treatmentRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/administrasi/treatment',
  component: TreatmentPage,
})

const supplierRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/administrasi/supplier',
  component: SupplierPage,
})

const userRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/administrasi/user',
  component: UserPage,
})

const bankRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/administrasi/bank',
  component: BankPage,
})

const cabangRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/administrasi/cabang',
  component: CabangPage,
})

const perusahaanRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/administrasi/perusahaan',
  component: PerusahaanPage,
})

const membershipRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/administrasi/membership',
  component: MembershipPage,
})

const voucherRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/administrasi/voucher',
  component: VoucherPage,
})

const promoRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/administrasi/promo',
  component: PromoPage,
})

const laporanFoRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/laporan/fo',
  component: FoPage,
})

const laporanApotekRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/laporan/apotek',
  component: ApotekPage,
})

const laporanNurseRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/laporan/nurse',
  component: NursePage,
})

const laporanDmRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/laporan/dm',
  component: DmPage,
})

const routeTree = rootRoute.addChildren([
  loginRoute,
  appRoute.addChildren([
    dashboardRoute,
    kunjunganRoute,
    appointmentRoute,
    perawatanRoute,
    perawatanDetailRoute,
    perawatanRiwayatRoute,
    bayarPerawatanRoute,
    bayarProdukRoute,
    bayarDepositRoute,
    batalPaketRoute,
    depoPenjualanRoute,
    depoResepRoute,
    barangRoute,
    stokOpnameRoute,
    produksiRoute,
    konversiRoute,
    penjualanRoute,
    pembelianRoute,
    pasienRoute,
    staffRoute,
    treatmentRoute,
    supplierRoute,
    userRoute,
    bankRoute,
    cabangRoute,
    perusahaanRoute,
    membershipRoute,
    voucherRoute,
    promoRoute,
    laporanFoRoute,
    laporanApotekRoute,
    laporanNurseRoute,
    laporanDmRoute,
  ]),
])

export const router = createRouter({
  routeTree,
  defaultPreload: 'intent',
})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
