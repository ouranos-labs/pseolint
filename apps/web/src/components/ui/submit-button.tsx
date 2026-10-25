"use client";
import { createContext, useContext } from "react";
import { useFormStatus } from "react-dom";

/**
 * Pending flag for forms that dispatch their action manually (see
 * components/dashboard/action-form.tsx). useFormStatus only sees submissions
 * that go through `<form action>`, so those forms publish their pending state
 * here instead.
 */
export const FormPendingContext = createContext(false);

/**
 * Submit button for server-action forms: disabled with a pending label while
 * the submission is in flight, so a slow action can't be double-submitted and
 * the user can see that something is happening. Styling stays with the caller.
 */
export function SubmitButton({
  children,
  pendingLabel = "Saving…",
  className,
  disabled,
  name,
  value,
}: {
  children: React.ReactNode;
  pendingLabel?: string;
  className?: string;
  disabled?: boolean;
  name?: string;
  value?: string;
}) {
  const { pending: formPending } = useFormStatus();
  const ctxPending = useContext(FormPendingContext);
  const pending = formPending || ctxPending;
  return (
    <button
      type="submit"
      name={name}
      value={value}
      disabled={pending || disabled}
      aria-busy={pending || undefined}
      className={`${className ?? ""} disabled:cursor-not-allowed disabled:opacity-60`}
    >
      {pending ? pendingLabel : children}
    </button>
  );
}
