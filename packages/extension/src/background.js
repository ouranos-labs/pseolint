// pseolint extension — background service worker.
// Architecture: docs/extension-architecture.md §3. This worker is the ONLY
// component permitted to make network requests (single, auditable egress).
// ponytail: skeleton only — no egress, no content scripts, no message bus yet.
//   Build sequence step 1: prove the manifest permission model + CSP load clean.
//   Add the egress client + signals allowlist guard when step 2/3 needs them.
chrome.runtime.onInstalled.addListener(() => {
  console.log("pseolint extension installed");
});
