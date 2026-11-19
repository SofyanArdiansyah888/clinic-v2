import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";
import { useState, type FormEvent, type ReactNode } from "react";
import { apiGet, apiPost } from "@/shared/api/client";
import { Dialog } from "@/shared/components/Dialog";
import { toast } from "@/shared/components/Toaster";
import { Button } from "@/shared/ui/button";
import { Field, FormAlert } from "@/shared/ui/field";
import { formatCurrency, formatNumber } from "@/shared/lib/formatters";
import { metodeLabel } from "@/shared/lib/pembayaran";
import { ShiftBelumDibukaAlert } from "@/features/pembayaran/components/ShiftBelumDibukaAlert";
import {
  SHIFT_AKTIF_KEY,
  useShiftAktif,
} from "@/features/pembayaran/kasir-shift";

/** What voiding a paid sale gives back (GET /pembayaran/penjualan/:id/batal). */
type VoidDampak = {
  penjualan_id: number;
  kode: string;
  no_invoice: string;
  status: string;
  total: number;
  refund: number;
  jenis_pembayaran: string;
  deposit_kembali: number;
  poin_kembali: number;
  barang: { barang_id: number; nama: string; qty: number }[];
  paket_dibatalkan: { id: number; kode: string; treatment_nama: string }[];
  sesi_kembali: {
    pemakaian_id: number;
    paket_kode: string;
    treatment_nama: string;
    qty: number;
  }[];
  perawatan_id: number | null;
  perawatan_kode: string;
  resep_kembali: number;
  blokir?: string;
};

export type VoidTarget = {
  id: number;
  kode: string;
  no_invoice?: string;
  pasien?: { nama?: string };
};

function errorMessage(err: unknown) {
  const msg = (err as { response?: { data?: { message?: string } } }).response
    ?.data?.message;
  return (
    msg ?? (err instanceof Error ? err.message : "Gagal membatalkan transaksi")
  );
}

function Baris({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1.5">
      <dt className="text-slate-500">{label}</dt>
      <dd className="text-right font-semibold text-slate-900">{children}</dd>
    </div>
  );
}

/** Void of a paid sale: shows everything that is given back and asks for the reason. */
export function VoidPenjualanDialog({
  target,
  onClose,
}: {
  target: VoidTarget | null;
  onClose: () => void;
}) {
  const open = Boolean(target);
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Batalkan Transaksi Lunas"
      description={
        target
          ? `${target.no_invoice || target.kode} — ${target.pasien?.nama ?? ""}`
          : undefined
      }
      className="max-w-lg"
    >
      {/* Remounted per target so the reason and options start empty each time. */}
      {target ? (
        <VoidForm key={target.id} target={target} onClose={onClose} />
      ) : null}
    </Dialog>
  );
}

function VoidForm({
  target,
  onClose,
}: {
  target: VoidTarget;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [alasan, setAlasan] = useState("");
  const [keKasir, setKeKasir] = useState(true);
  const shiftAktif = useShiftAktif();

  const dampakQuery = useQuery({
    queryKey: ["penjualan-void-dampak", target.id],
    queryFn: () =>
      apiGet<VoidDampak>(`/pembayaran/penjualan/${target.id}/batal`),
  });
  const d = dampakQuery.data?.data;

  const mutation = useMutation({
    mutationFn: () =>
      apiPost(`/pembayaran/penjualan/${target.id}/batal`, {
        alasan: alasan.trim(),
        kembalikan_ke_kasir: keKasir,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["penjualan"] });
      void queryClient.invalidateQueries({ queryKey: SHIFT_AKTIF_KEY });
      toast(
        `Transaksi ${target.no_invoice || target.kode} dibatalkan`,
        "success",
      );
      onClose();
    },
  });

  // The refund is paid out of the drawer, so the cashier must be open (the server refuses it too).
  const shiftKurang =
    (d?.refund ?? 0) > 0 && shiftAktif.checked && !shiftAktif.isOpen;
  const bisa = Boolean(d) && !d?.blokir && !shiftKurang && alasan.trim() !== "";

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (bisa) mutation.mutate();
  }

  if (dampakQuery.isLoading)
    return (
      <div className="p-5 text-xs text-slate-500">
        Menghitung dampak pembatalan...
      </div>
    );
  if (!d)
    return (
      <div className="p-5">
        <FormAlert>
          {dampakQuery.error
            ? errorMessage(dampakQuery.error)
            : "Data transaksi tidak ditemukan"}
        </FormAlert>
      </div>
    );

  return (
    <form
      onSubmit={onSubmit}
      className="space-y-4 p-5"
      data-testid="void-penjualan-form"
    >
      {d.blokir ? (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-xs text-red-800"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            <span className="font-bold">Tidak bisa dibatalkan.</span> {d.blokir}
          </p>
        </div>
      ) : null}

      <dl className="divide-y divide-slate-100 rounded-xl border border-slate-200 px-3 text-xs">
        <Baris label={`Refund ke pasien (${metodeLabel(d.jenis_pembayaran)})`}>
          <span data-testid="void-refund" className="text-rose-700">
            {formatCurrency(d.refund)}
          </span>
        </Baris>
        {d.deposit_kembali > 0 ? (
          <Baris label="Deposit dikembalikan ke saldo">
            {formatCurrency(d.deposit_kembali)}
          </Baris>
        ) : null}
        {d.poin_kembali > 0 ? (
          <Baris label="Poin dikembalikan">
            {formatNumber(d.poin_kembali)} poin
          </Baris>
        ) : null}
        {d.barang.length ? (
          <Baris label="Stok kembali ke gudang cabang">
            {d.barang.map((b) => (
              <div key={b.barang_id}>
                {b.nama} × {b.qty}
              </div>
            ))}
          </Baris>
        ) : null}
        {d.paket_dibatalkan.length ? (
          <Baris label="Paket dari transaksi ini dibatalkan">
            {d.paket_dibatalkan.map((p) => (
              <div key={p.id}>
                {p.kode} · {p.treatment_nama}
              </div>
            ))}
          </Baris>
        ) : null}
        {d.sesi_kembali.length ? (
          <Baris label="Sesi paket dikembalikan">
            {d.sesi_kembali.map((s) => (
              <div key={s.pemakaian_id}>
                {s.treatment_nama} × {s.qty} ({s.paket_kode})
              </div>
            ))}
          </Baris>
        ) : null}
        {d.perawatan_kode ? (
          <Baris label="Perawatan">
            {d.perawatan_kode}
            {d.resep_kembali ? (
              <div className="font-normal text-slate-500">
                {d.resep_kembali} resep kembali ke draft
              </div>
            ) : null}
          </Baris>
        ) : null}
        <Baris label="Jurnal penjualan">Dibalik (reversal)</Baris>
      </dl>

      {d.perawatan_id ? (
        <label className="flex items-start gap-2 text-xs text-slate-700">
          <input
            type="checkbox"
            checked={keKasir}
            onChange={(e) => setKeKasir(e.target.checked)}
            className="mt-0.5 h-3.5 w-3.5 accent-rose-600"
          />
          <span>
            Kembalikan perawatan ke antrean kasir agar bisa ditagih ulang. Jika
            tidak dicentang, perawatan dan antrean ikut dibatalkan.
          </span>
        </label>
      ) : null}

      <Field label="Alasan pembatalan" htmlFor="void-alasan" required>
        <textarea
          id="void-alasan"
          value={alasan}
          onChange={(e) => setAlasan(e.target.value)}
          rows={3}
          required
          className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs focus:border-rose-500 focus:outline-none"
          placeholder="Mis. salah input item, pasien batal"
        />
      </Field>

      {shiftKurang ? <ShiftBelumDibukaAlert /> : null}
      <FormAlert>
        {mutation.error ? errorMessage(mutation.error) : null}
      </FormAlert>

      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={onClose}
          className="flex-1"
        >
          Kembali
        </Button>
        <Button
          type="submit"
          variant="destructive"
          disabled={!bisa || mutation.isPending}
          className="flex-1"
        >
          {mutation.isPending ? "Membatalkan..." : "Batalkan Transaksi"}
        </Button>
      </div>
    </form>
  );
}
