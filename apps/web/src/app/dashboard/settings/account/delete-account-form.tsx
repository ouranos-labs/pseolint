"use client";
import { useState, useTransition } from "react";
import { ConfirmDialog } from "@/components/dashboard/confirm-dialog";
import { deleteAccountAction } from "../actions";

export function DeleteAccountForm() {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const handleConfirm = () => {
    const fd = new FormData();
    fd.append("confirm", "DELETE");
    startTransition(async () => {
      await deleteAccountAction(fd);
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
      <ConfirmDialog
        open={open}
        title="Delete account?"
        description="Permanently deletes your account, all audits, monitored domains, and history. Billing is canceled at next period boundary. This cannot be undone."
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
