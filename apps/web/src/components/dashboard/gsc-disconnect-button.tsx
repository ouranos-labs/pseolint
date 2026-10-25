"use client";
import { useRef, useState } from "react";
import { ConfirmDialog } from "./confirm-dialog";

/**
 * Disconnecting Search Console unbinds every domain's property, and re-binding
 * means reconnecting and picking properties again, so it is confirmed first.
 * The disconnect itself stays a plain POST to the API route (which redirects
 * back with ?gsc=disconnected for the result banner).
 */
export function GscDisconnectButton({ boundCount }: { boundCount: number }) {
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const formRef = useRef<HTMLFormElement | null>(null);

  const description =
    boundCount > 0
      ? `${boundCount} domain${boundCount === 1 ? "" : "s"} lose${boundCount === 1 ? "s" : ""} traffic weighting and ${boundCount === 1 ? "its" : "their"} property binding${boundCount === 1 ? "" : "s"}. Findings fall back to severity ranking until you reconnect and bind again.`
      : "Findings stop being weighted by Search Console traffic until you reconnect.";

  return (
    <>
      <form ref={formRef} action="/api/integrations/gsc/disconnect" method="post">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-[14px] border border-destructive/50 px-3 py-1.5 text-xs text-destructive hover:bg-destructive/10"
        >
          Disconnect
        </button>
      </form>
      <ConfirmDialog
        open={open}
        title="Disconnect Search Console?"
        description={description}
        confirmLabel="Disconnect"
        pending={submitting}
        onConfirm={() => {
          setSubmitting(true);
          formRef.current?.submit();
        }}
        onCancel={() => setOpen(false)}
      />
    </>
  );
}
