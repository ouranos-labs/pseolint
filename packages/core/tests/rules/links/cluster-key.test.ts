import { describe, expect, test } from "vitest";
import { clusterKeyForUrl } from "../../../src/rules/links/cluster-key.js";

// cluster-key is the shared primitive both cluster-connectivity and cluster-key
// consumers depend on to decide "same template/section?". It was untested; these
// pin the URL-normalization behavior the cluster rules rely on.
describe("clusterKeyForUrl", () => {
  test("groups siblings under the same parent directory", () => {
    expect(clusterKeyForUrl("https://s/x/1")).toBe("https://s/x/");
    expect(clusterKeyForUrl("https://s/x/2")).toBe("https://s/x/");
    expect(clusterKeyForUrl("https://s/x/1")).toBe(clusterKeyForUrl("https://s/x/99"));
  });

  test("separates different parent directories", () => {
    expect(clusterKeyForUrl("https://s/x/1")).not.toBe(clusterKeyForUrl("https://s/y/1"));
  });

  test("root and top-level pages collapse to the origin root", () => {
    expect(clusterKeyForUrl("https://s/")).toBe("https://s/");
    expect(clusterKeyForUrl("https://s/about")).toBe("https://s/");
  });

  test("ignores a trailing slash (page vs directory form are one cluster)", () => {
    expect(clusterKeyForUrl("https://s/x/1/")).toBe(clusterKeyForUrl("https://s/x/1"));
  });

  test("ignores query strings", () => {
    expect(clusterKeyForUrl("https://s/x/1?utm=2")).toBe("https://s/x/");
  });

  test("distinguishes origin (host/scheme) even for matching paths", () => {
    expect(clusterKeyForUrl("https://a/x/1")).not.toBe(clusterKeyForUrl("https://b/x/1"));
  });

  test("falls back to the raw string on an unparseable URL", () => {
    expect(clusterKeyForUrl("http://[bad")).toBe("http://[bad");
  });
});
