"use client";
import { useState, useEffect, useRef } from "react";

type Props = {
  open: boolean;
  title: string;
  description: string;
  confirmWord?: string;
  confirmLabel?: string;
  danger?: boolean;
  pending?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

/**
 * Typed-confirm modal for destructive + irreversible actions. When `confirmWord`
 * is provided, the confirm button enables only after the user types the exact
 * word (case-sensitive).
 */
export function ConfirmDialog({
  open, title, description, confirmWord, confirmLabel = "Confirm",
  danger = true, pending = false, onConfirm, onCancel,
}: Props) {
  const [typed, setTyped] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (open) {
      setTyped("");
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  if (!open) return null;

  const confirmEnabled = !pending && (confirmWord ? typed === confirmWord : true);
  const btnClass = danger
    ? "inline-flex h-10 items-center rounded-[14px] bg-destructive px-4 text-sm font-medium text-destructive-foreground hover:bg-destructive/90 disabled:opacity-40"
    : "inline-flex h-10 items-center rounded-[14px] bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-40";

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-background/70 p-5 backdrop-blur-sm"
      onClick={onCancel}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-full max-w-md rounded-[22px] border border-border/70 bg-background p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-base font-medium text-foreground">{title}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{description}</p>
        {confirmWord && (
          <label className="mt-4 flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">
              Type <code className="font-mono text-foreground">{confirmWord}</code> to confirm.
            </span>
            <input
              ref={inputRef}
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              className="rounded-[10px] border border-border-strong bg-background px-3 py-2 text-sm font-mono"
              autoComplete="off"
              spellCheck={false}
            />
          </label>
        )}
        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={pending}
            className="inline-flex h-10 items-center rounded-[14px] border border-border-strong px-4 text-sm hover:bg-secondary disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={!confirmEnabled}
            className={btnClass}
          >
            {pending ? "Working…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
