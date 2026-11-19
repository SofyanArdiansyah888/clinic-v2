import { useState } from 'react'
import { useAuthStore } from '@/features/auth/store'
import { QuickCreateDialog } from '@/shared/components/QuickCreateDialog'
import type { FormValues } from '@/shared/lib/form'
import { canCreateMaster, MASTERS, type MasterKey } from '@/shared/lib/masters'

type Options<T> = {
  /** Fixed prefills (e.g. jabatan "Dokter Umum" from the dokter picker). */
  defaults?: FormValues
  onCreated: (row: T) => void
  /** Pass false to hide the action for this picker. */
  enabled?: boolean
}

/**
 * Wires a master picker to a quick-create dialog. Spread `selectProps` on the
 * SearchableSelect and render `dialog` next to it. Users whose role cannot
 * create the master never see the action.
 */
export function useQuickCreate<T extends { id: number | string }>(
  master: MasterKey,
  { defaults, onCreated, enabled = true }: Options<T>,
) {
  const role = useAuthStore((s) => s.user?.role)
  const [open, setOpen] = useState(false)
  const [prefill, setPrefill] = useState<FormValues | undefined>()

  const allowed = enabled && canCreateMaster(role, master)

  const selectProps = allowed
    ? {
        createLabel: `Tambah ${MASTERS[master].noun}`,
        onCreate: (query: string) => {
          // The search text becomes the name: typing "Paracetamol" then Tambah fills it in.
          setPrefill({ ...defaults, ...(query ? { nama: query } : {}) })
          setOpen(true)
        },
      }
    : {}

  const dialog = allowed ? (
    <QuickCreateDialog<T>
      master={master}
      open={open}
      onClose={() => setOpen(false)}
      defaults={prefill}
      onCreated={onCreated}
    />
  ) : null

  return { selectProps, dialog }
}
