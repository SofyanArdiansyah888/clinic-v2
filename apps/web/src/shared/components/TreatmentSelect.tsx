import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { apiGet } from '@/shared/api/client'
import { SearchableSelect } from '@/shared/components/SearchableSelect'
import { useQuickCreate } from '@/shared/components/useQuickCreate'
import { MASTERS } from '@/shared/lib/masters'
import { formatCurrency } from '@/shared/lib/formatters'

export type TreatmentLite = {
  id: number
  kode?: string
  nama?: string
  harga?: number
  durasi?: number
  kategori?: string
  is_active?: boolean
}

type TreatmentSelectProps = {
  value: string
  onChange: (value: string, selected?: TreatmentLite) => void
  required?: boolean
  disabled?: boolean
  className?: string
  id?: string
  placeholder?: string
  kategoriFilter?: string
  /** Hide treatments whose kategori contains this text (e.g. 'paket' inside a paket). */
  excludeKategori?: string
}

// A paket-only picker should create a paket treatment, so it shows up in the list.
function kategoriOption(filter: string) {
  const kategori = MASTERS.treatment.fields.find((f) => f.name === 'kategori')
  const match = kategori?.options?.find((o) => o.value.toLowerCase().includes(filter.toLowerCase()))
  return match?.value ?? ''
}

export function TreatmentSelect({
  value,
  onChange,
  required,
  disabled,
  className,
  id,
  placeholder = 'Cari & pilih treatment...',
  kategoriFilter,
  excludeKategori,
}: TreatmentSelectProps) {
  const { data, isLoading } = useQuery({
    queryKey: ['treatment', 'select'],
    queryFn: () => apiGet<TreatmentLite[]>('/treatment', { per_page: 200, page: 1 }),
  })

  const treatmentMap = useMemo(() => {
    const map = new Map<string, TreatmentLite>()
    for (const t of data?.data ?? []) {
      map.set(String(t.id), t)
    }
    return map
  }, [data?.data])

  const options = useMemo(
    () =>
      (data?.data ?? [])
        .filter((t) => t.is_active !== false)
        .filter((t) => {
          if (!kategoriFilter) return true
          return (t.kategori ?? '').toLowerCase().includes(kategoriFilter.toLowerCase())
        })
        .filter((t) => !excludeKategori || !(t.kategori ?? '').toLowerCase().includes(excludeKategori.toLowerCase()))
        .map((t) => ({
          value: String(t.id),
          label: t.nama || `Treatment #${t.id}`,
          description:
            [t.kode, t.kategori, formatCurrency(t.harga ?? 0)].filter(Boolean).join(' · ') || undefined,
          keywords: `${t.nama ?? ''} ${t.kode ?? ''} ${t.kategori ?? ''}`,
        })),
    [data?.data, kategoriFilter, excludeKategori],
  )

  function handleChange(val: string) {
    const found = treatmentMap.get(val)
    onChange(val, found)
  }

  const quick = useQuickCreate<TreatmentLite>('treatment', {
    defaults: kategoriFilter ? { kategori: kategoriOption(kategoriFilter) } : undefined,
    onCreated: (row) => onChange(String(row.id), row),
  })

  return (
    <>
      <SearchableSelect
        {...quick.selectProps}
        id={id}
        value={value}
        onChange={handleChange}
        options={options}
        loading={isLoading}
        disabled={disabled}
        required={required}
        className={className}
        placeholder={placeholder}
        searchPlaceholder="Cari nama atau kode treatment..."
        emptyText="Treatment tidak ditemukan"
      />
      {quick.dialog}
    </>
  )
}
