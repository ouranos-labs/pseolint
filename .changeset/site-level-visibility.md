---
"@pseolint/web": minor
---

Move the publish control from the report to the site, and make it stick.

Publishing was per-audit and reachable only by opening a report. Every path
that creates an audit for a monitored domain hardcoded `isPublic: false`: the
three dashboard actions, the kickoff crawl in `lib/monitoring.ts`, and the
`monitor-domains` cron. So publishing a report worked until the next scheduled
run minted a fresh private audit, and the site silently dropped off the
leaderboard. The symptom read as "the leaderboard is broken".

`monitored_domain` gains an `is_public` column (migration 0023, default false)
and all five insert paths inherit it, so the choice survives re-audits. The
control now lives on `/dashboard/[host]` as a "Site visibility" card; a report
for a monitored domain links there instead of offering a toggle that only sets
one row. One-off audits keep their per-report toggle, having no site page.

Publishing also extends retention. `run-audit` stamps permanent expiry only for
audits eligible AT COMPLETION, and monitored audits complete private, so
existing rows still carried a 30/90-day expiry: without this a freshly published
site would list and then vanish when that clock ran out.

The card states the leaderboard consequence before the click rather than after,
and shows the two further bars (at least 5 pages, risk below 40) with whether
this site currently meets them, so "public but not listed" is explained instead
of looking broken.

Also fixes a mangled tooltip on the report toggle, where an em-dash rewrite had
moved a parenthesis across a ternary and produced "This report is public
(anyone with the link can view it".
