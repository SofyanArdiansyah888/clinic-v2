import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Search } from 'lucide-react'
import { useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { apiGet, apiPost } from '@/shared/api/client'
import { DataTable, type Column } from '@/shared/components/DataTable'
import { Dialog } from '@/shared/components/Dialog'
import { PageHeader } from '@/shared/components/PageHeader'
import { Pagination } from '@/shared/components/Pagination'
import type { PaginationMeta } from '@/shared/types/api'
import { Button } from '@/shared/ui/button'
import { Card } from '@/shared/ui/card'
import { Input } from '@/shared/ui/input'
import { Label } from '@/shared/ui/label'

export type FormField = {
  name: string
  label: string
  type?: 'text' | 'email' | 'number' | 'tel' | 'date' | 'password' | 'select'
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
  createLabel?: string
  transformCreateBody?: (values: Record<string, string>) => unknown
  enableCreate?: boolean
  extraActions?: ReactNode
  filterParams?: Record<string, string | number | undefined>
}

export function ResourceListPage<T extends { id: number | string }>({
  title,
  description,
  endpoint,
  queryKey,
  columns,
  createFields,
  createLabel = 'Tambah',
  transformCreateBody,
  enableCreate = Boolean(createFields?.length),
  extraActions,
  filterParams,
}: ResourceListPageProps<T>) {
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [open, setOpen] = useState(false)
  const [formValues, setFormValues] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)

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

  const rows = (data?.data ?? []) as T[]
  const meta = data?.meta as PaginationMeta | undefined

  function onSubmitSearch(e: FormEvent) {
    e.preventDefault()
    setPage(1)
    setSearch(searchInput.trim())
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
              return [field.name, raw === '' ? null : raw]
            }
            return [field.name, raw]
          }),
        )
    createMutation.mutate(body)
  }

  function openCreate() {
    if (!enableCreate || !createFields?.length) return
    const initial: Record<string, string> = {}
    for (const field of createFields) {
      if (field.type === 'date' && !field.placeholder) {
        initial[field.name] = new Date().toISOString().slice(0, 10)
      } else {
        initial[field.name] = field.options?.[0]?.value ?? ''
      }
    }
    setFormValues(initial)
    setFormError(null)
    setOpen(true)
  }

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
          <form onSubmit={onSubmitSearch} className="flex flex-col gap-3 md:flex-row">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute top-3 left-3 h-4 w-4 text-slate-400" />
              <Input
                className="h-10 pl-9"
                placeholder="Cari data..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
              />
            </div>
            <Button type="submit" variant="secondary" className="h-10">
              Cari
            </Button>
          </form>
        </div>

        {isError ? (
          <div className="p-6 text-sm text-destructive">
            Gagal memuat data: {(error as Error)?.message ?? 'Terjadi kesalahan'}
          </div>
        ) : (
          <DataTable
            columns={columns}
            data={rows}
            loading={isLoading}
            rowKey={(row) => row.id}
            emptyTitle="Tidak ada data"
            emptyDescription="Coba ubah kata kunci pencarian atau tambah data baru."
          />
        )}

        <Pagination meta={meta} onPageChange={setPage} />
      </Card>

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
                <Label htmlFor={field.name}>{field.label}</Label>
                {field.type === 'select' ? (
                  <select
                    id={field.name}
                    className="flex h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-xs focus:ring-2 focus:ring-teal-500"
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
                ) : (
                  <Input
                    id={field.name}
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
              Endpoint create tersedia, namun form detail belum diimplementasikan.
            </p>
            <div className="flex justify-end">
              <Button variant="outline" onClick={() => setOpen(false)}>
                Tutup
              </Button>
            </div>
          </div>
        )}
      </Dialog>
    </div>
  )
}
