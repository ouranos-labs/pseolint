---
type: pSEO Audit Rule
title: "Image Alt Text — Catching Content Images That Ship With No Description"
description: "Content-bearing images missing alt text fail WCAG and lose Google Images traffic. How content/image-alt-text scans every <img>, honors decorative exceptions, and reports per page."
resource: https://pseolint.dev/rules/image-alt-text
ruleId: "content/image-alt-text"
tags: [content, "image alt text SEO"]
timestamp: 2026-06-17T06:37:51.696Z
---

# Image Alt Text — Catching Content Images That Ship With No Description

> content/image-alt-text scans every <img> tag on a page, skips images you have explicitly marked decorative, and reports each URL where a content-bearing image carries no alt attribute at all — the accessibility gap WCAG 2.1 has required closing under success criterion 1.1.1 since June 5, 2018 and the one that keeps a page out of Google Images.

_Rule `content/image-alt-text` · [live explainer](https://pseolint.dev/rules/image-alt-text)_

# What it detects
content/image-alt-text reads every <img> tag in a page's HTML and asks one question of each: is this image content-bearing, and if so does it have an alt attribute at all? The rule parses the tag's attributes, then skips any image you have deliberately marked as decorative — role="presentation" or role="none", aria-hidden="true", or an explicit empty alt="". An empty alt is treated as an intentional signal that the image carries no information, so it is accepted, never flagged.

The rule fires only when the alt attribute is entirely missing from a content-bearing image — not when it is present but short, and not on images you told it to ignore. For each page it counts how many qualifying images lack alt, divides by the total content-bearing images on that page, and emits one summary finding per URL rather than one line per image. A sample of up to three image sources is attached so you can find the offenders fast.

Severity scales with how widespread the gap is on the page: when at least half of a page's content images are missing alt the finding is a warning; below that ratio it drops to info, on the logic that a single stray image is a smaller signal than a template that never binds the slot.

# Why it matters
Alt text is the only description a screen reader, a slow connection, or a crawler has when the pixels do not load. WCAG 2.1 success criterion 1.1.1 (Non-text Content) requires a text alternative for every image that conveys information, which is why a missing alt is both an accessibility defect and, in many jurisdictions, a legal exposure. The same string is what Google Images indexes against — a product shot with no alt is a product shot Google cannot read, and the image-search traffic that would have found it goes to a competitor whose markup is complete.

For a programmatic site the failure is rarely one careless image. It is a template whose alt slot was left at a literal default — or left blank — and then iterated across every page in the catalog, so a single missing binding becomes thousands of undescribed images at once. That is exactly the shape this rule is built to surface: a per-page ratio that climbs toward 100% across a cluster is the tell that the data source never fed the alt attribute, the same way it feeds the heading and the body copy.

The fix costs almost nothing in content terms. Binding a real, per-image description from the same data the rest of the page already uses closes the accessibility gap and opens the Google Images channel in one edit.

# Failing example
/catalog/giclee-print-harbor-fog — a fine-art listing whose hero image renders as <img src="/img/harbor-fog.jpg"> with no alt attribute, alongside three thumbnail crops that are also missing it. The template iterates this same shape across all 1,800 prints in the shop, so every listing ships four undescribed content images. On this page four of four content-bearing images lack alt, a ratio of 100%, and the rule fires at warning severity naming the page and the first three image sources.

# Passing example
/catalog/giclee-print-harbor-fog — the same listing after the template binds alt from the print record: <img src="/img/harbor-fog.jpg" alt="Harbor Fog giclee print, 24x36 inch edition of 50 on archival cotton rag">. The decorative divider graphic between sections is marked aria-hidden="true" so the rule correctly skips it, and a purely ornamental flourish carries alt="" on purpose. Zero content images are missing alt, the finding does not fire, and Google Images can now read every shot in the gallery.

# How to fix
- Add a descriptive alt attribute to every content-bearing <img> that conveys information — describe what the image shows, not the file name, and keep it to a natural phrase a screen reader can speak.
- For purely decorative images — dividers, background flourishes, spacer graphics — set alt="" explicitly or add aria-hidden="true" so the rule recognises the omission as intentional rather than forgotten.
- In a pSEO template, bind the alt text from the same data source that fills the rest of the page — the product name, the city, the edition size — so each generated image gets its own description instead of a static default.
- Never leave a templated alt at a literal placeholder like alt="image" or the entity name alone; a default that repeats across every page is its own duplicate-content tell even though it technically passes this rule.
- Re-run the audit after fixing the template binding — because the finding is per page, a single corrected template binding clears the warning across the entire catalog at once.
- Spot-check with a screen reader or the browser accessibility tree to confirm the descriptions actually make sense when read aloud, not just that the attribute is present.

# Related rules
- [thin-content](../spam/thin-content.md)
- [unique-value](../content/unique-value.md)
- [heading-structure](../content/heading-structure.md)

# Sources
- [Google Search Central — Creating helpful, reliable, people-first content](https://developers.google.com/search/docs/fundamentals/creating-helpful-content) — Google's helpful-content framework rewards pages that serve all users well, including those relying on assistive technology; content/image-alt-text skips images explicitly marked decorative via role=presentation, aria-hidden=true, or empty alt string, and only flags content-bearing images with no alt attribute at all — the gap where visual information is present but entirely inaccessible.
- [Google Search Central — Introduction to structured data markup](https://developers.google.com/search/docs/appearance/structured-data/intro-structured-data) — Schema.org's ImageObject type expects an alt-text equivalent via the description or caption property; when a content image ships with no alt attribute, Google Images cannot index it with an accurate label, and any ImageObject markup referencing that asset is effectively undescribed — content/image-alt-text's per-URL findings make these gaps actionable.
- [Google Search Central — Search Essentials](https://developers.google.com/search/docs/essentials) — Search Essentials recommends writing descriptive alt text for images so Google can understand what they depict and surface them in Image Search; content/image-alt-text reports each URL where at least one content-bearing <img> tag has no alt attribute, giving publishers a per-page remediation list rather than a site-level aggregate.
