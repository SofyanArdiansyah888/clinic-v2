import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { FolderTree, Lock, Pencil, Plus, Search, Trash2 } from 'lucide-react'
import { useMemo, useState, type FormEvent } from 'react'
import { apiDelete, apiGet, apiPost, apiPut } from '@/shared/api/client'
import { Dialog } from '@/shared/components/Dialog'
import { PageHeader } from '@/shared/components/PageHeader'
import { Button } from '@/shared/ui/button'
import { Card } from '@/shared/ui/card'
import { Input } from '@/shared/ui/input'
import { cn } from '@/shared/lib/cn'
import { apiErrorMessage, TIPE_LABEL, type Akun, type TipeAkun } from '@/features/finance/types'

const TIPE_ORDER: TipeAkun[] = ['aset', 'kewajiban', 'ekuitas', 'pendapatan', 'beban']

type FormState = {
  kode: string
  nama: string
  tipe: TipeAkun
  saldo_normal: '' | 'debit' | 'kredit'
  parent_id: string
  is_header: boolean
  is_active: boolean
  keterangan: string
}

const emptyForm: FormState = {
  kode: '',
  nama: '',
  tipe: 'aset',
  saldo_normal: '',
  parent_id: '',
  is_header: false,
  is_active: true,
  keterangan: '',
}

const fieldLabel = 'text-[11px] font-bold uppercase tracking-wider text-slate-500'
const selectClass =
  'h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-xs text-slate-900 focus:border-rose-600 focus:outline-none'

// Orders accounts as a tree: each account follows its parent, sorted by kode.
function toTree(akuns: Akun[]) {
  const children = new Map<number | null, Akun[]>()
  for (const a of akuns) {
    const key = a.parent_id && akuns.some((p) => p.id === a.parent_id) ? a.parent_id : null
    children.set(key, [...(children.get(key) ?? []), a])
  }
  const out: { akun: Akun; depth: number }[] = []
  const walk = (parent: number | null, depth: number) => {
    for (const a of (children.get(parent) ?? []).sort((x, y) => x.kode.localeCompare(y.kode))) {
      out.push({ akun: a, depth })
      walk(a.id, depth + 1)
    }
  }
  walk(null, 0)
  return out
}

export function AkunPage() {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState<Akun | null>(null)
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState<FormState>(emptyForm)
  const [error, setError] = useState<string | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['finance', 'akun', 'all'],
    queryFn: () => apiGet<Akun[]>('/finance/akun'),
  })
  const akuns = useMemo(() => data?.data ?? [], [data?.data])

  const groups = useMemo(() => {
    const q = search.trim().toLowerCase()
    return TIPE_ORDER.map((tipe) => {
      const ofTipe = akuns.filter((a) => a.tipe === tipe)
      const rows = toTree(ofTipe).filter(
        ({ akun }) => !q || akun.kode.toLowerCase().includes(q) || akun.nama.toLowerCase().includes(q),
      )
      return { tipe, rows }
    })
  }, [akuns, search])

  const headerOptions = akuns.filter((a) => a.is_header && a.tipe === form.tipe && a.id !== editing?.id)

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['finance', 'akun'] })

  const saveMutation = useMutation({
    mutationFn: () => {
      const body = {
        ...form,
        saldo_normal: form.saldo_normal || undefined,
        parent_id: form.parent_id ? Number(form.parent_id) : null,
      }
      return editing ? apiPut(`/finance/akun/${editing.id}`, body) : apiPost('/finance/akun', body)
    },
    onSuccess: () => {
      void invalidate()
      setOpen(false)
    },
    onError: (err) => setError(apiErrorMessage(err, 'Gagal menyimpan akun')),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiDelete(`/finance/akun/${id}`),
    onSuccess: () => void invalidate(),
    onError: (err) => window.alert(apiErrorMessage(err, 'Gagal menghapus akun')),
  })

  function openCreate() {
    setEditing(null)
    setForm(emptyForm)
    setError(null)
    setOpen(true)
  }

  function openEdit(a: Akun) {
    setEditing(a)
    setForm({
      kode: a.kode,
      nama: a.nama,
      tipe: a.tipe,
      saldo_normal: a.saldo_normal,
      parent_id: a.parent_id ? String(a.parent_id) : '',
      is_header: a.is_header,
      is_active: a.is_active,
      keterangan: a.keterangan ?? '',
    })
    setError(null)
    setOpen(true)
  }

  function submit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    saveMutation.mutate()
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Daftar Akun (COA)"
        description="Bagan akun untuk pencatatan jurnal. Akun header hanya mengelompokkan dan tidak bisa diposting."
        actions={
          <Button onClick={openCreate} className="gap-1.5">
            <Plus className="h-4 w-4" />
            Tambah Akun
          </Button>
        }
      />

      <div className="relative max-w-sm">
        <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari kode atau nama akun..." className="pl-9" />
      </div>

      {isLoading ? <p className="text-sm text-slate-500">Memuat akun...</p> : null}

      <div className="grid gap-4 xl:grid-cols-2">
        {groups.map(({ tipe, rows }) => (
          <Card key={tipe} className="overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-4 py-2.5">
              <h3 className="text-xs font-extrabold tracking-wider text-slate-700 uppercase">{TIPE_LABEL[tipe]}</h3>
              <span className="text-[11px] text-slate-500">{rows.length} akun</span>
            </div>
            {rows.length === 0 ? (
              <p className="px-4 py-6 text-center text-xs text-slate-400">Tidak ada akun</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {rows.map(({ akun, depth }) => (
                  <li key={akun.id} className="flex items-center gap-2 px-4 py-2 text-xs hover:bg-slate-50">
                    <div className="flex min-w-0 flex-1 items-center gap-2" style={{ paddingLeft: depth * 18 }}>
                      {akun.is_header ? <FolderTree className="h-3.5 w-3.5 shrink-0 text-slate-400" /> : null}
                      <span className="shrink-0 font-mono text-[11px] text-rose-700">{akun.kode}</span>
                      <span className={cn('truncate', akun.is_header ? 'font-bold text-slate-900' : 'text-slate-700')}>{akun.nama}</span>
                      {akun.saldo_normal !== (tipe === 'aset' || tipe === 'beban' ? 'debit' : 'kredit') ? (
                        <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">kontra</span>
                      ) : null}
                      {!akun.is_active ? (
                        <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-bold text-slate-600">nonaktif</span>
                      ) : null}
                    </div>
                    {akun.is_system ? (
                      <span title="Akun bawaan sistem">
                        <Lock className="h-3 w-3 text-slate-300" />
                      </span>
                    ) : null}
                    <button type="button" onClick={() => openEdit(akun)} className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-rose-700" title="Edit">
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    {!akun.is_system ? (
                      <button
                        type="button"
                        title="Hapus"
                        className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                        onClick={() => {
                          if (window.confirm(`Hapus akun ${akun.kode} ${akun.nama}?`)) deleteMutation.mutate(akun.id)
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        ))}
      </div>

      <Dialog open={open} onClose={() => setOpen(false)} title={editing ? 'Edit Akun' : 'Tambah Akun'}>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <label className={fieldLabel} htmlFor="akun-kode">Kode</label>
              <Input id="akun-kode" required value={form.kode} onChange={(e) => setForm((f) => ({ ...f, kode: e.target.value }))} placeholder="1-1202" />
            </div>
            <div className="col-span-2 space-y-1.5">
              <label className={fieldLabel} htmlFor="akun-nama">Nama</label>
              <Input id="akun-nama" required value={form.nama} onChange={(e) => setForm((f) => ({ ...f, nama: e.target.value }))} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className={fieldLabel} htmlFor="akun-tipe">Tipe</label>
              <select
                id="akun-tipe"
                className={selectClass}
                value={form.tipe}
                onChange={(e) => setForm((f) => ({ ...f, tipe: e.target.value as TipeAkun, parent_id: '', saldo_normal: '' }))}
              >
                {TIPE_ORDER.map((t) => (
                  <option key={t} value={t}>{TIPE_LABEL[t]}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className={fieldLabel} htmlFor="akun-saldo">Saldo Normal</label>
              <select
                id="akun-saldo"
                className={selectClass}
                value={form.saldo_normal}
                onChange={(e) => setForm((f) => ({ ...f, saldo_normal: e.target.value as FormState['saldo_normal'] }))}
              >
                <option value="">Ikuti tipe akun</option>
                <option value="debit">Debit</option>
                <option value="kredit">Kredit (atau kontra)</option>
              </select>
            </div>
          </div>
          <div className="space-y-1.5">
            <label className={fieldLabel} htmlFor="akun-parent">Akun Induk</label>
            <select
              id="akun-parent"
              className={selectClass}
              value={form.parent_id}
              onChange={(e) => setForm((f) => ({ ...f, parent_id: e.target.value }))}
            >
              <option value="">Tanpa induk</option>
              {headerOptions.map((a) => (
                <option key={a.id} value={a.id}>{`${a.kode} · ${a.nama}`}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className={fieldLabel} htmlFor="akun-ket">Keterangan</label>
            <textarea
              id="akun-ket"
              rows={2}
              value={form.keterangan}
              onChange={(e) => setForm((f) => ({ ...f, keterangan: e.target.value }))}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-xs focus:border-rose-600 focus:outline-none"
            />
          </div>
          <div className="flex flex-wrap gap-5 text-xs text-slate-700">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={form.is_header} onChange={(e) => setForm((f) => ({ ...f, is_header: e.target.checked }))} />
              Akun header (pengelompok)
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={form.is_active} onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))} />
              Aktif
            </label>
          </div>
          {error ? <div className="rounded-xl bg-rose-50 p-3 text-xs font-semibold text-rose-700">{error}</div> : null}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>Batal</Button>
            <Button type="submit" disabled={saveMutation.isPending}>Simpan</Button>
          </div>
        </form>
      </Dialog>
    </div>
  )
}
