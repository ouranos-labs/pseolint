import { redirect } from "next/navigation";
import { getOptionalSession } from "@/lib/session";
import { deleteAccountAction } from "../actions";

export default async function AccountSettings() {
  const session = await getOptionalSession();
  if (!session) redirect("/signin");
  return (
    <div className="flex max-w-xl flex-col gap-6">
      <h1 className="text-xl font-medium">Account</h1>
      <div className="rounded-[22px] border border-border/60 p-5">
        <dl className="grid grid-cols-[120px_1fr] gap-y-2 text-sm">
          <dt className="text-muted-foreground">Email</dt>
          <dd className="text-foreground">{session.user.email}</dd>
        </dl>
      </div>
      <div className="rounded-[22px] border border-border/60 p-5">
        <h2 className="text-sm font-medium text-foreground">Export my data</h2>
        <p className="mt-2 text-xs text-muted-foreground">
          Download a JSON dump of everything we store against your account — audits, monitored domains, findings,
          usage, and settings. Excludes credentials and billing identifiers.
        </p>
        <a
          href="/api/account/export"
          className="mt-3 inline-flex h-9 items-center rounded-[14px] border border-border-strong px-3 text-xs hover:bg-secondary"
        >
          Download JSON
        </a>
      </div>
      <div className="rounded-[22px] border border-destructive/40 p-5">
        <h2 className="text-sm font-medium text-destructive">Delete account</h2>
        <p className="mt-2 text-xs text-muted-foreground">
          Permanently deletes your account, all audits, monitored domains, and history.
          Billing is canceled at next period boundary.
        </p>
        <form action={deleteAccountAction} className="mt-4 flex items-center gap-2">
          <input name="confirm" placeholder='Type "DELETE"' className="rounded-[10px] border border-destructive/50 bg-background px-3 py-2 text-sm" />
          <button type="submit" className="inline-flex h-9 items-center rounded-[14px] bg-destructive px-3 text-xs font-medium text-destructive-foreground hover:bg-destructive/90">Delete account</button>
        </form>
      </div>
    </div>
  );
}
