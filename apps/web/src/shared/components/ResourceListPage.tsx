import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Pencil, Plus, Search, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { apiDelete, apiGet, apiPost, apiPut } from '@/shared/api/client'
import { DataTable, type Column } from '@/shared/components/DataTable'
import { Dialog } from '@/shared/components/Dialog'
import { PageHeader } from '@/shared/components/PageHeader'
import { Pagination } from '@/shared/components/Pagination'
import type { PaginationMeta } from '@/shared/types/api'
import { Button } from '@/shared/ui/button'
import { Card } from '@/shared/ui/card'
import { Input } from '@/shared/ui/input'
import { Label } from '@/shared/ui/label'
import { todayISO } from '@/shared/lib/formatters'

export type FormField = {
  name: string
  label: string
  type?: 'text' | 'email' | 'number' | 'tel' | 'date' | 'password' | 'select' | 'textarea'
  placeholder?: string
  required?: boolean
  options?: { label: string; value: string }[]
}

type ResourceListPageProps<T extends { id: number | string }> = {
  title: string
  description?: string
  endpoint: string
  queryKey: string
  columns: Column<T>[]
  createFields?: FormField[]
  editFields?: FormField[]
  createLabel?: string
  editLabel?: string
  transformCreateBody?: (values: Record<string, string>) => unknown
  transformEditBody?: (values: Record<string, string>, row: T) => unknown
  enableCreate?: boolean
  enableEdit?: boolean
  enableDelete?: boolean
  customRowActions?: (row: T) => ReactNode
  onEditClick?: (row: T) => void
  onDeleteClick?: (row: T) => void
  extraActions?: ReactNode
  filterParams?: Record<string, string | number | undefined>
}

// The API decodes dates into time.Time, which only accepts RFC3339; a plain
// <input type="date"> value (YYYY-MM-DD) is sent as midnight UTC of that day.
function toApiDate(raw: string): string | null {
  if (raw === '') return null
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? `${raw}T00:00:00Z` : raw
}

export function ResourceListPage<T extends { id: number | string }>({
  title,
  description,
  endpoint,
  queryKey,
  columns,
  createFields,
  editFields,
  createLabel = 'Tambah',
  editLabel = 'Edit Data',
  transformCreateBody,
  transformEditBody,
  enableCreate = Boolean(createFields?.length),
  enableEdit = true,
  enableDelete = true,
  customRowActions,
  onEditClick,
  onDeleteClick,
  extraActions,
  filterParams,
}: ResourceListPageProps<T>) {
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')

  // Create state
  const [open, setOpen] = useState(false)
  const [formValues, setFormValues] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)

  // Edit state
  const [editOpen, setEditOpen] = useState(false)
  const [editingRow, setEditingRow] = useState<T | null>(null)
  const [editFormValues, setEditFormValues] = useState<Record<string, string>>({})
  const [editFormError, setEditFormError] = useState<string | null>(null)

  // Delete state
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deletingRow, setDeletingRow] = useState<T | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const filterKey = JSON.stringify(filterParams ?? {})
  const params = useMemo(
    () => ({
      page,
      per_page: 10,
      search: search || undefined,
      ...(filterParams ?? {}),
    }),
    [page, search, filterKey, filterParams],
  )

  const { data, isLoading, isError, error } = useQuery({
    queryKey: [queryKey, params],
    queryFn: () => apiGet<T[]>(endpoint, params),
  })

  const createMutation = useMutation({
    mutationFn: (body: unknown) => apiPost<T>(endpoint, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [queryKey] })
      setOpen(false)
      setFormValues({})
      setFormError(null)
    },
    onError: (err: unknown) => {
      const message =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        'Gagal menyimpan data'
      setFormError(message)
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: number | string; body: unknown }) =>
      apiPut<T>(`${endpoint}/${id}`, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [queryKey] })
      setEditOpen(false)
      setEditingRow(null)
      setEditFormValues({})
      setEditFormError(null)
    },
    onError: (err: unknown) => {
      const message =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        'Gagal memperbarui data'
      setEditFormError(message)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number | string) => apiDelete(`${endpoint}/${id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [queryKey] })
      setDeleteOpen(false)
      setDeletingRow(null)
      setDeleteError(null)
    },
    onError: (err: unknown) => {
      const message =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        'Gagal menghapus data'
      setDeleteError(message)
    },
  })

  const rows = (data?.data ?? []) as T[]
  const meta = data?.meta as PaginationMeta | undefined

  const activeEditFields = editFields ?? createFields

  // Search as you type (debounced), matching the other list pages; Enter applies immediately.
  useEffect(() => {
    const next = searchInput.trim()
    if (next === search) return
    const id = window.setTimeout(() => {
      setPage(1)
      setSearch(next)
    }, 350)
    return () => window.clearTimeout(id)
  }, [searchInput, search])

  function onSubmitSearch(e: FormEvent) {
    e.preventDefault()
    setPage(1)
    setSearch(searchInput.trim())
  }

  function openCreate() {
    if (!enableCreate || !createFields?.length) return
    const initial: Record<string, string> = {}
    for (const field of createFields) {
      // Only required dates start at today; optional ones (tanggal lahir, masa berlaku) stay empty.
      if (field.type === 'date' && field.required && !field.placeholder) {
        initial[field.name] = todayISO()
      } else {
        initial[field.name] = field.options?.[0]?.value ?? ''
      }
    }
    setFormValues(initial)
    setFormError(null)
    setOpen(true)
  }

  function onCreateSubmit(e: FormEvent) {
    e.preventDefault()
    if (!createFields?.length) return
    const body = transformCreateBody
      ? transformCreateBody(formValues)
      : Object.fromEntries(
          createFields.map((field) => {
            const raw = formValues[field.name] ?? ''
            if (field.type === 'number') {
              return [field.name, raw === '' ? 0 : Number(raw)]
            }
            if (field.type === 'date') {
              return [field.name, toApiDate(raw)]
            }
            return [field.name, raw]
          }),
        )
    createMutation.mutate(body)
  }

  function handleOpenEdit(row: T) {
    if (onEditClick) {
      onEditClick(row)
      return
    }
    setEditingRow(row)
    const initial: Record<string, string> = {}
    const fieldsToUse = activeEditFields ?? []
    const rowObj = row as unknown as Record<string, unknown>

    for (const field of fieldsToUse) {
      const val = rowObj[field.name]
      if (val !== undefined && val !== null) {
        if (field.type === 'date' && typeof val === 'string') {
          initial[field.name] = val.slice(0, 10)
        } else {
          initial[field.name] = String(val)
        }
      } else {
        initial[field.name] = field.options?.[0]?.value ?? ''
      }
    }
    setEditFormValues(initial)
    setEditFormError(null)
    setEditOpen(true)
  }

  function onEditSubmit(e: FormEvent) {
    e.preventDefault()
    if (!editingRow) return
    const fieldsToUse = activeEditFields ?? []
    const body = transformEditBody
      ? transformEditBody(editFormValues, editingRow)
      : Object.fromEntries(
          fieldsToUse.map((field) => {
            const raw = editFormValues[field.name] ?? ''
            if (field.type === 'number') {
              return [field.name, raw === '' ? 0 : Number(raw)]
            }
            if (field.type === 'date') {
              return [field.name, toApiDate(raw)]
            }
            return [field.name, raw]
          }),
        )
    updateMutation.mutate({ id: editingRow.id, body })
  }

  function handleOpenDelete(row: T) {
    if (onDeleteClick) {
      onDeleteClick(row)
      return
    }
    setDeletingRow(row)
    setDeleteError(null)
    setDeleteOpen(true)
  }

  function onDeleteConfirm() {
    if (!deletingRow) return
    deleteMutation.mutate(deletingRow.id)
  }

  // Build final table columns with automatic Aksi column
  const tableColumns = useMemo(() => {
    const cols = [...columns]
    const hasActions = enableEdit || enableDelete || customRowActions
    if (hasActions) {
      cols.push({
        key: '_actions',
        header: 'Aksi',
        className: 'text-right w-28',
        cell: (row: T) => (
          <div className="flex items-center justify-end gap-1.5">
            {customRowActions ? customRowActions(row) : null}
            {enableEdit ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0 text-slate-500 hover:bg-slate-100 hover:text-rose-600"
                onClick={() => handleOpenEdit(row)}
                title="Edit Data"
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
            ) : null}
            {enableDelete ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0 text-slate-500 hover:bg-rose-50 hover:text-rose-600"
                onClick={() => handleOpenDelete(row)}
                title="Hapus Data"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            ) : null}
          </div>
        ),
      })
    }
    return cols
  }, [columns, enableEdit, enableDelete, customRowActions])

  return (
    <div>
      <PageHeader
        title={title}
        description={description}
        actions={
          <>
            {extraActions}
            {enableCreate && createFields?.length ? (
              <Button onClick={openCreate}>
                <Plus className="h-4 w-4" />
                {createLabel}
              </Button>
            ) : null}
          </>
        }
      />

      <Card className="mt-6 overflow-hidden">
        <div className="border-b border-slate-200 bg-white p-3.5">
          <form onSubmit={onSubmitSearch} role="search">
            <div className="relative">
              <Search className="pointer-events-none absolute top-3 left-3 h-4 w-4 text-slate-400" />
              <Input
                type="search"
                aria-label={`Cari ${title.toLowerCase()}`}
                className="h-10 pl-9"
                placeholder="Ketik untuk mencari..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
              />
            </div>
          </form>
        </div>

        {isError ? (
          <div className="p-6 text-sm text-destructive">
            Gagal memuat data: {(error as Error)?.message ?? 'Terjadi kesalahan'}
          </div>
        ) : (
          <DataTable
            columns={tableColumns}
            data={rows}
            loading={isLoading}
            rowKey={(row) => row.id}
            emptyTitle="Tidak ada data"
            emptyDescription="Coba ubah kata kunci pencarian atau tambah data baru."
          />
        )}

        <Pagination meta={meta} onPageChange={setPage} />
      </Card>

      {/* Create Dialog */}
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={createLabel}
        description={
          createFields?.length
            ? `Tambah ${title.toLowerCase()} baru`
            : 'Form buat data belum dikonfigurasi untuk modul ini.'
        }
      >
        {createFields?.length ? (
          <form onSubmit={onCreateSubmit} className="space-y-4">
            {createFields.map((field) => (
              <div key={field.name} className="space-y-1.5">
                <Label htmlFor={`create-${field.name}`}>{field.label}</Label>
                {field.type === 'select' ? (
                  <select
                    id={`create-${field.name}`}
                    className="flex h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-xs focus:ring-2 focus:ring-rose-500"
                    value={formValues[field.name] ?? ''}
                    onChange={(e) =>
                      setFormValues((prev) => ({ ...prev, [field.name]: e.target.value }))
                    }
                    required={field.required}
                  >
                    {(field.options ?? []).map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                ) : field.type === 'textarea' ? (
                  <textarea
                    id={`create-${field.name}`}
                    className="flex min-h-[80px] w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-xs focus:ring-2 focus:ring-rose-500"
                    placeholder={field.placeholder}
                    required={field.required}
                    value={formValues[field.name] ?? ''}
                    onChange={(e) =>
                      setFormValues((prev) => ({ ...prev, [field.name]: e.target.value }))
                    }
                  />
                ) : (
                  <Input
                    id={`create-${field.name}`}
                    type={field.type ?? 'text'}
                    placeholder={field.placeholder}
                    required={field.required}
                    value={formValues[field.name] ?? ''}
                    onChange={(e) =>
                      setFormValues((prev) => ({ ...prev, [field.name]: e.target.value }))
                    }
                  />
                )}
              </div>
            ))}
            {formError ? <p className="text-sm text-destructive">{formError}</p> : null}
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Batal
              </Button>
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending ? 'Menyimpan...' : 'Simpan'}
              </Button>
            </div>
          </form>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Form buat data belum dikonfigurasi.
            </p>
            <div className="flex justify-end">
              <Button variant="outline" onClick={() => setOpen(false)}>
                Tutup
              </Button>
            </div>
          </div>
        )}
      </Dialog>

      {/* Edit Dialog */}
      <Dialog
        open={editOpen}
        onClose={() => setEditOpen(false)}
        title={editLabel}
        description={`Ubah detail data ${title.toLowerCase()}`}
      >
        {activeEditFields?.length ? (
          <form onSubmit={onEditSubmit} className="space-y-4">
            {activeEditFields.map((field) => (
              <div key={field.name} className="space-y-1.5">
                <Label htmlFor={`edit-${field.name}`}>{field.label}</Label>
                {field.type === 'select' ? (
                  <select
                    id={`edit-${field.name}`}
                    className="flex h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-xs focus:ring-2 focus:ring-rose-500"
                    value={editFormValues[field.name] ?? ''}
                    onChange={(e) =>
                      setEditFormValues((prev) => ({ ...prev, [field.name]: e.target.value }))
                    }
                    required={field.required}
                  >
                    {(field.options ?? []).map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                ) : field.type === 'textarea' ? (
                  <textarea
                    id={`edit-${field.name}`}
                    className="flex min-h-[80px] w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-xs focus:ring-2 focus:ring-rose-500"
                    placeholder={field.placeholder}
                    required={field.required}
                    value={editFormValues[field.name] ?? ''}
                    onChange={(e) =>
                      setEditFormValues((prev) => ({ ...prev, [field.name]: e.target.value }))
                    }
                  />
                ) : (
                  <Input
                    id={`edit-${field.name}`}
                    type={field.type ?? 'text'}
                    placeholder={field.placeholder}
                    required={field.required}
                    value={editFormValues[field.name] ?? ''}
                    onChange={(e) =>
                      setEditFormValues((prev) => ({ ...prev, [field.name]: e.target.value }))
                    }
                  />
                )}
              </div>
            ))}
            {editFormError ? <p className="text-sm text-destructive">{editFormError}</p> : null}
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setEditOpen(false)}>
                Batal
              </Button>
              <Button type="submit" disabled={updateMutation.isPending}>
                {updateMutation.isPending ? 'Menyimpan...' : 'Simpan Perubahan'}
              </Button>
            </div>
          </form>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Form edit belum dikonfigurasi.
            </p>
            <div className="flex justify-end">
              <Button variant="outline" onClick={() => setEditOpen(false)}>
                Tutup
              </Button>
            </div>
          </div>
        )}
      </Dialog>

      {/* Delete Dialog */}
      <Dialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title="Hapus Data"
        description="Apakah Anda yakin ingin menghapus data ini? Tindakan ini tidak dapat dibatalkan."
      >
        <div className="space-y-4">
          {deleteError ? <p className="text-sm text-destructive">{deleteError}</p> : null}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setDeleteOpen(false)}>
              Batal
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={deleteMutation.isPending}
              onClick={onDeleteConfirm}
            >
              {deleteMutation.isPending ? 'Menghapus...' : 'Hapus'}
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  )
}

