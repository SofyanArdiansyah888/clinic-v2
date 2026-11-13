import { useCallback, useRef, useState, type ReactNode } from 'react'
import { Dialog } from '@/shared/components/Dialog'
import { Button } from '@/shared/ui/button'

type ConfirmOptions = {
  title: string
  description?: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  destructive?: boolean
}

/**
 * In-app replacement for window.confirm().
 *
 *   const [confirm, confirmDialog] = useConfirm()
 *   if (await confirm({ title: 'Batalkan antrian?', destructive: true })) { ... }
 *   return <>{...}{confirmDialog}</>
 */
export function useConfirm() {
  const [options, setOptions] = useState<ConfirmOptions | null>(null)
  const resolver = useRef<((ok: boolean) => void) | null>(null)

  const confirm = useCallback((opts: ConfirmOptions) => {
    resolver.current?.(false)
    setOptions(opts)
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve
    })
  }, [])

  const close = useCallback((ok: boolean) => {
    resolver.current?.(ok)
    resolver.current = null
    setOptions(null)
  }, [])

  const element = (
    <Dialog open={options !== null} onClose={() => close(false)} title={options?.title ?? ''} className="max-w-sm">
      {options?.description ? <div className="text-sm text-slate-600">{options.description}</div> : null}
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="outline" onClick={() => close(false)}>
          {options?.cancelLabel ?? 'Kembali'}
        </Button>
        <Button variant={options?.destructive ? 'destructive' : 'default'} onClick={() => close(true)} autoFocus>
          {options?.confirmLabel ?? 'Ya, lanjutkan'}
        </Button>
      </div>
    </Dialog>
  )

  return [confirm, element] as const
}
