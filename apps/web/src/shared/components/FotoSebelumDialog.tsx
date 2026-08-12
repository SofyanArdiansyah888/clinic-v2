import { Camera, ImagePlus, Trash2, Upload } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Dialog } from '@/shared/components/Dialog'
import { Button } from '@/shared/ui/button'
import { cn } from '@/shared/lib/cn'

export type PendingPhoto = {
  id: string
  file: File
  previewUrl: string
}

type FotoSebelumDialogProps = {
  open: boolean
  onClose: () => void
  patientName?: string
  queueCode?: string
  submitting?: boolean
  onConfirm: (photos: PendingPhoto[]) => void | Promise<void>
}

function newId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export function FotoSebelumDialog({
  open,
  onClose,
  patientName,
  queueCode,
  submitting,
  onConfirm,
}: FotoSebelumDialogProps) {
  const [photos, setPhotos] = useState<PendingPhoto[]>([])
  const [cameraOn, setCameraOn] = useState(false)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) {
      stopCamera()
      setPhotos((prev) => {
        prev.forEach((p) => URL.revokeObjectURL(p.previewUrl))
        return []
      })
      setCameraError(null)
    }
  }, [open])

  useEffect(() => {
    return () => stopCamera()
  }, [])

  function stopCamera() {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    setCameraOn(false)
    if (videoRef.current) videoRef.current.srcObject = null
  }

  async function startCamera() {
    setCameraError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: false,
      })
      streamRef.current = stream
      setCameraOn(true)
      window.setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          void videoRef.current.play()
        }
      }, 50)
    } catch {
      setCameraError('Kamera tidak tersedia. Gunakan upload file.')
      setCameraOn(false)
    }
  }

  function addFiles(list: FileList | File[]) {
    const next: PendingPhoto[] = []
    Array.from(list).forEach((file) => {
      if (!file.type.startsWith('image/')) return
      next.push({ id: newId(), file, previewUrl: URL.createObjectURL(file) })
    })
    if (next.length) setPhotos((prev) => [...prev, ...next])
  }

  function removePhoto(id: string) {
    setPhotos((prev) => {
      const target = prev.find((p) => p.id === id)
      if (target) URL.revokeObjectURL(target.previewUrl)
      return prev.filter((p) => p.id !== id)
    })
  }

  async function captureFrame() {
    const video = videoRef.current
    if (!video) return
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth || 1280
    canvas.height = video.videoHeight || 720
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9))
    if (!blob) return
    const file = new File([blob], `foto-sebelum-${Date.now()}.jpg`, { type: 'image/jpeg' })
    addFiles([file])
  }

  async function handleConfirm() {
    if (photos.length === 0) return
    await onConfirm(photos)
  }

  return (
    <Dialog
      open={open}
      onClose={() => {
        if (!submitting) onClose()
      }}
      title="Foto Sebelum Perawatan"
      description={
        queueCode
          ? `Ambil foto pasien sebelum masuk perawatan${patientName ? ` — ${patientName}` : ''} (${queueCode})`
          : 'Ambil foto pasien sebelum masuk perawatan'
      }
      className="max-w-2xl"
    >
      <div className="space-y-4">
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-medium text-amber-900">
          Foto wajib diunggah sebelum pasien diarahkan ke modul perawatan. File disimpan via API upload
          (local sekarang; MinIO dapat dihubungkan nanti tanpa ubah alur UI).
        </div>

        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" className="rounded-xl text-xs" onClick={() => void startCamera()} disabled={submitting}>
            <Camera className="h-3.5 w-3.5" />
            Buka Kamera
          </Button>
          <Button
            type="button"
            variant="outline"
            className="rounded-xl text-xs"
            onClick={() => fileRef.current?.click()}
            disabled={submitting}
          >
            <ImagePlus className="h-3.5 w-3.5" />
            Pilih dari Galeri
          </Button>
          {cameraOn ? (
            <Button type="button" variant="ghost" className="rounded-xl text-xs" onClick={stopCamera} disabled={submitting}>
              Tutup Kamera
            </Button>
          ) : null}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            capture="environment"
            className="hidden"
            onChange={(e) => {
              if (e.target.files) addFiles(e.target.files)
              e.target.value = ''
            }}
          />
        </div>

        {cameraError ? <p className="text-xs font-medium text-rose-600">{cameraError}</p> : null}

        {cameraOn ? (
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-950">
            <video ref={videoRef} className="aspect-video w-full object-cover" playsInline muted />
            <div className="flex justify-center bg-slate-900 p-3">
              <Button type="button" className="rounded-xl text-xs" onClick={() => void captureFrame()} disabled={submitting}>
                <Camera className="h-3.5 w-3.5" />
                Ambil Foto
              </Button>
            </div>
          </div>
        ) : null}

        <div>
          <p className="mb-2 text-xs font-bold text-slate-700">Preview ({photos.length})</p>
          {photos.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center">
              <Upload className="mb-2 h-6 w-6 text-slate-400" />
              <p className="text-xs font-semibold text-slate-600">Belum ada foto</p>
              <p className="mt-1 text-[11px] text-slate-400">Ambil dari kamera atau pilih file gambar.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {photos.map((p) => (
                <div key={p.id} className="group relative overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
                  <img src={p.previewUrl} alt={p.file.name} className="aspect-square w-full object-cover" />
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={() => removePhoto(p.id)}
                    className={cn(
                      'absolute top-2 right-2 rounded-lg bg-slate-950/70 p-1.5 text-white opacity-100 transition sm:opacity-0 sm:group-hover:opacity-100',
                    )}
                    title="Hapus"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-slate-100 pt-3">
          <Button type="button" variant="outline" className="rounded-xl text-xs" onClick={onClose} disabled={submitting}>
            Batal
          </Button>
          <Button
            type="button"
            className="rounded-xl text-xs"
            disabled={submitting || photos.length === 0}
            onClick={() => void handleConfirm()}
          >
            {submitting ? 'Mengunggah & membuka perawatan...' : 'Lanjut ke Perawatan'}
          </Button>
        </div>
      </div>
    </Dialog>
  )
}
