import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Loader2, Plus, Save, Trash2 } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { apiPut } from '@/shared/api/client'
import { Dialog } from '@/shared/components/Dialog'
import { toast } from '@/shared/components/Toaster'
import { TreatmentSelect, type TreatmentLite } from '@/shared/components/TreatmentSelect'
import { Button } from '@/shared/ui/button'
import { FormAlert } from '@/shared/ui/field'
import { formatCurrency } from '@/shared/lib/formatters'

export type PaketItem = {
  id?: number
  treatment_id: number
  sesi: number
  treatment?: { id: number; nama: string; harga: number; kategori?: string }
}

export type PaketTreatment = {
  id: number
  nama: string
  kategori?: string
  harga: number
  durasi?: number
  sesi_paket?: number
  komisi_dokter?: number
  komisi_terapis?: number
  deskripsi?: string
  is_active: boolean
  items?: PaketItem[]
}

type Line = { key: number; treatmentId: string; harga: number; nama: string; sesi: string }

let nextKey = 1

function newLine(): Line {
  return { key: nextKey++, treatmentId: '', harga: 0, nama: '', sesi: '1' }
}

const inputClass =
  'w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:border-rose-500 focus:outline-none'

/**
 * Edits what a paket treatment contains (e.g. 3x Facial + 2x Peeling). The package
 * price is split over the items by treatment price x sessions; the preview shows the
 * value per session the kasir will move from titipan to pendapatan.
 */
export function PaketItemsDialog({ paket, onClose }: { paket: PaketTreatment | null; onClose: () => void }) {
  const queryClient = useQueryClient()
  const [lines, setLines] = useState<Line[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!paket) return
    setError(null)
    // A paket that only contains itself is shown as empty: pick its treatments here.
    const items = (paket.items ?? []).filter((it) => it.treatment_id !== paket.id)
    setLines(
      items.length
        ? items.map((it) => ({
            key: nextKey++,
            treatmentId: String(it.treatment_id),
            harga: it.treatment?.harga ?? 0,
            nama: it.treatment?.nama ?? '',
            sesi: String(it.sesi),
          }))
        : [newLine()],
    )
  }, [paket])

  function update(key: number, patch: Partial<Line>) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)))
  }

  const filled = lines.filter((l) => l.treatmentId)
  const totalSesi = filled.reduce((s, l) => s + (Number(l.sesi) || 0), 0)
  const bobot = filled.reduce((s, l) => s + l.harga * (Number(l.sesi) || 0), 0)
  function nilaiPerSesi(l: Line) {
    const sesi = Number(l.sesi) || 0
    if (!paket || sesi <= 0) return 0
    const share = bobot > 0 ? (l.harga * sesi) / bobot : totalSesi > 0 ? sesi / totalSesi : 0
    return (paket.harga * share) / sesi
  }

  const save = useMutation({
    mutationFn: async () => {
      if (!paket) return
      const ids = filled.map((l) => l.treatmentId)
      if (new Set(ids).size !== ids.length) throw new Error('Treatment yang sama dipilih lebih dari sekali')
      for (const l of filled) {
        if (!(Number(l.sesi) > 0)) throw new Error(`Jumlah sesi ${l.nama || 'treatment'} harus lebih dari 0`)
      }
      return apiPut(`/treatment/${paket.id}`, {
        nama: paket.nama,
        kategori: paket.kategori,
        harga: paket.harga,
        durasi: paket.durasi ?? 0,
        komisi_dokter: paket.komisi_dokter ?? 0,
        komisi_terapis: paket.komisi_terapis ?? 0,
        deskripsi: paket.deskripsi ?? '',
        is_active: paket.is_active,
        items: filled.map((l) => ({ treatment_id: Number(l.treatmentId), sesi: Math.floor(Number(l.sesi)) })),
      })
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['treatment'] })
      toast('Isi paket disimpan')
      onClose()
    },
    onError: (err: unknown) => {
      setError(
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
          (err instanceof Error ? err.message : 'Gagal menyimpan'),
      )
    },
  })

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    save.mutate()
  }

  return (
    <Dialog
      open={!!paket}
      onClose={onClose}
      title={`Isi Paket · ${paket?.nama ?? ''}`}
      description={`Harga paket ${formatCurrency(paket?.harga ?? 0)}. Kosongkan semua baris agar paket berisi dirinya sendiri.`}
      className="max-w-3xl"
    >
      <form onSubmit={onSubmit} className="max-h-[75vh] space-y-4 overflow-y-auto p-5" data-testid="paket-items-form">
        <div className="space-y-2">
          {lines.map((l, i) => (
            <div key={l.key} className="grid grid-cols-12 items-start gap-2 rounded-xl border border-slate-100 bg-slate-50/60 p-2">
              <div className="col-span-12 md:col-span-6">
                <TreatmentSelect
                  id={`paket-item-treatment-${i}`}
                  value={l.treatmentId}
                  excludeKategori="paket"
                  required={l.sesi !== '' && lines.length > 1}
                  onChange={(v, t?: TreatmentLite) => update(l.key, { treatmentId: v, harga: t?.harga ?? 0, nama: t?.nama ?? '' })}
                />
                {l.treatmentId ? (
                  <p className="mt-1 text-[11px] text-slate-500">
                    Harga normal {formatCurrency(l.harga)} · nilai per sesi di paket ≈{' '}
                    <span className="font-semibold">{formatCurrency(Math.round(nilaiPerSesi(l)))}</span>
                  </p>
                ) : null}
              </div>
              <div className="col-span-8 md:col-span-4">
                <input
                  id={`paket-item-sesi-${i}`}
                  type="number"
                  min={1}
                  value={l.sesi}
                  onChange={(e) => update(l.key, { sesi: e.target.value })}
                  placeholder="Sesi"
                  aria-label="Jumlah sesi"
                  className={inputClass}
                />
              </div>
              <div className="col-span-4 md:col-span-2">
                <Button
                  type="button"
                  variant="ghost-danger"
                  size="icon"
                  title="Hapus baris"
                  aria-label="Hapus baris"
                  onClick={() => setLines((prev) => (prev.length <= 1 ? [newLine()] : prev.filter((x) => x.key !== l.key)))}
                >
                  <Trash2 />
                </Button>
              </div>
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" onClick={() => setLines((prev) => [...prev, newLine()])}>
            <Plus />
            Tambah Treatment
          </Button>
        </div>

        <div className="flex items-center justify-between rounded-xl border border-rose-100 bg-rose-50/60 px-4 py-3">
          <span className="text-[11px] font-bold uppercase tracking-wider text-rose-700">Total sesi</span>
          <span className="text-lg font-extrabold text-slate-900" data-testid="paket-total-sesi">
            {filled.length ? totalSesi : paket?.sesi_paket || 1}x
          </span>
        </div>

        <FormAlert>{error}</FormAlert>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Batal
          </Button>
          <Button type="submit" disabled={save.isPending}>
            {save.isPending ? <Loader2 className="animate-spin" /> : <Save />}
            Simpan Isi Paket
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
