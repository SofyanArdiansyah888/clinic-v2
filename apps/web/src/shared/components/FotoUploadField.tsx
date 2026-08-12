import { Camera, ImagePlus, Loader2, Trash2, Upload } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { uploadImage } from '@/shared/api/upload'
import { Button } from '@/shared/ui/button'
import { cn } from '@/shared/lib/cn'

type FotoUploadFieldProps = {
  label: string
  folder: string
  value: string[]
  onChange: (urls: string[]) => void
  multiple?: boolean
  className?: string
}

export function FotoUploadField({
  label,
  folder,
  value,
  onChange,
  multiple = true,
  className,
}: FotoUploadFieldProps) {
  const [uploading, setUploading] = useState(false)
  const [cameraOn, setCameraOn] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

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
    setError(null)
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
      setError('Kamera tidak tersedia. Gunakan pilih dari galeri.')
      setCameraOn(false)
    }
  }

  async function uploadFiles(files: File[]) {
    const images = files.filter((f) => f.type.startsWith('image/'))
    if (images.length === 0) return

    setUploading(true)
    setError(null)
    try {
      const uploaded: string[] = []
      for (const file of images) {
        const res = await uploadImage(file, folder)
        uploaded.push(res.url)
      }
      onChange(multiple ? [...value, ...uploaded] : uploaded.slice(0, 1))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal mengunggah foto')
    } finally {
      setUploading(false)
    }
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
    const file = new File([blob], `${folder}-${Date.now()}.jpg`, { type: 'image/jpeg' })
    await uploadFiles([file])
  }

  function removeAt(index: number) {
    onChange(value.filter((_, i) => i !== index))
  }

  return (
    <div className={cn('space-y-2', className)}>
      <label className="block text-xs font-bold text-slate-700">{label}</label>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          className="rounded-xl text-xs"
          disabled={uploading}
          onClick={() => void startCamera()}
        >
          <Camera className="h-3.5 w-3.5" />
          Kamera
        </Button>
        <Button
          type="button"
          variant="outline"
          className="rounded-xl text-xs"
          disabled={uploading}
          onClick={() => fileRef.current?.click()}
        >
          <ImagePlus className="h-3.5 w-3.5" />
          Galeri
        </Button>
        {cameraOn ? (
          <Button type="button" variant="ghost" className="rounded-xl text-xs" onClick={stopCamera} disabled={uploading}>
            Tutup Kamera
          </Button>
        ) : null}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple={multiple}
          capture="environment"
          className="hidden"
          onChange={(e) => {
            if (e.target.files) void uploadFiles(Array.from(e.target.files))
            e.target.value = ''
          }}
        />
      </div>

      {cameraOn ? (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-950">
          <video ref={videoRef} className="aspect-video w-full object-cover" playsInline muted />
          <div className="flex justify-center bg-slate-900 p-3">
            <Button
              type="button"
              className="rounded-xl text-xs"
              disabled={uploading}
              onClick={() => void captureFrame()}
            >
              {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />}
              Ambil Foto
            </Button>
          </div>
        </div>
      ) : null}

      {error ? <p className="text-[11px] font-medium text-rose-600">{error}</p> : null}

      {value.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-6 text-center">
          {uploading ? (
            <Loader2 className="mb-2 h-5 w-5 animate-spin text-rose-500" />
          ) : (
            <Upload className="mb-2 h-5 w-5 text-slate-400" />
          )}
          <p className="text-[11px] font-semibold text-slate-500">
            {uploading ? 'Mengunggah...' : 'Belum ada foto — ambil dari kamera atau galeri'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {value.map((url, index) => (
            <div key={`${url}-${index}`} className="group relative overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
              <img src={url} alt={`${label} ${index + 1}`} className="aspect-square w-full object-cover" />
              <button
                type="button"
                title="Hapus foto"
                disabled={uploading}
                onClick={() => removeAt(index)}
                className="absolute top-2 right-2 rounded-lg bg-slate-950/70 p-1.5 text-white"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
