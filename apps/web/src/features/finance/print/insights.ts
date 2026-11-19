import type { Insight } from '@/features/majalah/insights'
import { TIPE_LABEL, type AkunSaldo, type BukuBesarSemuaData, type LabaRugiData, type NeracaData, type NeracaSaldoData, type TipeAkun } from '@/features/finance/types'

// Plain-language findings for the finance report PDFs. Rules only read the report numbers,
// so the same data always gives the same text.

const rp = (n: number) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(n)
const pct = (n: number) => `${new Intl.NumberFormat('id-ID', { maximumFractionDigits: 1 }).format(n)}%`

function trend(label: string, cur: number, prev: number | undefined, goodWhenUp = true): Insight | null {
  if (prev === undefined || (cur === 0 && prev === 0)) return null
  if (prev === 0) return null // reported once by `noBaseline`
  const c = ((cur - prev) / Math.abs(prev)) * 100
  if (Math.abs(c) < 0.5) return { tone: 'info', text: `${label} stabil di ${rp(cur)}.`, weight: 1 }
  const up = c > 0
  return {
    tone: up === goodWhenUp ? 'naik' : 'turun',
    text: `${label} ${up ? 'naik' : 'turun'} ${pct(Math.abs(c))}, dari ${rp(prev)} menjadi ${rp(cur)}.`,
    weight: Math.min(Math.abs(c), 200) / 10 + 1,
  }
}

/** The largest positive balance and its share of the positive total. */
function leader(rows: AkunSaldo[]) {
  const pos = rows.filter((r) => r.saldo > 0)
  const total = pos.reduce((s, r) => s + r.saldo, 0)
  // Only meaningful when there is something to compare against.
  if (pos.length < 2 || total === 0) return null
  const top = pos.reduce((a, b) => (b.saldo > a.saldo ? b : a))
  return { top, part: (top.saldo / total) * 100, total }
}

/** One line instead of a "no comparison" note per KPI when the comparison period is empty. */
function noBaseline(label: string, prevValues: (number | undefined)[]): Insight | null {
  if (prevValues.some((v) => v === undefined) || prevValues.some((v) => v !== 0)) return null
  return { tone: 'info', text: `${label} belum punya data, jadi perubahan belum bisa dibandingkan.`, weight: 0.5 }
}

const keep = (xs: (Insight | null)[]) => xs.filter((x): x is Insight => !!x).sort((a, b) => b.weight - a.weight)

export function labaRugiInsights(c: LabaRugiData, p?: LabaRugiData): Insight[] {
  const out: (Insight | null)[] = [
    trend('Pendapatan bersih', c.total_pendapatan, p?.total_pendapatan),
    trend('Total beban', c.total_beban, p?.total_beban, false),
    trend('Laba bersih', c.laba_bersih, p?.laba_bersih),
    p ? noBaseline('Periode pembanding', [p.total_pendapatan, p.total_beban, p.laba_bersih]) : null,
  ]
  if (c.laba_bersih < 0) {
    out.push({ tone: 'perhatian', text: `Periode ini rugi ${rp(-c.laba_bersih)}: beban melebihi pendapatan.`, weight: 20 })
  } else if (c.total_pendapatan > 0) {
    const m = (c.laba_bersih / c.total_pendapatan) * 100
    out.push(
      m < 10
        ? { tone: 'perhatian', text: `Margin bersih tipis, ${pct(m)} dari pendapatan.`, weight: 8 }
        : { tone: 'info', text: `Margin bersih ${pct(m)}: setiap Rp 100 pendapatan menyisakan ${rp(m)} laba.`, weight: 3 },
    )
  }
  const lp = leader(c.pendapatan)
  if (lp) out.push({ tone: 'info', text: `${lp.top.akun.nama} menyumbang ${pct(lp.part)} pendapatan.`, weight: 2.5 })
  const potongan = c.pendapatan.filter((r) => r.saldo < 0).reduce((s, r) => s - r.saldo, 0)
  if (potongan > 0 && lp) {
    const part = (potongan / lp.total) * 100
    out.push({
      tone: part > 10 ? 'perhatian' : 'info',
      text: `Diskon dan refund memotong pendapatan ${rp(potongan)} (${pct(part)} dari pendapatan kotor).`,
      weight: part > 10 ? 7 : 2,
    })
  }
  const lb = leader(c.beban)
  if (lb) out.push({ tone: 'info', text: `Beban terbesar adalah ${lb.top.akun.nama}, ${pct(lb.part)} dari seluruh beban.`, weight: 2.4 })
  return keep(out)
}

const nameIs = (r: AkunSaldo, ...words: string[]) => words.some((w) => r.akun.nama.toLowerCase().includes(w))

export function neracaInsights(c: NeracaData, p?: NeracaData): Insight[] {
  const out: (Insight | null)[] = [
    trend('Total aset', c.total_aset, p?.total_aset),
    trend('Total kewajiban', c.total_kewajiban, p?.total_kewajiban, false),
    p ? noBaseline('Posisi pembanding', [p.total_aset, p.total_kewajiban, p.total_ekuitas]) : null,
  ]
  if (!c.seimbang) {
    out.push({ tone: 'perhatian', text: `Neraca tidak seimbang, selisih ${rp(Math.abs(c.total_aset - c.total_pasiva))}. Periksa jurnal manual dan saldo awal.`, weight: 30 })
  }
  if (c.total_aset > 0) {
    const ratio = (c.total_kewajiban / c.total_aset) * 100
    out.push(
      ratio > 50
        ? { tone: 'perhatian', text: `Kewajiban mencapai ${pct(ratio)} dari aset; lebih dari separuh aset dibiayai utang.`, weight: 9 }
        : { tone: 'info', text: `Kewajiban ${pct(ratio)} dari aset; sisanya dibiayai ekuitas.`, weight: 2 },
    )
    const kas = c.aset.filter((r) => nameIs(r, 'kas', 'bank')).reduce((s, r) => s + r.saldo, 0)
    if (kas > 0) out.push({ tone: 'info', text: `Kas dan bank ${rp(kas)}, ${pct((kas / c.total_aset) * 100)} dari total aset.`, weight: 3 })
  }
  const deposit = c.kewajiban.filter((r) => nameIs(r, 'deposit')).reduce((s, r) => s + r.saldo, 0)
  if (deposit > 0) {
    out.push({ tone: 'info', text: `Titipan deposit pasien ${rp(deposit)} masih tercatat sebagai kewajiban; dana ini milik pasien sampai dipakai.`, weight: 2.5 })
  }
  if (c.laba_berjalan < 0) out.push({ tone: 'perhatian', text: `Laba tahun berjalan negatif (${rp(c.laba_berjalan)}), mengurangi ekuitas.`, weight: 8 })
  const negatif = [...c.aset, ...c.kewajiban, ...c.ekuitas].filter((r) => r.saldo < 0 && !nameIs(r, 'akumulasi', 'prive'))
  if (negatif.length) {
    out.push({
      tone: 'perhatian',
      text: `Saldo minus pada ${negatif.slice(0, 3).map((r) => r.akun.nama).join(', ')}${negatif.length > 3 ? ` dan ${negatif.length - 3} akun lain` : ''}; biasanya tanda salah posting.`,
      weight: 10,
    })
  }
  return keep(out)
}

const NORMAL: Record<TipeAkun, 'debit' | 'kredit'> = { aset: 'debit', beban: 'debit', kewajiban: 'kredit', ekuitas: 'kredit', pendapatan: 'kredit' }

export function neracaSaldoInsights(d: NeracaSaldoData): Insight[] {
  const out: (Insight | null)[] = []
  const selisih = Math.abs(d.total_debit - d.total_kredit)
  out.push(
    selisih < 0.005
      ? { tone: 'naik', text: `Seimbang: total debit dan kredit sama, ${rp(d.total_debit)}.`, weight: 5 }
      : { tone: 'perhatian', text: `Tidak seimbang, selisih ${rp(selisih)}. Ada jurnal yang tidak lengkap.`, weight: 30 },
  )
  // A balance on the side opposite to its type, unless the account is a declared contra account.
  const terbalik = d.rows.filter((r) => {
    const side = r.debit > 0 ? 'debit' : r.kredit > 0 ? 'kredit' : null
    return side && r.akun.saldo_normal === NORMAL[r.akun.tipe] && side !== r.akun.saldo_normal
  })
  if (terbalik.length) {
    out.push({
      tone: 'perhatian',
      text: `Saldo di sisi yang tidak lazim: ${terbalik.slice(0, 3).map((r) => r.akun.nama).join(', ')}${terbalik.length > 3 ? ` dan ${terbalik.length - 3} akun lain` : ''}.`,
      weight: 10,
    })
  }
  const terbesar = [...d.rows].sort((a, b) => Math.max(b.debit, b.kredit) - Math.max(a.debit, a.kredit))[0]
  if (terbesar && Math.max(terbesar.debit, terbesar.kredit) > 0) {
    out.push({ tone: 'info', text: `Saldo terbesar ada di ${terbesar.akun.nama} (${rp(Math.max(terbesar.debit, terbesar.kredit))}).`, weight: 2 })
  }
  const aktif = d.rows.filter((r) => r.debit || r.kredit).length
  out.push({ tone: 'info', text: `${aktif} akun memiliki saldo per tanggal ini.`, weight: 1 })
  return keep(out)
}

export function bukuBesarInsights(d: BukuBesarSemuaData): Insight[] {
  const out: (Insight | null)[] = []
  const aktif = d.akuns.filter((a) => a.rows.length)
  if (!aktif.length) return [{ tone: 'info', text: 'Tidak ada transaksi pada periode ini.', weight: 1 }]
  const ramai = aktif.reduce((a, b) => (b.rows.length > a.rows.length ? b : a))
  out.push({
    tone: 'info',
    text: `${ramai.akun.nama} paling sibuk: ${ramai.rows.length} dari ${d.jumlah_transaksi} baris mutasi (${pct((ramai.rows.length / d.jumlah_transaksi) * 100)}).`,
    weight: 3,
  })
  const minus = d.akuns.filter((a) => a.saldo_akhir < 0 && a.akun.saldo_normal === NORMAL[a.akun.tipe])
  if (minus.length) {
    out.push({
      tone: 'perhatian',
      text: `Saldo akhir minus: ${minus.slice(0, 3).map((a) => `${a.akun.nama} (${rp(a.saldo_akhir)})`).join(', ')}. Periksa urutan dan sisi posting.`,
      weight: 12,
    })
  }
  const naik = [...aktif].sort((a, b) => Math.abs(b.saldo_akhir - b.saldo_awal) - Math.abs(a.saldo_akhir - a.saldo_awal))[0]
  const delta = naik.saldo_akhir - naik.saldo_awal
  if (delta) {
    out.push({
      tone: 'info',
      text: `Perubahan saldo terbesar: ${naik.akun.nama} ${delta > 0 ? 'bertambah' : 'berkurang'} ${rp(Math.abs(delta))} (${rp(naik.saldo_awal)} → ${rp(naik.saldo_akhir)}).`,
      weight: 2.5,
    })
  }
  const diam = d.akuns.length - aktif.length
  if (diam > 0) out.push({ tone: 'info', text: `${diam} dari ${d.akuns.length} akun tidak bergerak pada periode ini.`, weight: 1 })
  const perTipe = new Map<TipeAkun, number>()
  for (const a of aktif) perTipe.set(a.akun.tipe, (perTipe.get(a.akun.tipe) ?? 0) + a.rows.length)
  const tipeTop = [...perTipe.entries()].sort((a, b) => b[1] - a[1])[0]
  if (tipeTop) out.push({ tone: 'info', text: `Mutasi terbanyak di kelompok ${TIPE_LABEL[tipeTop[0]]} (${tipeTop[1]} baris).`, weight: 1.5 })
  return keep(out)
}
