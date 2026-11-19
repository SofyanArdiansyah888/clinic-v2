import { useState, type FormEvent } from 'react'
import { FileUp, Trash2, FileText } from 'lucide-react'
import { Dialog } from '@/shared/components/Dialog'
import { Button } from '@/shared/ui/button'
import { Field } from '@/shared/ui/field'
import { FieldErrorsContext, useFormValidation } from '@/shared/lib/validation'
import { todayISO } from '@/shared/lib/formatters'

type DocumentItem = {
  name: string
  url: string
  date: string
}

type ConsentDocumentModalProps = {
  isOpen: boolean
  onClose: () => void
  onSave?: (docs: DocumentItem[]) => void
}

export function ConsentDocumentModal({ isOpen, onClose, onSave }: ConsentDocumentModalProps) {
  const [docs, setDocs] = useState<DocumentItem[]>([])
  const [docName, setDocName] = useState('')
  const [docUrl, setDocUrl] = useState('')
  const validation = useFormValidation()

  function handleClose() {
    validation.reset()
    onClose()
  }

  // "Nama Dokumen" is checked natively (required) before this runs.
  function handleAdd(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    // Portalled inside the EMR form: keep this submit from reaching it.
    e.stopPropagation()
    if (!docName.trim()) return
    const newDoc: DocumentItem = {
      name: docName.trim(),
      url: docUrl.trim() || '#',
      date: todayISO(),
    }
    setDocs((prev) => [...prev, newDoc])
    setDocName('')
    setDocUrl('')
    validation.reset()
  }

  function handleRemove(idx: number) {
    setDocs((prev) => prev.filter((_, i) => i !== idx))
  }

  function handleSave() {
    onSave?.(docs)
    handleClose()
  }

  return (
    <Dialog
      open={isOpen}
      onClose={handleClose}
      title="Informed Consent"
      description="Lampirkan dokumen persetujuan pasien"
      className="max-w-xl"
    >
      <div className="space-y-4">
        <FieldErrorsContext.Provider value={validation.errors}>
          <form
            {...validation.formProps}
            onSubmit={handleAdd}
            className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/50 p-3"
          >
            <p className="text-sm font-bold text-slate-900">Tambah Dokumen</p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <Field label="Nama Dokumen" htmlFor="consentdocumentmodal-f1" required>
                <input id="consentdocumentmodal-f1"
                  required
                  value={docName}
                  onChange={(e) => setDocName(e.target.value)}
                  placeholder="Contoh: Consent Laser"
                  className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs focus:border-rose-500 focus:outline-none"
                />
              </Field>
              <Field label="Link Dokumen" htmlFor="consentdocumentmodal-f2">
                <input id="consentdocumentmodal-f2"
                  value={docUrl}
                  onChange={(e) => setDocUrl(e.target.value)}
                  placeholder="https://..."
                  className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs focus:border-rose-500 focus:outline-none"
                />
              </Field>
            </div>
            <div className="flex justify-end">
              <Button type="submit" size="sm" variant="outline">
                <FileUp />
                Tambah
              </Button>
            </div>
          </form>
        </FieldErrorsContext.Provider>

        <div>
          <p className="mb-2 text-sm font-bold text-slate-900">Lampiran</p>
          {docs.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-xs text-slate-400">
              Belum ada dokumen.
            </div>
          ) : (
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {docs.map((doc, idx) => (
                <div key={idx} className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-2.5">
                  <div className="flex items-center gap-2 min-w-0">
                    <FileText className="h-4 w-4 text-rose-600 shrink-0" />
                    <div className="truncate">
                      <p className="text-xs font-bold text-slate-900 truncate">{doc.name}</p>
                      <p className="text-[11px] text-slate-400">{doc.date}</p>
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="ghost-danger"
                    size="icon-sm"
                    onClick={() => handleRemove(idx)}
                    title="Hapus dokumen"
                    aria-label="Hapus dokumen"
                  >
                    <Trash2 />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
          <Button type="button" variant="outline" onClick={handleClose}>
            Tutup
          </Button>
          <Button type="button" onClick={handleSave}>
            Simpan
          </Button>
        </div>
      </div>
    </Dialog>
  )
}
