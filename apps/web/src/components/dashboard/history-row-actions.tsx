"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteAuditAction } from "@/app/dashboard/audit-actions";
import { ConfirmDialog } from "./confirm-dialog";

export function HistoryRowActions({ slug, sourceUrl }: { slug: string; sourceUrl: string }) {
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  let host = sourceUrl;
  try { host = new URL(sourceUrl).host; } catch { /* leave raw */ }

  function confirmDelete() {
    start(async () => {
      const res = await deleteAuditAction(slug);
      if (!res.ok) { setErr(res.error); return; }
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <button
        onClick={() => { setErr(null); setOpen(true); }}
        className="rounded-[12px] border border-border/60 px-3 py-1 text-xs text-muted-foreground hover:border-destructive/50 hover:text-destructive"
        aria-label={`Delete audit of ${host}`}
      >
        Delete
      </button>
      <ConfirmDialog
        open={open}
        title="Delete this audit?"
        description={`Removes the audit of ${host} and its report. This cannot be undone.${err ? `\n\nError: ${err}` : ""}`}
        confirmWord="DELETE"
        confirmLabel="Delete audit"
        danger
        pending={pending}
        onConfirm={confirmDelete}
        onCancel={() => setOpen(false)}
      />
    </>
  );
}
