import { useState } from 'react'
import { Upload } from 'lucide-react'
import { ResourceListPage } from '@/shared/components/ResourceListPage'
import { MASTERS } from '@/shared/lib/masters'
import { StatusBadge } from '@/shared/components/StatusBadge'
import type { Column } from '@/shared/components/DataTable'
import { Dialog } from '@/shared/components/Dialog'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'
import { Field } from '@/shared/ui/field'
import { FieldErrorsContext, useFormValidation } from '@/shared/lib/validation'

type Pasien = {
  id: number
  kode: string
  nama: string
  no_telp?: string
  email?: string
  alamat?: string
  jenis_kelamin?: string
  tanggal_lahir?: string
  is_active: boolean
}

const columns: Column<Pasien>[] = [
  { key: 'kode', header: 'Kode', cell: (r) => <span className="font-mono font-bold text-rose-700">{r.kode}</span> },
  { key: 'nama', header: 'Nama Pasien', cell: (r) => <span className="font-bold text-slate-900">{r.nama}</span> },
  { key: 'no_telp', header: 'No. Telp', cell: (r) => <span className="font-mono">{r.no_telp || '-'}</span> },
  { key: 'email', header: 'Email', cell: (r) => r.email || '-' },
  { key: 'jk', header: 'JK', cell: (r) => (r.jenis_kelamin === 'L' ? 'Laki-laki' : r.jenis_kelamin === 'P' ? 'Perempuan' : '-') },
  { key: 'status', header: 'Status', cell: (r) => <StatusBadge status={r.is_active} /> },
]

const formFields = MASTERS.pasien.fields

export function PasienPage() {
  const [importOpen, setImportOpen] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [importSuccess, setImportSuccess] = useState(false)
  const validation = useFormValidation()

  function handleImportSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedFile) return
    setImportSuccess(true)
    setTimeout(() => {
      setImportSuccess(false)
      setImportOpen(false)
      setSelectedFile(null)
    }, 1500)
  }

  return (
    <div>
      <ResourceListPage<Pasien>
        title="Pasien"
        endpoint="/pasien"
        queryKey="pasien"
        columns={columns}
        createLabel="Tambah Pasien"
        createFields={formFields}
        editFields={formFields}
        extraActions={
          <Button variant="outline" onClick={() => {
              validation.reset()
              setImportOpen(true)
            }}>
            <Upload />
            Import
          </Button>
        }
      />

      <Dialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        title="Import Data Pasien"
        description="Format CSV atau Excel"
      >
        <FieldErrorsContext.Provider value={validation.errors}>
          <form {...validation.formProps} onSubmit={handleImportSubmit} className="space-y-4">
            <Field label="Berkas" htmlFor="import-file" required>
              <Input
                id="import-file"
                type="file"
                accept=".csv, .xlsx, .xls"
                onChange={(e) => setSelectedFile(e.target.files?.[0] ?? null)}
                required
              />
            </Field>
            {importSuccess ? (
              <p className="text-xs font-semibold text-emerald-600">
                Data pasien berhasil diimpor!
              </p>
            ) : null}
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setImportOpen(false)}>
                Batal
              </Button>
              <Button type="submit">
                Import
              </Button>
            </div>
          </form>
        </FieldErrorsContext.Provider>
      </Dialog>
    </div>
  )
}
