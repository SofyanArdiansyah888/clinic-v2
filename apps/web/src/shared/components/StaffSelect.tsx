import { useQuery } from '@tanstack/react-query'
import { useEffect, useMemo } from 'react'
import { apiGet } from '@/shared/api/client'
import { SearchableSelect } from '@/shared/components/SearchableSelect'
import { useQuickCreate } from '@/shared/components/useQuickCreate'
import { useAuthStore } from '@/features/auth/store'
import type { AuthUser } from '@/shared/types/api'

type StaffLite = {
  id: number
  kode?: string
  nama?: string
  jabatan?: string
}

type StaffSelectProps = {
  value: string
  onChange: (value: string) => void
  required?: boolean
  disabled?: boolean
  className?: string
  id?: string
  placeholder?: string
  /**
   * The picker records who handled a transaction, so non-admin users are locked to their
   * own staff (the API enforces the same). allowAny is for admin screens such as linking
   * a user account to a staff record.
   */
  allowAny?: boolean
}

export function StaffSelect({
  value,
  onChange,
  required,
  disabled,
  className,
  id,
  placeholder = 'Pilih staff kasir...',
  allowAny,
}: StaffSelectProps) {
  const role = useAuthStore((s) => s.user?.role)
  const locked = !allowAny && role !== 'admin'

  const { data, isLoading } = useQuery({
    queryKey: ['staff', 'select'],
    queryFn: () => apiGet<StaffLite[]>('/staff', { per_page: 200, page: 1, cabang: 'aktif' }),
  })
  // Fresh from the server, so a link made by admin applies without logging in again.
  const me = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: () => apiGet<AuthUser>('/auth/me'),
    enabled: locked,
    staleTime: 60_000,
  })
  const ownStaff = me.data?.data?.staff_id ? String(me.data.data.staff_id) : ''

  useEffect(() => {
    if (locked && ownStaff && value !== ownStaff) onChange(ownStaff)
  }, [locked, ownStaff, value, onChange])

  const options = useMemo(
    () =>
      (data?.data ?? []).map((s) => ({
        value: String(s.id),
        label: s.nama || `Staff #${s.id}`,
        description: [s.kode, s.jabatan].filter(Boolean).join(' · ') || undefined,
        keywords: `${s.nama ?? ''} ${s.kode ?? ''} ${s.jabatan ?? ''}`,
      })),
    [data?.data],
  )

  const quick = useQuickCreate<StaffLite>('staff', {
    defaults: { jabatan: 'Front Office' },
    onCreated: (row) => onChange(String(row.id)),
  })

  const notLinked = locked && me.isSuccess && !ownStaff

  return (
    <>
      <SearchableSelect
        {...(locked ? {} : quick.selectProps)}
        id={id}
        value={locked ? ownStaff : value}
        onChange={onChange}
        options={options}
        loading={isLoading || (locked && me.isLoading)}
        disabled={disabled || locked}
        required={required}
        className={className}
        placeholder={notLinked ? 'Akun belum terhubung ke staff' : placeholder}
        searchPlaceholder="Cari nama staff..."
        emptyText="Staff tidak ditemukan"
      />
      {notLinked ? (
        <p role="alert" className="mt-1 text-[11px] font-semibold text-rose-600">
          Akun Anda belum terhubung ke data staff, jadi belum bisa mencatat transaksi. Minta admin menghubungkannya di Administrasi › User.
        </p>
      ) : null}
      {locked ? null : quick.dialog}
    </>
  )
}
