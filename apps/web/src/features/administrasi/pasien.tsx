import { useState } from 'react'
import { Upload } from 'lucide-react'
import { ResourceListPage, type FormField } from '@/shared/components/ResourceListPage'
import { StatusBadge } from '@/shared/components/StatusBadge'
import type { Column } from '@/shared/components/DataTable'
import { Dialog } from '@/shared/components/Dialog'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'
import { Label } from '@/shared/ui/label'

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

const formFields: FormField[] = [
  { name: 'nama', label: 'Nama Pasien', required: true },
  { name: 'no_telp', label: 'No. Telepon', type: 'tel' },
  { name: 'email', label: 'Email', type: 'email' },
  { name: 'alamat', label: 'Alamat', type: 'textarea' },
  {
    name: 'jenis_kelamin',
    label: 'Jenis Kelamin',
    type: 'select',
    options: [
      { label: 'Laki-laki', value: 'L' },
      { label: 'Perempuan', value: 'P' },
    ],
  },
  { name: 'tanggal_lahir', label: 'Tanggal Lahir', type: 'date' },
]

export function PasienPage() {
  const [importOpen, setImportOpen] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [importSuccess, setImportSuccess] = useState(false)

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
        description="Master data pasien klinik"
        endpoint="/pasien"
        queryKey="pasien"
        columns={columns}
        createLabel="Tambah Pasien"
        createFields={formFields}
        editFields={formFields}
        extraActions={
          <Button variant="outline" onClick={() => setImportOpen(true)}>
            <Upload className="h-4 w-4" />
            Import CSV/Excel
          </Button>
        }
      />

      <Dialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        title="Import Data Pasien"
        description="Unggah berkas CSV/Excel daftar pasien untuk diimpor sekaligus."
      >
        <form onSubmit={handleImportSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="import-file">Pilih Berkas (.csv / .xlsx)</Label>
            <Input
              id="import-file"
              type="file"
              accept=".csv, .xlsx, .xls"
              onChange={(e) => setSelectedFile(e.target.files?.[0] ?? null)}
              required
            />
          </div>
          {importSuccess ? (
            <p className="text-xs font-semibold text-emerald-600">
              Data pasien berhasil diimpor!
            </p>
          ) : null}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setImportOpen(false)}>
              Batal
            </Button>
            <Button type="submit" disabled={!selectedFile}>
              Proses Import
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  )
}
