import { SearchableSelect } from '@/shared/components/SearchableSelect'
import { JENIS_PEMBAYARAN as OPTIONS } from '@/shared/lib/pembayaran'


type JenisPembayaranSelectProps = {
  value: string
  onChange: (value: string) => void
  required?: boolean
  disabled?: boolean
  className?: string
  id?: string
}

export function JenisPembayaranSelect({
  value,
  onChange,
  required,
  disabled,
  className,
  id,
}: JenisPembayaranSelectProps) {
  return (
    <SearchableSelect
      id={id}
      value={value}
      onChange={onChange}
      options={OPTIONS}
      disabled={disabled}
      required={required}
      className={className}
      placeholder="Pilih jenis pembayaran..."
      searchPlaceholder="Cari metode..."
      emptyText="Metode tidak ditemukan"
    />
  )
}
