import { useState } from 'react'
import { FileUp, Trash2, FileText } from 'lucide-react'
import { Dialog } from '@/shared/components/Dialog'
import { Button } from '@/shared/ui/button'
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

  function handleAdd() {
    if (!docName.trim()) return
    const newDoc: DocumentItem = {
      name: docName.trim(),
      url: docUrl.trim() || '#',
      date: todayISO(),
    }
    setDocs((prev) => [...prev, newDoc])
    setDocName('')
    setDocUrl('')
  }

  function handleRemove(idx: number) {
    setDocs((prev) => prev.filter((_, i) => i !== idx))
  }

  function handleSave() {
    onSave?.(docs)
    onClose()
  }

  return (
    <Dialog
      open={isOpen}
      onClose={onClose}
      title="Upload / Lampirkan Dokumen Informed Consent"
      description="Lampirkan dokumen persetujuan tindakan medis atau surat pernyataan pasien."
      className="max-w-xl"
    >
      <div className="space-y-4">
        <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/50 p-3">
          <p className="text-xs font-bold text-slate-800">Tambah Dokumen Baru</p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div>
              <label htmlFor="consentdocumentmodal-f1" className="block text-[11px] font-semibold text-slate-600 mb-1">Nama Dokumen *</label>
              <input id="consentdocumentmodal-f1"
                value={docName}
                onChange={(e) => setDocName(e.target.value)}
                placeholder="misal: Informed Consent Laser"
                className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs focus:border-rose-500 focus:outline-none"
              />
            </div>
            <div>
              <label htmlFor="consentdocumentmodal-f2" className="block text-[11px] font-semibold text-slate-600 mb-1">URL / Link Dokumen</label>
              <input id="consentdocumentmodal-f2"
                value={docUrl}
                onChange={(e) => setDocUrl(e.target.value)}
                placeholder="https://..."
                className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs focus:border-rose-500 focus:outline-none"
              />
            </div>
          </div>
          <div className="flex justify-end">
            <Button type="button" size="sm" onClick={handleAdd} disabled={!docName.trim()} className="rounded-lg text-xs">
              <FileUp className="h-3.5 w-3.5 mr-1" />
              Tambahkan
            </Button>
          </div>
        </div>

        <div>
          <p className="text-xs font-bold text-slate-800 mb-2">Daftar Dokumen Lampiran</p>
          {docs.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-xs text-slate-400">
              Belum ada dokumen disetujui / dilampirkan.
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
                  <button
                    type="button"
                    onClick={() => handleRemove(idx)}
                    className="rounded p-1 text-rose-500 hover:bg-rose-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
          <Button type="button" variant="outline" onClick={onClose} className="rounded-xl text-xs">
            Tutup
          </Button>
          <Button type="button" onClick={handleSave} className="rounded-xl text-xs">
            Simpan Dokumen
          </Button>
        </div>
      </div>
    </Dialog>
  )
}
