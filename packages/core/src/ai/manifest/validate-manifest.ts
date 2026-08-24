import type { FixManifest } from "../orchestrator/finish-tool.js";
import { validatePageChange, validateDomainPatch } from "./validators/index.js";

export interface PatchValidationFailure {
  /** Where in the manifest the failed patch lives. Used by the manifest UI to highlight + drop. */
  location:
    | { kind: "page_patch"; pageIndex: number; changeIndex: number; pageUrl: string; patchType: string }
    | { kind: "template_patch"; templateIndex: number; exampleIndex: number; changeIndex: number; templateId: string; patchType: string }
    | { kind: "domain_patch"; index: number; patchType: string };
  reason: string;
}

export interface ManifestValidationReport {
  totalPatches: number;
  validPatches: number;
  failures: PatchValidationFailure[];
}

/**
 * Walk every patch in the manifest and return a per-failure report. Does
 * NOT mutate the manifest: the caller decides what to do (drop failed
 * patches, surface them in a "rejected" section, retry the LLM with
 * feedback). Phase 4's manifest-finalization step will use this to filter
 * the manifest before persistence.
 */
export function validateManifest(manifest: FixManifest): ManifestValidationReport {
  const failures: PatchValidationFailure[] = [];
  let total = 0;

  manifest.pages.forEach((page, pageIndex) => {
    page.changes.forEach((change, changeIndex) => {
      total += 1;
      const result = validatePageChange(change);
      if (!result.valid) {
        failures.push({
          location: {
            kind: "page_patch",
            pageIndex,
            changeIndex,
            pageUrl: page.url,
            patchType: change.type,
          },
          reason: result.reason,
        });
      }
    });
  });

  manifest.templates.forEach((template, templateIndex) => {
    template.examples.forEach((example, exampleIndex) => {
      example.changes.forEach((change, changeIndex) => {
        total += 1;
        const result = validatePageChange(change);
        if (!result.valid) {
          failures.push({
            location: {
              kind: "template_patch",
              templateIndex,
              exampleIndex,
              changeIndex,
              templateId: template.templateId,
              patchType: change.type,
            },
            reason: result.reason,
          });
        }
      });
    });
  });

  manifest.domainLevel.forEach((patch, index) => {
    total += 1;
    const result = validateDomainPatch(patch);
    if (!result.valid) {
      failures.push({
        location: { kind: "domain_patch", index, patchType: patch.type },
        reason: result.reason,
      });
    }
  });

  return {
    totalPatches: total,
    validPatches: total - failures.length,
    failures,
  };
}
