import { Eraser } from 'lucide-react'
import { useImperativeHandle, useRef, useState, type PointerEvent, type Ref } from 'react'
import { Button } from '@/shared/ui/button'
import { cn } from '@/shared/lib/cn'

export type SignaturePadHandle = {
  isEmpty: () => boolean
  clear: () => void
  /** The drawing as a transparent PNG, or null when nothing was drawn. */
  toBlob: () => Promise<Blob | null>
}

type SignaturePadProps = {
  ref?: Ref<SignaturePadHandle>
  label: string
  id?: string
  required?: boolean
  onChange?: (hasInk: boolean) => void
  className?: string
}

// Fixed drawing resolution; the canvas is scaled to its box with CSS.
const WIDTH = 600
const HEIGHT = 220

/** Finger / stylus / mouse signature box. */
export function SignaturePad({ ref, label, id, required, onChange, className }: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)
  const last = useRef<{ x: number; y: number } | null>(null)
  const [hasInk, setHasInk] = useState(false)

  function clear() {
    const canvas = canvasRef.current
    canvas?.getContext('2d')?.clearRect(0, 0, WIDTH, HEIGHT)
    setHasInk(false)
    onChange?.(false)
  }

  useImperativeHandle(ref, () => ({
    isEmpty: () => !hasInk,
    clear,
    toBlob: () =>
      new Promise<Blob | null>((resolve) => {
        const canvas = canvasRef.current
        if (!canvas || !hasInk) return resolve(null)
        canvas.toBlob((b) => resolve(b), 'image/png')
      }),
  }))

  function point(e: PointerEvent<HTMLCanvasElement>) {
    const rect = e.currentTarget.getBoundingClientRect()
    return {
      x: ((e.clientX - rect.left) / rect.width) * WIDTH,
      y: ((e.clientY - rect.top) / rect.height) * HEIGHT,
    }
  }

  function onPointerDown(e: PointerEvent<HTMLCanvasElement>) {
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    drawing.current = true
    last.current = point(e)
    const ctx = e.currentTarget.getContext('2d')
    if (ctx) {
      // A tap leaves a dot.
      ctx.fillStyle = '#0f172a'
      ctx.beginPath()
      ctx.arc(last.current.x, last.current.y, 1.5, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  function onPointerMove(e: PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current || !last.current) return
    const ctx = e.currentTarget.getContext('2d')
    if (!ctx) return
    const p = point(e)
    ctx.strokeStyle = '#0f172a'
    ctx.lineWidth = 3
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.beginPath()
    ctx.moveTo(last.current.x, last.current.y)
    ctx.lineTo(p.x, p.y)
    ctx.stroke()
    last.current = p
    if (!hasInk) {
      setHasInk(true)
      onChange?.(true)
    }
  }

  function onPointerUp() {
    drawing.current = false
    last.current = null
  }

  return (
    <div className={cn('space-y-1', className)}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-slate-700">
          {label}
          {required ? <span className="text-rose-600"> *</span> : null}
        </span>
        <Button type="button" variant="ghost" size="sm" onClick={clear} disabled={!hasInk}>
          <Eraser />
          Hapus
        </Button>
      </div>
      <canvas
        id={id}
        ref={canvasRef}
        width={WIDTH}
        height={HEIGHT}
        aria-label={label}
        role="img"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className="block aspect-[60/22] w-full cursor-crosshair touch-none rounded-xl border border-dashed border-slate-300 bg-white"
      />
      {!hasInk ? <p className="text-[11px] text-slate-400">Tanda tangan di dalam kotak.</p> : null}
    </div>
  )
}
