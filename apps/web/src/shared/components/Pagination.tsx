import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { PaginationMeta } from '@/shared/types/api'
import { Button } from '@/shared/ui/button'
import { formatNumber } from '@/shared/lib/formatters'

type Props = {
  meta?: PaginationMeta
  onPageChange: (page: number) => void
}

export function Pagination({ meta, onPageChange }: Props) {
  if (!meta || meta.total_pages <= 1) return null

  return (
    <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-3">
      <p className="text-sm text-muted-foreground">
        Halaman {meta.page} dari {meta.total_pages} · {formatNumber(meta.total)} data
      </p>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={meta.page <= 1}
          onClick={() => onPageChange(meta.page - 1)}
        >
          <ChevronLeft className="h-4 w-4" />
          Prev
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={meta.page >= meta.total_pages}
          onClick={() => onPageChange(meta.page + 1)}
        >
          Next
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}
