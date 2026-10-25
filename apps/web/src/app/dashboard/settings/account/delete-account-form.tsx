"use client";
import { useState, useTransition } from "react";
import { ConfirmDialog } from "@/components/dashboard/confirm-dialog";
import { deleteAccountAction } from "../actions";

export function DeleteAccountForm({ billingCopy }: { billingCopy: string }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const handleConfirm = () => {
    const fd = new FormData();
    fd.append("confirm", "DELETE");
    setError(null);
    startTransition(async () => {
      // Success redirects away; a returned value means nothing was deleted.
      const res = await deleteAccountAction(fd);
      if (res?.error) {
        setError(res.error);
        setOpen(false);
      }
    });
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-4 inline-flex h-10 items-center rounded-[14px] bg-destructive px-4 text-sm font-medium text-destructive-foreground hover:bg-destructive/90"
      >
        Delete account
      </button>
      {error && (
        <p role="alert" className="mt-3 text-xs text-destructive">
          {error}
        </p>
      )}
      <ConfirmDialog
        open={open}
        title="Delete account?"
        description={["Permanently deletes your account, all audits, monitored domains, and history.", billingCopy, "This cannot be undone."].filter(Boolean).join(" ")}
        confirmWord="DELETE"
        confirmLabel="Delete account"
        danger
        pending={pending}
        onConfirm={handleConfirm}
        onCancel={() => setOpen(false)}
      />
    </>
  );
}
