import { PageHeader } from '@/shared/components/PageHeader'
import { Card, CardContent } from '@/shared/ui/card'

type ReportShellProps = {
  title: string
  description: string
}

export function ReportShell({ title, description }: ReportShellProps) {
  return (
    <div>
      <PageHeader title={title} description={description} />
      <Card>
        <CardContent className="py-16 text-center">
          <p className="text-base font-semibold text-foreground">Laporan dalam pengembangan</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Modul laporan akan menampilkan ringkasan dan ekspor data.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
