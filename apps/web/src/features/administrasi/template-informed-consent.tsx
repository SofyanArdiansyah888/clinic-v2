import { ResourceListPage, type FormField } from '@/shared/components/ResourceListPage'
import { StatusBadge } from '@/shared/components/StatusBadge'
import type { Column } from '@/shared/components/DataTable'

type TemplateInformedConsent = {
  id: number
  judul: string
  kategori?: string
  isi?: string
  is_active: boolean
}

const columns: Column<TemplateInformedConsent>[] = [
  { key: 'judul', header: 'Judul', cell: (r) => <span className="font-bold text-slate-900">{r.judul}</span> },
  {
    key: 'kategori',
    header: 'Kategori',
    cell: (r) => (
      <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
        {r.kategori || 'Umum'}
      </span>
    ),
  },
  {
    key: 'isi',
    header: 'Isi',
    cell: (r) => <span className="truncate max-w-xs block text-slate-600">{r.isi || '-'}</span>,
  },
  { key: 'status', header: 'Status', cell: (r) => <StatusBadge status={r.is_active} /> },
]

const formFields: FormField[] = [
  { name: 'judul', label: 'Judul', required: true },
  { name: 'kategori', label: 'Kategori', placeholder: 'Estetika, Dental, ...' },
  { name: 'isi', label: 'Isi Persetujuan', type: 'textarea', required: true },
]

export function TemplateInformedConsentPage() {
  return (
    <ResourceListPage<TemplateInformedConsent>
      title="Template Consent"
      description="Surat persetujuan tindakan medis"
      endpoint="/template-informed-consent"
      queryKey="template-informed-consent"
      columns={columns}
      createLabel="Tambah Template"
      createFields={formFields}
      editFields={formFields}
    />
  )
}
