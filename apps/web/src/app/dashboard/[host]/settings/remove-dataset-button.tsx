"use client";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/dashboard/confirm-dialog";
import { formatNumber } from "@/lib/format";
import { removeDataSourceAction } from "./actions";

/**
 * Removing the dataset can't be undone (there's no copy kept), so it goes
 * through a confirm that names how much is about to disappear.
 */
export function RemoveDatasetButton({ host, recordCount }: { host: string; recordCount: number }) {
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function confirm() {
    setErr(null);
    start(async () => {
      const fd = new FormData();
      fd.append("domainHost", host);
      const res = await removeDataSourceAction(fd).catch(() => null);
      if (!res) { setErr("Couldn't reach the server. Check your connection and try again."); return; }
      if (!res.ok) { setErr(res.error); return; }
      setOpen(false);
      toast.success(res.message ?? "Dataset removed.");
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => { setErr(null); setOpen(true); }}
        disabled={pending}
        className="inline-flex h-9 w-fit items-center rounded-[14px] border border-destructive/50 px-3 text-xs text-destructive hover:bg-destructive/10 disabled:opacity-50"
      >
        Remove current dataset
      </button>
      <ConfirmDialog
        open={open}
        title={`Remove the dataset (${formatNumber(recordCount)} record${recordCount === 1 ? "" : "s"})?`}
        description="The data-binding rules stop checking your pages against it from the next audit. This can't be undone; you'd need to upload the file again."
        confirmLabel="Remove dataset"
        pending={pending}
        error={err}
        onConfirm={confirm}
        onCancel={() => setOpen(false)}
      />
    </>
  );
}
