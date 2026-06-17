import { describe, it, expect } from "vitest";
import { detectClientFrameworkFromHtml, countInteractive } from "../src/framework-detect.js";

describe("detectClientFrameworkFromHtml", () => {
  it("detects Next.js from streaming marker", () => {
    expect(detectClientFrameworkFromHtml('<script>self.__next_f.push([1,"x"])</script>')).toBe("nextjs");
  });
  it("detects Next.js from static chunk path", () => {
    expect(detectClientFrameworkFromHtml('<script src="/_next/static/chunks/main.js"></script>')).toBe("nextjs");
  });
  it("detects astro and vite", () => {
    expect(detectClientFrameworkFromHtml("<astro-island></astro-island>")).toBe("astro");
    expect(detectClientFrameworkFromHtml('<script type="module" src="/@vite/client"></script>')).toBe("vite");
  });
  it("detects bare React mount", () => {
    expect(detectClientFrameworkFromHtml('<div id="root"></div><script src="/bundle.js"></script>')).toBe("react");
  });
  it("returns null for plain server HTML", () => {
    expect(detectClientFrameworkFromHtml("<html><body><h1>Hi</h1><p>words</p></body></html>")).toBeNull();
  });
});

describe("countInteractive", () => {
  it("counts form controls", () => {
    expect(countInteractive("<form><input><textarea></textarea><button>Go</button></form>")).toBe(4);
  });
  it("returns 0 for a shell", () => {
    expect(countInteractive('<div id="__next"></div>')).toBe(0);
  });
});
