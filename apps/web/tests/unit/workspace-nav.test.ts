import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import path from "node:path";
import {
  activeWorkspaceTab,
  WORKSPACE_TABS,
} from "@/app/dashboard/[host]/workspace-tabs";

const WORKSPACE_DIR = path.resolve(__dirname, "../../src/app/dashboard/[host]");

describe("activeWorkspaceTab", () => {
  it("matches the overview tab on the bare workspace path", () => {
    expect(activeWorkspaceTab("/dashboard/example.com", "example.com")).toBe("overview");
  });

  it("matches each sub-tab by its own segment", () => {
    expect(activeWorkspaceTab("/dashboard/example.com/traffic", "example.com")).toBe("traffic");
    expect(activeWorkspaceTab("/dashboard/example.com/monitoring", "example.com")).toBe("monitoring");
    expect(activeWorkspaceTab("/dashboard/example.com/settings", "example.com")).toBe("settings");
  });

  it("keeps a tab active on paths nested under it", () => {
    // A future /settings/foo drill-down should still light up Settings.
    expect(activeWorkspaceTab("/dashboard/example.com/settings/gsc", "example.com")).toBe("settings");
  });

  it("lights up no tab on the per-URL drill-down", () => {
    // Reached FROM overview, but it is not the overview: highlighting Overview
    // there would claim you are somewhere you are not.
    expect(
      activeWorkspaceTab("/dashboard/example.com/url/https%3A%2F%2Fexample.com%2Fa", "example.com"),
    ).toBeNull();
  });

  it("matches whether the pathname arrives encoded or decoded", () => {
    // Next hands back a decoded pathname on some navigations and an encoded one
    // on others; a host needing escapes must highlight either way.
    const host = "xn--bcher-kva.example";
    expect(activeWorkspaceTab(`/dashboard/${host}/traffic`, host)).toBe("traffic");
    expect(
      activeWorkspaceTab(`/dashboard/${encodeURIComponent(host)}/traffic`, host),
    ).toBe("traffic");
  });

  it("returns null outside this workspace", () => {
    expect(activeWorkspaceTab("/dashboard", "example.com")).toBeNull();
    expect(activeWorkspaceTab("/dashboard/settings", "example.com")).toBeNull();
    // A different host's workspace, and a host that merely shares a prefix.
    expect(activeWorkspaceTab("/dashboard/other.com/traffic", "example.com")).toBeNull();
    expect(activeWorkspaceTab("/dashboard/example.com.evil.test", "example.com")).toBeNull();
  });

  it("does not treat an unknown segment as a tab", () => {
    expect(activeWorkspaceTab("/dashboard/example.com/nope", "example.com")).toBeNull();
  });
});

describe("WORKSPACE_TABS", () => {
  it("points every tab at a route that exists", () => {
    // Cheap guard against a typo'd segment shipping as a tab that 404s.
    for (const tab of WORKSPACE_TABS) {
      const page = path.join(WORKSPACE_DIR, tab.segment, "page.tsx");
      expect(existsSync(page), `${tab.label} -> ${page}`).toBe(true);
    }
  });

  it("has exactly one overview tab, at the bare path", () => {
    const roots = WORKSPACE_TABS.filter((t) => t.segment === "");
    expect(roots).toHaveLength(1);
    expect(roots[0].id).toBe("overview");
  });
});
