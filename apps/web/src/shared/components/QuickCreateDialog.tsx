import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState, type FormEvent } from 'react'
import { apiPost } from '@/shared/api/client'
import { Dialog } from '@/shared/components/Dialog'
import { ResourceFormFields } from '@/shared/components/resource-form'
import { apiErrorMessage, buildFormBody, initialFormValues, type FormValues } from '@/shared/lib/form'
import { MASTERS, type MasterKey } from '@/shared/lib/masters'
import { Button } from '@/shared/ui/button'
import { FormAlert } from '@/shared/ui/field'
import { FieldErrorsContext, useFormValidation } from '@/shared/lib/validation'

type QuickCreateDialogProps<T> = {
  master: MasterKey
  open: boolean
  onClose: () => void
  /** Prefills, e.g. the text typed in the select's search box or a fixed jabatan. */
  defaults?: FormValues
  /** Called with the saved row after the master's lists are refreshed. */
  onCreated: (row: T) => void
}

/** Create a master record without leaving the current form. */
export function QuickCreateDialog<T extends { id: number | string }>({
  master,
  open,
  onClose,
  defaults,
  onCreated,
}: QuickCreateDialogProps<T>) {
  const def = MASTERS[master]
  const queryClient = useQueryClient()
  const [values, setValues] = useState<FormValues>({})
  const [error, setError] = useState<string | null>(null)
  const validation = useFormValidation()

  // Reset each time it opens so a cancelled draft never leaks into the next one.
  useEffect(() => {
    if (open) {
      setValues(initialFormValues(def.fields, defaults))
      setError(null)
      validation.reset()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const mutation = useMutation({
    mutationFn: (body: unknown) => apiPost<T>(def.endpoint, body),
    onSuccess: async (res) => {
      // Wait for the refetch so the select already lists the new row when it is picked.
      await queryClient.invalidateQueries({ queryKey: [def.queryKey] })
      onCreated(res.data)
      onClose()
    },
    onError: (err) => setError(apiErrorMessage(err, 'Gagal menyimpan data')),
  })

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    // The dialog is portalled, but React still bubbles submit to an enclosing form.
    e.stopPropagation()
    mutation.mutate(buildFormBody(def.fields, values))
  }

  return (
    <Dialog open={open} onClose={onClose} title={`Tambah ${def.noun}`}>
      <FieldErrorsContext.Provider value={validation.errors}>
        <form {...validation.formProps} onSubmit={onSubmit} className="space-y-4">
          <ResourceFormFields fields={def.fields} values={values} onChange={setValues} idPrefix={`quick-${master}`} />
          <FormAlert>{error}</FormAlert>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onClose}>
              Batal
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? 'Menyimpan...' : 'Simpan'}
            </Button>
          </div>
        </form>
      </FieldErrorsContext.Provider>
    </Dialog>
  )
}
