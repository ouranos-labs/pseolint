import { describe, expect, test } from "vitest";
import { boilerplateRatioRule } from "../../../src/rules/spam/boilerplate-ratio.js";
import type { ParsedPage } from "../../../src/types.js";

function page(url: string, contentText: string): ParsedPage {
  return {
    url,
    title: "",
    metaDescription: "",
    canonical: "",
    robotsMeta: "",
    og: { title: "", description: "", image: "" },
    hreflangs: [],
    headings: { h1: [], h2: [] },
    jsonLd: [],
    authorSignals: { metaAuthor: "", schemaAuthor: false, bylineElement: false, relAuthorLink: false },
    resolvedHrefs: [],
    structureSignature: "",
    contentText,
    html: ""
  };
}

describe("boilerplateRatioRule", () => {
  test("uses >80% skeleton cutoff before flagging", () => {
    const pages = [
      page("a", "shared common baseline uniquea"),
      page("b", "shared common baseline uniqueb"),
      page("c", "shared common baseline uniquec"),
      page("d", "different topic uniqued"),
      page("e", "another angle uniquee")
    ];

    const findings = boilerplateRatioRule(pages, 0.7);
    expect(findings.length).toBe(0);
  });
});
