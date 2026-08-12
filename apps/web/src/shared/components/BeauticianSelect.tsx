import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { apiGet } from '@/shared/api/client'
import { SearchableSelect } from '@/shared/components/SearchableSelect'

export type StaffLite = {
  id: number
  kode?: string
  nama?: string
  jabatan?: string
  is_active?: boolean
}

type BeauticianSelectProps = {
  value: string
  onChange: (value: string, selected?: StaffLite) => void
  required?: boolean
  disabled?: boolean
  className?: string
  id?: string
  placeholder?: string
}

function isBeauticianOrNurse(jabatan?: string) {
  const j = (jabatan ?? '').toLowerCase()
  return j.includes('beautician') || j.includes('perawat') || j.includes('therapist') || j.includes('terapis') || j.includes('nurse')
}

export function BeauticianSelect({
  value,
  onChange,
  required,
  disabled,
  className,
  id,
  placeholder = 'Cari & pilih beautician...',
}: BeauticianSelectProps) {
  const { data, isLoading } = useQuery({
    queryKey: ['staff', 'beautician-select'],
    queryFn: () => apiGet<StaffLite[]>('/staff', { per_page: 200, page: 1 }),
  })

  const staffMap = useMemo(() => {
    const map = new Map<string, StaffLite>()
    for (const s of data?.data ?? []) {
      map.set(String(s.id), s)
    }
    return map
  }, [data?.data])

  const options = useMemo(() => {
    const allStaff = data?.data ?? []
    const filtered = allStaff.filter((s) => s.is_active !== false && isBeauticianOrNurse(s.jabatan))
    // If no beautician role matched, fallback to all active staff so user is not blocked
    const listToUse = filtered.length > 0 ? filtered : allStaff.filter((s) => s.is_active !== false)

    return listToUse.map((s) => ({
      value: String(s.id),
      label: s.nama || `Staff #${s.id}`,
      description: [s.jabatan, s.kode].filter(Boolean).join(' · ') || undefined,
      keywords: `${s.nama ?? ''} ${s.kode ?? ''} ${s.jabatan ?? ''}`,
    }))
  }, [data?.data])

  function handleChange(val: string) {
    const found = staffMap.get(val)
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
      searchPlaceholder="Cari nama atau kode beautician..."
      emptyText="Beautician / Staff tidak ditemukan"
    />
  )
}
