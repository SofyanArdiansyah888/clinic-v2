import { Link } from '@tanstack/react-router'
import { LockKeyhole } from 'lucide-react'
import { cn } from '@/shared/lib/cn'

/** Shown where money is taken while the account has no open cashier shift; the server refuses it too. */
export function ShiftBelumDibukaAlert({ className }: { className?: string }) {
  return (
    <div
      role="alert"
      data-testid="shift-belum-dibuka"
      className={cn('flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-900', className)}
    >
      <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
      <p>
        <span className="font-bold">Kasir belum dibuka.</span> Transaksi uang hanya bisa dicatat pada shift kasir yang terbuka.{' '}
        <Link to="/pembayaran/kasir" className="font-bold text-rose-700 underline underline-offset-2">
          Buka kasir sekarang
        </Link>
      </p>
    </div>
  )
}
