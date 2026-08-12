import { SearchableSelect } from '@/shared/components/SearchableSelect'

const OPTIONS = [
  { value: 'e_money', label: 'E-Money' },
  { value: 'kartu_debit', label: 'Kartu Debit' },
  { value: 'kartu_kredit', label: 'Kartu Kredit' },
  { value: 'transfer', label: 'Transfer Bank' },
  { value: 'tunai', label: 'Tunai' },
]

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
