import type { ApotekData, DmData, FinanceData, FoData, NurseData } from './data'

// Automatic findings for each chapter, written as plain sentences a division head can
// read out. Rules only use the report numbers, so the same data always gives the same text.

export type Tone = 'naik' | 'turun' | 'perhatian' | 'info'
export type Insight = { tone: Tone; text: string; weight: number }

const rp = (n: number) =>
  new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(n)
const num = (n: number) => new Intl.NumberFormat('id-ID', { maximumFractionDigits: 1 }).format(n)
const pct = (n: number) => `${num(n)}%`

function change(cur: number, prev: number) {
  return prev === 0 ? null : ((cur - prev) / Math.abs(prev)) * 100
}

/** "Kunjungan naik 12,5% (80 → 90)". Skipped when nothing happened in either period. */
function trend(label: string, cur: number, prev: number, fmt: (n: number) => string, goodWhenUp = true): Insight | null {
  if (cur === 0 && prev === 0) return null
  const c = change(cur, prev)
  if (c === null) return { tone: 'info', text: `${label} ${fmt(cur)}; periode sebelumnya belum ada data untuk dibandingkan.`, weight: 1 }
  if (Math.abs(c) < 0.5) return { tone: 'info', text: `${label} stabil di ${fmt(cur)} (sebelumnya ${fmt(prev)}).`, weight: 1 }
  const up = c > 0
  return {
    tone: up === goodWhenUp ? 'naik' : 'turun',
    text: `${label} ${up ? 'naik' : 'turun'} ${pct(Math.abs(c))}, dari ${fmt(prev)} menjadi ${fmt(cur)}.`,
    weight: Math.min(Math.abs(c), 200) / 10 + 1,
  }
}

function share<T>(rows: T[] | null, value: (r: T) => number) {
  const list = (rows ?? []).filter((r) => value(r) > 0)
  const total = list.reduce((s, r) => s + value(r), 0)
  if (!list.length || total === 0) return null
  const top = list.reduce((a, b) => (value(b) > value(a) ? b : a))
  const part = (value(top) / total) * 100
  // Only worth saying when the leader clearly stands out: alone, or well above an even split.
  if (list.length > 1 && part < (100 / list.length) * 1.5) return null
  return { top, part, count: list.length }
}

const keep = (xs: (Insight | null)[]) => xs.filter((x): x is Insight => x !== null)

export function foInsights(cur: FoData, prev: FoData | undefined): Insight[] {
  const r = cur.ringkasan
  const p = prev?.ringkasan
  const out: (Insight | null)[] = []
  if (p) {
    out.push(trend('Kunjungan', r.kunjungan, p.kunjungan, num))
    out.push(trend('Pendapatan kasir', r.pendapatan_bersih, p.pendapatan_bersih, rp))
    const avg = r.transaksi ? r.pendapatan_bersih / r.transaksi : 0
    const avgPrev = p.transaksi ? p.pendapatan_bersih / p.transaksi : 0
    if (avg && avgPrev) out.push(trend('Rata-rata nilai per transaksi', avg, avgPrev, rp))
  }
  if (r.kunjungan > 0 && r.transaksi <= r.kunjungan) {
    const conv = (r.transaksi / r.kunjungan) * 100
    out.push({
      tone: conv < 60 ? 'perhatian' : 'info',
      text: `${pct(conv)} kunjungan berakhir dengan transaksi di kasir${conv < 60 ? '; periksa kunjungan yang tidak tertagih.' : '.'}`,
      weight: conv < 60 ? 6 : 1,
    })
  }
  if (r.pendapatan_bruto > 0 && r.diskon > 0) {
    const d = (r.diskon / r.pendapatan_bruto) * 100
    out.push({
      tone: d > 10 ? 'perhatian' : 'info',
      text: `Diskon promo dan voucher memotong ${pct(d)} pendapatan bruto (${rp(r.diskon)}).`,
      weight: d > 10 ? 5 : 1,
    })
  }
  const metode = share(cur.per_jenis_pembayaran, (x) => x.total)
  if (metode) {
    out.push({ tone: 'info', text: `${pct(metode.part)} pembayaran memakai ${metode.top.jenis_pembayaran.replace(/_/g, ' ')}.`, weight: 1 })
  }
  const harian = (cur.harian ?? []).filter((h) => h.kunjungan > 0)
  if (harian.length > 1) {
    const busy = harian.reduce((a, b) => (b.kunjungan > a.kunjungan ? b : a))
    const day = new Date(busy.tanggal).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long' })
    out.push({ tone: 'info', text: `Hari tersibuk: ${day} dengan ${num(busy.kunjungan)} kunjungan.`, weight: 1 })
  }
  return keep(out)
}

export function dokterInsights(cur: DmData, prev: DmData | undefined): Insight[] {
  const r = cur.ringkasan
  const out: (Insight | null)[] = []
  if (prev) {
    out.push(trend('Jumlah perawatan', r.perawatan, prev.ringkasan.perawatan, num))
    out.push(trend('Nilai perawatan', r.nilai, prev.ringkasan.nilai, rp))
    out.push(trend('Pasien yang ditangani', r.pasien, prev.ringkasan.pasien, num))
  }
  if (r.perawatan > 0) {
    const done = (r.selesai / r.perawatan) * 100
    if (done < 90) {
      out.push({ tone: 'perhatian', text: `${num(r.perawatan - r.selesai)} dari ${num(r.perawatan)} perawatan belum selesai dibayar (${pct(100 - done)}).`, weight: 6 })
    }
  }
  const dok = share(cur.per_dokter, (x) => x.nilai)
  if (dok && dok.count > 1) {
    out.push({ tone: dok.part > 70 ? 'perhatian' : 'info', text: `${dok.top.nama} menyumbang ${pct(dok.part)} nilai perawatan.`, weight: dok.part > 70 ? 3 : 1 })
  }
  const dx = (cur.diagnosa ?? []).filter((d) => d.diagnosa && d.jumlah > 0)
  if (dx.length) {
    const top = dx.reduce((a, b) => (b.jumlah > a.jumlah ? b : a))
    out.push({ tone: 'info', text: `Diagnosa terbanyak: ${top.diagnosa} (${num(top.jumlah)} kasus).`, weight: 1 })
  }
  if (r.pasien > 0 && r.nilai > 0) out.push({ tone: 'info', text: `Rata-rata nilai perawatan per pasien ${rp(r.nilai / r.pasien)}.`, weight: 1 })
  return keep(out)
}

export function terapisInsights(cur: NurseData, prev: NurseData | undefined): Insight[] {
  const r = cur.ringkasan
  const out: (Insight | null)[] = []
  if (prev) {
    out.push(trend('Jumlah tindakan', r.tindakan, prev.ringkasan.tindakan, num))
    out.push(trend('Nilai tindakan', r.nilai, prev.ringkasan.nilai, rp))
  }
  if (r.tanpa_terapis > 0) {
    out.push({ tone: 'perhatian', text: `${num(r.tanpa_terapis)} tindakan belum dicatat terapisnya, jadi komisinya belum terhitung.`, weight: 7 })
  }
  const tr = share(cur.treatment, (x) => x.nilai)
  if (tr) out.push({ tone: 'info', text: `Treatment terlaris: ${tr.top.nama}, ${pct(tr.part)} dari nilai tindakan.`, weight: 2 })
  const ter = share(cur.per_terapis, (x) => x.tindakan)
  if (ter && ter.count > 1) out.push({ tone: 'info', text: `${ter.top.nama} menangani ${pct(ter.part)} tindakan.`, weight: 1 })
  if (r.nilai > 0 && r.komisi_terapis > 0) {
    out.push({ tone: 'info', text: `Komisi terapis ${rp(r.komisi_terapis)}, setara ${pct((r.komisi_terapis / r.nilai) * 100)} dari nilai tindakan.`, weight: 1 })
  }
  return keep(out)
}

export function apotekInsights(cur: ApotekData, prev: ApotekData | undefined): Insight[] {
  const r = cur.ringkasan
  const out: (Insight | null)[] = []
  if (prev) {
    out.push(trend('Penjualan obat & produk', r.nilai_penjualan, prev.ringkasan.nilai_penjualan, rp))
    out.push(trend('Item terjual', r.item_terjual, prev.ringkasan.item_terjual, num))
  }
  const top = share(cur.barang_terjual, (x) => x.nilai)
  if (top) out.push({ tone: 'info', text: `Produk terlaris: ${top.top.nama}, ${pct(top.part)} dari nilai penjualan.`, weight: 2 })
  if (r.resep_dibayar > 0) {
    out.push({ tone: 'perhatian', text: `${num(r.resep_dibayar)} resep sudah dibayar tetapi obatnya belum diserahkan ke pasien.`, weight: 6 })
  }
  if (r.resep_belum_dibayar > 0) {
    out.push({ tone: 'perhatian', text: `${num(r.resep_belum_dibayar)} resep masih menunggu pembayaran di kasir.`, weight: 4 })
  }
  const menipis = cur.stok_menipis ?? []
  if (menipis.length) {
    const names = menipis.slice(0, 3).map((b) => b.nama).join(', ')
    out.push({
      tone: 'perhatian',
      text: `${num(menipis.length)} barang di bawah stok minimal: ${names}${menipis.length > 3 ? ', dan lainnya' : ''}.`,
      weight: 5,
    })
  }
  return keep(out)
}

export function financeInsights(h: FinanceData): Insight[] {
  const p = h.periode
  const out: (Insight | null)[] = [
    trend('Pendapatan', p.pendapatan, h.pembanding.pendapatan, rp),
    trend('Laba bersih', p.laba_bersih, h.pembanding.laba_bersih, rp),
  ]
  if (h.tahun_lalu.pendapatan > 0) {
    const c = change(p.pendapatan, h.tahun_lalu.pendapatan)!
    out.push({ tone: c >= 0 ? 'naik' : 'turun', text: `Dibanding periode yang sama tahun lalu, pendapatan ${c >= 0 ? 'naik' : 'turun'} ${pct(Math.abs(c))}.`, weight: 2 })
  }
  if (p.pendapatan > 0) {
    const diff = p.margin_bersih - h.pembanding.margin_bersih
    out.push({
      tone: Math.abs(diff) < 0.5 || h.pembanding.pendapatan === 0 ? 'info' : diff > 0 ? 'naik' : 'turun',
      text:
        h.pembanding.pendapatan === 0 || Math.abs(diff) < 0.5
          ? `Margin laba bersih ${pct(p.margin_bersih)}.`
          : `Margin laba bersih ${pct(p.margin_bersih)}, ${diff > 0 ? 'naik' : 'turun'} ${num(Math.abs(diff))} poin.`,
      weight: Math.abs(diff) / 2 + 1,
    })
  }
  if (p.laba_bersih < 0) out.push({ tone: 'perhatian', text: `Periode ini rugi ${rp(-p.laba_bersih)}.`, weight: 9 })
  const totalBeban = p.hpp + p.beban_operasional
  const big = h.beban_terbesar[0]
  if (big && totalBeban > 0) {
    out.push({ tone: 'info', text: `Beban terbesar: ${big.akun.nama}, ${pct((big.saldo / totalBeban) * 100)} dari total beban.`, weight: 2 })
  }
  out.push(trend('Saldo kas & bank', h.posisi.kas_bank, h.posisi_pembanding.kas_bank, rp))
  if (h.posisi.utang_deposit_pasien > 0) {
    out.push({ tone: 'info', text: `Deposit pasien yang belum terpakai ${rp(h.posisi.utang_deposit_pasien)}; ini kewajiban layanan klinik.`, weight: 1 })
  }
  return keep(out)
}
