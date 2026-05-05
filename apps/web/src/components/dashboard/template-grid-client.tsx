"use client";
import { useEffect, useState, useCallback } from "react";
import type { Template } from "@pseolint/core";
import { TemplateGrid } from "@/components/audit/template-card";

const HASH_PREFIX = "#template=";

function encodeHash(sig: string): string {
  return HASH_PREFIX + encodeURIComponent(sig);
}

function decodeHash(): string | null {
  if (typeof window === "undefined") return null;
  const h = window.location.hash;
  if (!h.startsWith(HASH_PREFIX)) return null;
  try {
    return decodeURIComponent(h.slice(HASH_PREFIX.length));
  } catch {
    return null;
  }
}

export interface TemplateGridClientProps {
  templates: Template[];
  totalDiscoveredUrls: number;
}

/**
 * Client wrapper that manages the URL-hash–based drill-down state for the
 * template grid. Reads the initial selection from `window.location.hash` so
 * the filter survives a reload. Exposes the selected signature via a custom
 * event (`template-selected`) so the FindingsPanel below it can filter.
 */
export function TemplateGridClient({
  templates,
  totalDiscoveredUrls,
}: TemplateGridClientProps) {
  const [selected, setSelected] = useState<string | null>(null);

  // Restore from hash on mount.
  useEffect(() => {
    setSelected(decodeHash());
  }, []);

  const handleDrillDown = useCallback((sig: string) => {
    const next = selected === sig ? null : sig;
    setSelected(next);
    if (next === null) {
      history.pushState(null, "", window.location.pathname + window.location.search);
    } else {
      history.pushState(null, "", encodeHash(next));
    }
    // Dispatch event so sibling components (FindingsPanel) can react.
    window.dispatchEvent(
      new CustomEvent("template-selected", { detail: { signature: next } }),
    );
  }, [selected]);

  return (
    <div className="flex flex-col gap-2">
      {selected && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>
            Filtered to{" "}
            <span className="font-mono text-foreground">{selected}</span>
          </span>
          <button
            type="button"
            onClick={() => handleDrillDown(selected)}
            className="ml-1 text-primary hover:underline"
          >
            Clear filter
          </button>
        </div>
      )}
      <TemplateGrid
        templates={templates}
        totalDiscoveredUrls={totalDiscoveredUrls}
        onDrillDown={handleDrillDown}
        selectedSignature={selected}
      />
    </div>
  );
}
