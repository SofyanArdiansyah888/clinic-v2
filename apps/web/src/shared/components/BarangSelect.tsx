import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { apiGet } from '@/shared/api/client'
import { SearchableSelect } from '@/shared/components/SearchableSelect'
import { formatCurrency } from '@/shared/lib/formatters'

export type BarangLite = {
  id: number
  kode?: string
  nama?: string
  kategori?: string
  satuan?: string
  harga_jual?: number
  stok_aktual?: number
  is_active?: boolean
}

type BarangSelectProps = {
  value: string
  onChange: (value: string, selected?: BarangLite) => void
  required?: boolean
  disabled?: boolean
  className?: string
  id?: string
  placeholder?: string
}

export function BarangSelect({
  value,
  onChange,
  required,
  disabled,
  className,
  id,
  placeholder = 'Cari & pilih barang / obat...',
}: BarangSelectProps) {
  const { data, isLoading } = useQuery({
    queryKey: ['barang', 'select'],
    queryFn: () => apiGet<BarangLite[]>('/barang', { per_page: 300, page: 1 }),
  })

  const barangMap = useMemo(() => {
    const map = new Map<string, BarangLite>()
    for (const b of data?.data ?? []) {
      map.set(String(b.id), b)
    }
    return map
  }, [data?.data])

  const options = useMemo(
    () =>
      (data?.data ?? [])
        .filter((b) => b.is_active !== false)
        .map((b) => ({
          value: String(b.id),
          label: b.nama || `Barang #${b.id}`,
          description:
            [
              b.kode,
              b.satuan ? `satuan: ${b.satuan}` : undefined,
              formatCurrency(b.harga_jual ?? 0),
              b.stok_aktual !== undefined ? `stok: ${b.stok_aktual}` : undefined,
            ]
              .filter(Boolean)
              .join(' · ') || undefined,
          keywords: `${b.nama ?? ''} ${b.kode ?? ''} ${b.kategori ?? ''}`,
        })),
    [data?.data],
  )

  function handleChange(val: string) {
    const found = barangMap.get(val)
    onChange(val, found)
  }

  return (
    <SearchableSelect
      id={id}
      value={value}
      onChange={handleChange}
      options={options}
      loading={isLoading}
      disabled={disabled}
      required={required}
      className={className}
      placeholder={placeholder}
      searchPlaceholder="Cari nama atau kode barang/obat..."
      emptyText="Barang / Obat tidak ditemukan"
    />
  )
}
