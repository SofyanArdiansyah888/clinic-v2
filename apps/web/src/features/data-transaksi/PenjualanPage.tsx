import { ResourceListPage } from "@/shared/components/ResourceListPage";
import { StatusBadge } from "@/shared/components/StatusBadge";
import type { Column } from "@/shared/components/DataTable";
import { formatCurrency, formatDate, todayISO } from "@/shared/lib/formatters";
import { metodeLabel } from "@/shared/lib/pembayaran";
import { openPrintTab } from "@/shared/lib/print";
import { Button } from "@/shared/ui/button";
import { Ban, Printer, Trash2 } from "lucide-react";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { apiDelete } from "@/shared/api/client";
import { useConfirm } from "@/shared/components/ConfirmDialog";
import { toast } from "@/shared/components/Toaster";
import { useAuthStore } from "@/features/auth/store";
import {
  VoidPenjualanDialog,
  type VoidTarget,
} from "@/features/data-transaksi/components/VoidPenjualanDialog";
import { PenjualanOverview } from "@/features/data-transaksi/components/PenjualanOverview";
import { usePenjualanFilters } from "@/features/data-transaksi/components/usePenjualanFilters";

type Row = {
  id: number;
  kode: string;
  tanggal: string;
  status: string;
  no_invoice?: string;
  jenis_pembayaran?: string;
  total_harga?: number;
  dibatalkan_at?: string | null;
  alasan_batal?: string;
  pasien?: { nama?: string };
};

const today = todayISO();

// Paid sales (and voided ones, stamped DIBATALKAN) have a receipt to reprint.
function KwitansiButton({ r }: { r: Row }) {
  // A cancelled draft never reached the cashier, so it has no payment method and no receipt.
  if (
    r.status !== "paid" &&
    !(r.status === "cancelled" && (r.dibatalkan_at || r.jenis_pembayaran))
  )
    return null;
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      onClick={() => openPrintTab(`/cetak/kwitansi/${r.id}`)}
      title="Cetak Kwitansi"
      aria-label={`Cetak kwitansi ${r.no_invoice || r.kode}`}
    >
      <Printer className="h-3.5 w-3.5" />
    </Button>
  );
}

const columns: Column<Row>[] = [
  {
    key: "kode",
    header: "Kode",
    cell: (r) => (
      <span className="font-mono font-bold text-rose-700">{r.kode}</span>
    ),
  },
  {
    key: "no_invoice",
    header: "No. Invoice",
    cell: (r) => (
      <span className="font-mono text-xs">{r.no_invoice || "-"}</span>
    ),
  },
  { key: "tanggal", header: "Tanggal", cell: (r) => formatDate(r.tanggal) },
  { key: "pasien", header: "Pasien", cell: (r) => r.pasien?.nama || "-" },
  {
    key: "total",
    header: "Total",
    cell: (r) => formatCurrency(r.total_harga ?? 0),
  },
  {
    key: "metode",
    header: "Metode",
    cell: (r) =>
      r.status === "paid" || r.status === "cancelled"
        ? metodeLabel(r.jenis_pembayaran)
        : "-",
  },
  {
    key: "status",
    header: "Status",
    cell: (r) => (
      <span
        title={r.alasan_batal ? `Alasan batal: ${r.alasan_batal}` : undefined}
      >
        <StatusBadge status={r.status} />
      </span>
    ),
  },
];

export function PenjualanPage() {
  const filters = usePenjualanFilters();
  const queryClient = useQueryClient();
  const isAdmin = useAuthStore((s) => s.user?.role) === "admin";
  const [voidTarget, setVoidTarget] = useState<VoidTarget | null>(null);
  const [confirm, confirmDialog] = useConfirm();

  async function hapus(r: Row) {
    const ok = await confirm({
      title: "Hapus penjualan draft?",
      description: `${r.kode} akan dihapus dan stok barangnya dikembalikan.`,
      confirmLabel: "Hapus",
      destructive: true,
    });
    if (!ok) return;
    try {
      await apiDelete(`/penjualan/${r.id}`);
      void queryClient.invalidateQueries({ queryKey: ["penjualan"] });
      toast(`Penjualan ${r.kode} dihapus`, "success");
    } catch (err) {
      const msg = (err as { response?: { data?: { message?: string } } })
        .response?.data?.message;
      toast(msg ?? "Gagal menghapus penjualan", "error");
    }
  }

  // Kwitansi for paid/voided sales; a paid sale is undone only by the admin's void, and
  // only drafts (never paid) can be deleted.
  function rowActions(r: Row) {
    return (
      <>
        <KwitansiButton r={r} />
        {isAdmin && r.status === "paid" ? (
          <Button
            type="button"
            variant="ghost-danger"
            size="icon-sm"
            onClick={() => setVoidTarget(r)}
            title="Batalkan (void) transaksi lunas"
            aria-label={`Batalkan ${r.no_invoice || r.kode}`}
          >
            <Ban className="h-3.5 w-3.5" />
          </Button>
        ) : null}
        {r.status === "draft" ? (
          <Button
            type="button"
            variant="ghost-danger"
            size="icon-sm"
            onClick={() => void hapus(r)}
            title="Hapus Data"
            aria-label={`Hapus ${r.kode}`}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        ) : null}
      </>
    );
  }

  return (
    <>
      <ResourceListPage<Row>
        title="Data Penjualan"
        description="Penjualan produk dan perawatan"
        endpoint="/penjualan"
        queryKey="penjualan"
        columns={columns}
        createLabel="Buat Penjualan"
        // There is no PUT /penjualan/:id; sales change only through the cashier or status actions.
        enableEdit={false}
        enableDelete={false}
        customRowActions={rowActions}
        filterParams={filters.params}
        onSearchChange={filters.setSearch}
        summary={<PenjualanOverview filters={filters} />}
        createFields={[
          {
            name: "pasien_id",
            label: "ID Pasien",
            type: "number",
            required: true,
            placeholder: "1",
          },
          {
            name: "staff_id",
            label: "ID Staff Kasir",
            type: "number",
            required: true,
            placeholder: "1",
          },
          { name: "tanggal", label: "Tanggal", type: "date", required: true },
          {
            name: "barang_id",
            label: "ID Barang",
            type: "number",
            required: true,
            placeholder: "1",
          },
          {
            name: "qty",
            label: "Qty",
            type: "number",
            required: true,
            placeholder: "1",
          },
          {
            name: "harga_jual",
            label: "Harga Jual",
            type: "currency",
            required: true,
            placeholder: "120000",
          },
          {
            name: "status",
            label: "Status",
            type: "select",
            options: [
              { label: "Draft", value: "draft" },
              { label: "Ke Kasir", value: "confirmed" },
            ],
          },
          { name: "keterangan", label: "Keterangan" },
        ]}
        transformCreateBody={(v) => {
          const qty = Number(v.qty || 1);
          const harga = Number(v.harga_jual || 0);
          return {
            pasien_id: Number(v.pasien_id),
            staff_id: Number(v.staff_id),
            tanggal: v.tanggal || today,
            status: v.status || "draft",
            keterangan: v.keterangan || "",
            details: [
              {
                barang_id: Number(v.barang_id),
                qty,
                harga_jual: harga,
              },
            ],
          };
        }}
      />
      <VoidPenjualanDialog
        target={voidTarget}
        onClose={() => setVoidTarget(null)}
      />
      {confirmDialog}
    </>
  );
}
