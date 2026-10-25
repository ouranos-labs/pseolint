"use client";
import { createContext, startTransition, useActionState, useContext, useEffect } from "react";
import { toast } from "sonner";
import type { ActionResult } from "@/lib/action-result";
import { FormPendingContext } from "@/components/ui/submit-button";

const FormErrorContext = createContext<{ error: string; field?: string } | null>(null);

/**
 * A server-action form with the dashboard's one feedback pattern:
 *  - success: a transient toast (the action's `message`, else `successMessage`);
 *  - failure: the error inline, next to the field named by `field` (via
 *    <FieldError>) or above the submit row when it isn't field-specific;
 *  - the user's input is kept either way.
 *
 * The submit is dispatched manually rather than through `<form action>`
 * because React resets uncontrolled fields after every form action, which
 * would wipe exactly the input the error message is talking about.
 */
export function ActionForm({
  action,
  successMessage,
  className,
  children,
}: {
  action: (formData: FormData) => Promise<ActionResult>;
  successMessage?: string;
  className?: string;
  children: React.ReactNode;
}) {
  const [state, dispatch, pending] = useActionState(
    async (_prev: ActionResult | null, formData: FormData) => action(formData),
    null,
  );

  useEffect(() => {
    if (state?.ok) {
      const msg = state.message ?? successMessage;
      if (msg) toast.success(msg);
    }
  }, [state, successMessage]);

  const error = state && !state.ok ? { error: state.error, field: state.field } : null;

  return (
    <FormErrorContext.Provider value={error}>
      <FormPendingContext.Provider value={pending}>
        <form
          className={className}
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            startTransition(() => dispatch(fd));
          }}
        >
          {children}
          {error && !error.field && (
            <p role="alert" className="text-xs text-destructive">{error.error}</p>
          )}
        </form>
      </FormPendingContext.Provider>
    </FormErrorContext.Provider>
  );
}

/**
 * Renders the last submit's error when it belongs to the field `name`. Place it
 * directly under the control. Fields without one fall back to the form-level
 * message ActionForm renders, so no error is ever dropped silently: an action
 * that names a field must have a matching <FieldError> on its form.
 */
export function FieldError({ name }: { name: string }) {
  const err = useContext(FormErrorContext);
  if (!err || err.field !== name) return null;
  return (
    <p role="alert" className="mt-1 text-xs text-destructive">{err.error}</p>
  );
}
