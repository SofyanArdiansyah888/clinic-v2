export type Role = 'admin' | 'doctor' | 'staff' | 'apoteker' | 'nurse' | 'finance'

const FO: Role[] = ['admin', 'staff']
const KLINIS: Role[] = ['admin', 'staff', 'doctor', 'nurse']
const FARMASI: Role[] = ['admin', 'apoteker']
const FINANCE: Role[] = ['admin', 'finance']

// Page access per role; the first matching prefix wins and unlisted pages are admin only.
// This only shapes the UI — the API enforces the same split in middleware/rbac.go.
const PAGE_ACCESS: [prefix: string, roles: Role[]][] = [
  ['/resepsionis', FO],
  ['/perawatan', KLINIS],
  ['/pembayaran', FO],
  ['/depo', FARMASI],
  ['/warehouse', FARMASI],
  ['/data-transaksi/penjualan', ['admin', 'staff', 'apoteker']],
  ['/data-transaksi/pembelian', ['admin', 'apoteker', 'finance']],
  ['/data-transaksi/deposit', FO],
  ['/administrasi/pasien', FO],
  ['/administrasi/membership', FO],
  ['/administrasi/supplier', FARMASI],
  ['/finance', FINANCE],
  ['/laporan/fo', ['admin', 'staff', 'finance']],
  ['/laporan/apotek', ['admin', 'apoteker', 'finance']],
  ['/laporan/nurse', ['admin', 'nurse']],
  ['/laporan/dm', ['admin', 'doctor']],
]

export function canAccess(role: string | undefined, path: string) {
  if (role === 'admin') return true
  if (!role) return false
  if (path === '/') return true
  const match = PAGE_ACCESS.find(([prefix]) => path === prefix || path.startsWith(prefix + '/'))
  return match ? match[1].includes(role as Role) : false
}

export const ROLE_LABEL: Record<string, string> = {
  admin: 'Admin Klinik',
  doctor: 'Dokter',
  staff: 'Front Office / Kasir',
  apoteker: 'Apoteker / Depo',
  nurse: 'Nurse / Terapis',
  finance: 'Finance / Akuntansi',
}
