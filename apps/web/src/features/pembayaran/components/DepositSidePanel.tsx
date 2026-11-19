import { useQuery } from '@tanstack/react-query'
import { Crown, History, Search, Wallet } from 'lucide-react'
import { useMemo, useState } from 'react'
import { apiGet } from '@/shared/api/client'
import { DataTable, type Column } from '@/shared/components/DataTable'
import { StatusBadge } from '@/shared/components/StatusBadge'
import { formatCurrency, formatDate } from '@/shared/lib/formatters'
import { Tabs } from '@/shared/ui/tabs'

type DepositRow = {
  id: number
  kode: string
  tanggal: string
  jenis: string
  jumlah: number
  jenis_pembayaran?: string
  pasien?: { id: number; nama?: string }
  treatment?: { nama?: string }
}

type MembershipRow = {
  id: number
  kode: string
  pasien_id: number
  tipe?: string
  points: number
  is_active: boolean
  pasien?: { nama?: string }
}

type Saldo = { saldo_deposit: number; membership_id: number | null; poin: number }

const DEPOSIT_JENIS_LABEL: Record<string, string> = {
  pembayaran_deposit: 'Deposit',
  pembayaran_deposit_treatment: 'Deposit Treatment',
  pendaftaran_member: 'Daftar Member',
  perpanjangan_member: 'Perpanjang Member',
  pemakaian_deposit: 'Pemakaian Deposit',
}

// Only real tiers are shown; anything else (e.g. a stored transaction type) reads as a plain member.
const TIERS = ['Bronze', 'Silver', 'Gold', 'Platinum']
const tierLabel = (tipe?: string) => TIERS.find((x) => x.toLowerCase() === (tipe ?? '').toLowerCase()) ?? 'Member'

const METODE_LABEL: Record<string, string> = {
  tunai: 'Tunai',
  transfer: 'Transfer',
  kartu_debit: 'Debit',
  kartu_kredit: 'Kartu Kredit',
  e_money: 'E-Money',
}

const depositColumns: Column<DepositRow>[] = [
  {
    key: 'tanggal',
    header: 'Tanggal',
    cell: (r) => (
      <div>
        <div className="text-xs font-semibold text-slate-900">{formatDate(r.tanggal)}</div>
        <div className="font-mono text-[11px] text-slate-400">{r.kode}</div>
      </div>
    ),
  },
  {
    key: 'pasien',
    header: 'Pasien & Jenis',
    cell: (r) => (
      <div className="min-w-0 text-xs">
        <div className="truncate font-semibold text-slate-800">{r.pasien?.nama || '-'}</div>
        <div className="truncate text-[11px] text-slate-500">
          {[
            DEPOSIT_JENIS_LABEL[r.jenis] ?? r.jenis,
            r.treatment?.nama,
            r.jenis_pembayaran ? (METODE_LABEL[r.jenis_pembayaran] ?? r.jenis_pembayaran) : null,
          ]
            .filter(Boolean)
            .join(' · ')}
        </div>
      </div>
    ),
  },
  {
    key: 'jumlah',
    header: 'Jumlah',
    cell: (r) => (
      <span className={r.jenis === 'pemakaian_deposit' ? 'text-xs font-bold text-rose-600' : 'text-xs font-bold text-slate-900'}>
        {r.jenis === 'pemakaian_deposit' ? '−' : ''}
        {formatCurrency(Math.abs(r.jumlah))}
      </span>
    ),
  },
]

const memberColumns: Column<MembershipRow>[] = [
  {
    key: 'kode',
    header: 'Member',
    cell: (r) => (
      <div>
        <div className="text-xs font-semibold text-slate-900">{r.pasien?.nama || `Pasien #${r.pasien_id}`}</div>
        <div className="font-mono text-[11px] text-slate-400">{r.kode}</div>
      </div>
    ),
  },
  {
    key: 'tipe',
    header: 'Tier',
    cell: (r) => (
      <span className="rounded border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-800 uppercase">{tierLabel(r.tipe)}</span>
    ),
  },
  { key: 'points', header: 'Poin', cell: (r) => <span className="text-xs font-bold text-slate-900 tabular-nums">{r.points.toLocaleString('id-ID')}</span> },
  { key: 'status', header: 'Status', cell: (r) => <StatusBadge status={r.is_active} /> },
]

/**
 * Next to the deposit form: the selected patient's balance and membership, the deposit
 * history and the membership list. Both lists narrow to the patient picked in the form.
 */
export function DepositSidePanel({ pasienId }: { pasienId: string }) {
  const [tab, setTab] = useState<'riwayat' | 'member'>('riwayat')
  const [search, setSearch] = useState('')

  const deposits = useQuery({
    queryKey: ['deposit-riwayat', 'panel', pasienId],
    queryFn: () => apiGet<DepositRow[]>('/pembayaran/deposit', { per_page: 50, page: 1, pasien_id: pasienId || undefined }),
  })
  const members = useQuery({
    queryKey: ['membership', 'panel'],
    queryFn: () => apiGet<MembershipRow[]>('/membership', { per_page: 200, page: 1 }),
  })
  const pasien = useQuery({
    queryKey: ['pasien', 'detail', pasienId],
    queryFn: () => apiGet<{ nama?: string }>(`/pasien/${pasienId}`),
    enabled: !!pasienId,
  })
  const pasienNama = pasien.data?.data?.nama
  const saldo = useQuery({
    queryKey: ['deposit-saldo', pasienId],
    queryFn: () => apiGet<Saldo>('/pembayaran/deposit/saldo', { pasien_id: pasienId }),
    enabled: !!pasienId,
  })

  const q = search.trim().toLowerCase()
  const depositRows = useMemo(
    () => (deposits.data?.data ?? []).filter((r) => !q || `${r.pasien?.nama ?? ''} ${r.kode}`.toLowerCase().includes(q)),
    [deposits.data, q],
  )
  const memberRows = useMemo(
    () =>
      (members.data?.data ?? []).filter(
        (r) =>
          (!pasienId || String(r.pasien_id) === pasienId) &&
          (!q || `${r.pasien?.nama ?? ''} ${r.kode} ${r.tipe ?? ''}`.toLowerCase().includes(q)),
      ),
    [members.data, pasienId, q],
  )
  const s = saldo.data?.data
  const member = s?.membership_id ? members.data?.data?.find((m) => m.id === s.membership_id) : undefined

  return (
    <section aria-label="Riwayat deposit dan membership" className="min-w-0 space-y-4">
      {pasienId ? (
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
            <p className="flex items-center gap-1.5 text-[11px] font-bold tracking-wider text-slate-500 uppercase">
              <Wallet className="h-3.5 w-3.5" /> Saldo deposit
            </p>
            <p className="mt-1 text-xl font-bold text-slate-900 tabular-nums">{s ? formatCurrency(s.saldo_deposit) : '…'}</p>
            <p className="truncate text-[11px] text-slate-500">{pasienNama || 'Pasien terpilih'}</p>
          </div>
          <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
            <p className="flex items-center gap-1.5 text-[11px] font-bold tracking-wider text-slate-500 uppercase">
              <Crown className="h-3.5 w-3.5" /> Membership
            </p>
            {s && !s.membership_id ? (
              <>
                <p className="mt-1 text-sm font-bold text-slate-400">Belum member</p>
                <p className="text-[11px] text-slate-500">Pilih jenis "Pendaftaran Member" untuk mendaftarkan.</p>
              </>
            ) : (
              <>
                <p className="mt-1 text-xl font-bold text-slate-900 tabular-nums">{s ? `${s.poin.toLocaleString('id-ID')} poin` : '…'}</p>
                <p className="truncate text-[11px] text-slate-500">{member ? `${tierLabel(member.tipe)} · ${member.kode}` : ''}</p>
              </>
            )}
          </div>
        </div>
      ) : null}

      <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
          <Tabs
            value={tab}
            onChange={setTab}
            items={[
              { value: 'riwayat', label: 'Riwayat Deposit', icon: <History />, count: depositRows.length },
              { value: 'member', label: 'Membership', icon: <Crown />, count: memberRows.length },
            ]}
          />
          <label className="relative min-w-0 flex-1 sm:max-w-56">
            <span className="sr-only">Cari pasien atau kode</span>
            <Search className="pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              id="deposit-panel-search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari pasien / kode..."
              className="w-full rounded-xl border border-slate-200 py-2 pr-3 pl-8 text-xs focus:border-rose-500 focus:outline-none"
            />
          </label>
        </div>
        {pasienId ? (
          <p className="border-b border-slate-100 bg-rose-50/50 px-4 py-2 text-[11px] text-slate-600">
            Menampilkan data <b>{pasienNama || 'pasien terpilih'}</b>. Kosongkan pilihan pasien di form untuk melihat semua.
          </p>
        ) : null}
        {tab === 'riwayat' ? (
          <DataTable
            columns={depositColumns}
            data={depositRows}
            rowKey={(r) => r.id}
            compact
            emptyTitle={deposits.isLoading ? 'Memuat...' : 'Belum ada transaksi deposit'}
            emptyDescription={pasienId ? 'Pasien ini belum punya transaksi deposit.' : 'Transaksi yang disimpan akan muncul di sini.'}
          />
        ) : (
          <DataTable
            columns={memberColumns}
            data={memberRows}
            rowKey={(r) => r.id}
            compact
            emptyTitle={members.isLoading ? 'Memuat...' : 'Belum ada member'}
            emptyDescription={pasienId ? 'Pasien ini belum terdaftar sebagai member.' : 'Daftarkan member lewat jenis "Pendaftaran Member".'}
          />
        )}
      </div>
    </section>
  )
}
